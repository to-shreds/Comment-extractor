import * as pdfjsLib from '../vendor/pdfjs/pdf.mjs';
import DOMPurify from '../vendor/dompurify/purify.es.mjs';
import { marked } from '../vendor/marked/marked.esm.js';
import {
  WORKBENCH_VERSION, assertSafeFiles, contextualSuggestions, detectFormat,
  escapeHtml, extensionOf, formatLabel, humanBytes, parsePageRanges,
  productFilename, safeFilename, yieldToMain
} from './workbench-core.mjs';
import {
  addPdfMarks, containsRawString, createPdfFromImages, createTextPdf,
  extractPdf, fillAndFlattenPdf, inspectPdfStructure, loadPdf, mergePdfInputs,
  optimizePdf, overlaySearchText, pdfBlob, repairPdf, reorderPdf,
  replacePagesWithRasters, sanitizePdf, splitPdf
} from './pdf-engine.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;

const PDFJS_DOCUMENT_OPTIONS = Object.freeze({
  cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
  wasmUrl: new URL('../vendor/pdfjs/wasm/', import.meta.url).href,
  iccUrl: new URL('../vendor/pdfjs/iccs/', import.meta.url).href,
  isEvalSupported: false,
  enableXfa: false,
  disableAutoFetch: true,
  disableStream: true,
  useWorkerFetch: false
});

function pdfjsDocumentOptions(data, overrides = {}) {
  return { ...PDFJS_DOCUMENT_OPTIONS, data, ...overrides };
}

const $ = (id) => document.getElementById(id);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const MAX_PDF_PAGES = 2000;
const MAX_RENDER_PIXELS = 32_000_000;

const app = {
  route: 'home',
  homeFiles: [],
  toolTab: 'binder',
  result: null,
  resultTab: 'redline',
  resultChangeIndex: 0,
  currentJob: null,
  urls: new Set(),
  cleanWordFile: null,
  pickerHandles: new Map()
};

const pdfState = {
  file: null,
  originalBytes: null,
  bytes: null,
  document: null,
  loadingTask: null,
  pageCount: 0,
  current: 0,
  order: [],
  rotations: {},
  undo: [],
  textCache: new Map(),
  textItems: new Map(),
  renderTask: null,
  renderToken: 0,
  thumbnailToken: 0,
  tab: 'review',
  dirty: false,
  redactions: new Map(),
  drawing: false,
  drawStart: null,
  inspection: null,
  ocrWorker: null,
  saveHandle: null
};

const toolState = {
  binder: [],
  convert: [],
  batch: [],
  batchResults: [],
  inspectorFiles: []
};

const SUGGESTIONS = {
  'review-word': ['Open for Review', 'review-word'],
  'clean-word': ['Create Clean Copy', 'clean-word'],
  inspect: ['Inspect Document', 'inspect'],
  'compare-documents': ['Compare Documents', 'compare-documents'],
  'combine-commentary': ['Combine Commentary', 'combine-commentary'],
  batch: ['Batch Tools', 'batch'],
  'open-pdf': ['Open PDF', 'open-pdf'],
  ocr: ['Make Searchable', 'ocr'],
  redact: ['Secure Redaction', 'redact'],
  'combine-pdfs': ['Combine PDFs', 'binder'],
  binder: ['Create Binder', 'binder'],
  convert: ['Convert Files', 'convert']
};

function init() {
  bindWorkbenchEvents();
  switchRoute('home');
  renderHomeSelection();
  renderToolQueue('binder');
  renderToolQueue('convert');
  renderToolQueue('batch');
  registerServiceWorker();
  exposeWorkbenchApi();
}

function bindWorkbenchEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('commentmaster:word-opened', () => switchRoute('word'));
  window.addEventListener('commentmaster:word-closed', () => {
    if (app.route === 'word') switchRoute('word');
  });
  window.addEventListener('beforeunload', (event) => {
    if (!hasPendingPdfWork()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  bindDropZone($('home-drop-zone'), (files) => stageHomeFiles(files));
  bindDropZone($('pdf-empty'), (files) => {
    const pdf = Array.from(files).find((file) => detectFormat(file) === 'pdf');
    if (pdf) openPdfFile(pdf);
    else showError('Drop a PDF into the PDF workspace.');
  });
  document.querySelectorAll('.tool-source-zone').forEach((zone) => bindDropZone(zone, (files) => {
    const pane = zone.closest('[data-tool-pane]');
    if (!pane) return;
    const tab = pane.dataset.toolPane;
    if (tab === 'inspect') inspectFiles(Array.from(files));
    else if (tab === 'clean-word') setCleanWordFile(Array.from(files).find((file) => detectFormat(file) === 'docx'));
    else addToolFiles(tab, files);
  }));

  const redactionLayer = $('redaction-layer');
  redactionLayer.addEventListener('pointerdown', beginRedactionBox);
  redactionLayer.addEventListener('pointermove', updateRedactionBox);
  redactionLayer.addEventListener('pointerup', finishRedactionBox);
  redactionLayer.addEventListener('pointercancel', cancelRedactionBox);
  $('pdf-text-layer').addEventListener('mouseup', markSelectedPdfText);
  $('result-download').addEventListener('click', () => runGuarded(saveCurrentResult()));
  $('progress-dialog').addEventListener('cancel', (event) => {
    if (!app.currentJob) return;
    event.preventDefault();
    cancelCurrentJob();
  });
}

async function handleClick(event) {
  if (event.target.closest('#global-navigation')) closeNavigation();
  const routeButton = event.target.closest('[data-route-target]');
  if (routeButton) {
    switchRoute(routeButton.dataset.routeTarget);
    return;
  }
  const pdfTab = event.target.closest('[data-pdf-tab]');
  if (pdfTab) {
    switchPdfTab(pdfTab.dataset.pdfTab);
    return;
  }
  const toolTab = event.target.closest('[data-tool-tab]');
  if (toolTab) {
    switchToolTab(toolTab.dataset.toolTab);
    return;
  }
  const actionButton = event.target.closest('[data-wb-action]');
  if (!actionButton) return;
  event.preventDefault();
  try {
    await runAction(actionButton.dataset.wbAction, actionButton);
  } catch (error) {
    if (error && error.name === 'AbortError') showStatus('Operation cancelled.');
    else showError(friendlyError(error));
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.matches('input[type="file"]')) { runGuarded(handleFileInput(target)); return; }
  if (target.id === 'pdf-zoom') runGuarded(renderPdfPage());
  if (target.id === 'sanitize-preset') applySanitizePreset(target.value);
  if (target.closest('#pdf-form-fields')) return;
  if (target.closest('#clean-word-preview') || target.closest('[data-tool-pane="clean-word"] fieldset')) runGuarded(renderCleanWordPreview());
}

function handleKeydown(event) {
  if (event.key === 'Escape' && $('nav-toggle').getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    closeNavigation(true);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && app.route === 'pdf' && pdfState.file) {
    event.preventDefault();
    runGuarded(exportWorkingPdf());
    return;
  }
  if (event.key === 'Escape' && pdfState.drawing) setRedactionDrawing(false);
  if (app.route === 'pdf' && !event.ctrlKey && !event.metaKey && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) {
    if (event.key === 'PageDown' || event.key === 'ArrowRight') { event.preventDefault(); changePdfPage(1); }
    if (event.key === 'PageUp' || event.key === 'ArrowLeft') { event.preventDefault(); changePdfPage(-1); }
  }
}

function runGuarded(operation) {
  return Promise.resolve(operation).catch((error) => {
    if (error && error.name === 'AbortError') showStatus('Operation cancelled.');
    else showError(friendlyError(error));
  });
}

async function runAction(action, button) {
  const actions = {
    privacy: () => openDialog($('privacy-dialog')),
    'close-dialog': () => closeOwningDialog(button),
    'toggle-navigation': toggleNavigation,
    'toggle-pdf-more': togglePdfMore,
    'open-files': chooseHomeFiles,
    'open-word-file': openWordFromSelectionOrPicker,
    'open-pdf-file': openPdfFromSelectionOrPicker,
    'clear-selection': () => stageHomeFiles([]),
    'open-compare': () => openCompare('documents'),
    'choose-task': () => chooseTask(button.dataset.task),
    'clean-word': () => chooseTask('clean-word'),
    'pdf-prev': () => changePdfPage(-1),
    'pdf-next': () => changePdfPage(1),
    'pdf-search': searchPdf,
    'pdf-go-ocr': () => switchPdfTab('ocr'),
    'pdf-rotate-left': () => changePageRotation(-90),
    'pdf-rotate-right': () => changePageRotation(90),
    'pdf-duplicate': duplicateCurrentPage,
    'pdf-delete': deleteCurrentPage,
    'pdf-reverse': reversePages,
    'pdf-undo': undoPageChange,
    'pdf-extract': extractSelectedPages,
    'pdf-split': splitEveryPage,
    'pdf-add-marks': addMarksToPdf,
    'pdf-ocr': runOcr,
    'redaction-draw': () => setRedactionDrawing(!pdfState.drawing),
    'redaction-find': findRedactionMatches,
    'redaction-clear': clearRedactions,
    'redaction-apply': applySecureRedactions,
    'pdf-sanitize': sanitizeWorkingPdf,
    'pdf-inspect': inspectWorkingPdf,
    'pdf-normalize': normalizeWorkingPdf,
    'pdf-optimize': optimizeWorkingPdf,
    'pdf-save-form': () => savePdfForm(false, false),
    'pdf-flatten-form': () => savePdfForm(true, false),
    'pdf-reset-form': () => savePdfForm(false, true),
    'export-pdf': exportWorkingPdf,
    'binder-add': () => chooseToolFiles('binder'),
    'binder-build': buildBinder,
    'convert-add': () => chooseToolFiles('convert'),
    'convert-run': convertQueuedFiles,
    'batch-add': () => chooseToolFiles('batch'),
    'batch-run': runBatch,
    'batch-download-zip': downloadBatchZip,
    'inspect-add': chooseInspectorFiles,
    'clean-word-choose': chooseCleanWordFile,
    'clean-word-current': useCurrentWordForClean,
    'clean-word-run': createCleanWordCopy,
    'clear-workspace': clearLocalWorkspace,
    'clear-optional-cache': clearOptionalCaches,
    'cancel-job': cancelCurrentJob,
    'result-prev-change': () => navigateResultChange(-1),
    'result-next-change': () => navigateResultChange(1),
    'remove-queued-file': () => removeQueuedFile(button.dataset.queue, Number(button.dataset.index)),
    'remove-redaction': () => removeRedaction(Number(button.dataset.page), button.dataset.id),
    'suggestion': () => activateSuggestion(button.dataset.suggestion)
  };
  if (actions[action]) return actions[action]();
}

function switchRoute(route) {
  if (!['home', 'word', 'pdf', 'tools'].includes(route)) route = 'home';
  app.route = route;
  document.querySelectorAll('[data-route-view]').forEach((view) => {
    if (view.dataset.routeView !== route) view.hidden = true;
    else if (route === 'word') {
      const loaded = Boolean(window.CommentMasterWord && window.CommentMasterWord.hasDocument());
      view.hidden = view.id === 'workspace' ? !loaded : loaded;
    } else view.hidden = false;
  });
  document.querySelectorAll('[data-route-target]').forEach((button) => {
    if (button.dataset.routeTarget === route) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-route-actions]').forEach((group) => { group.hidden = group.dataset.routeActions !== route; });
  document.body.dataset.route = route;
  closeNavigation();
  const heading = document.querySelector(`[data-route-view="${route}"]:not([hidden]) h2`);
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

function toggleNavigation() {
  const toggle = $('nav-toggle');
  const navigation = $('global-navigation');
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('open', open);
  if (open) {
    const first = navigation.querySelector('button:not([hidden]), a[href]:not([hidden])');
    if (first) first.focus();
  }
}

function closeNavigation(restoreFocus = false) {
  $('nav-toggle').setAttribute('aria-expanded', 'false');
  $('global-navigation').classList.remove('open');
  if (restoreFocus) $('nav-toggle').focus();
}

function switchPdfTab(tab) {
  if (!['review', 'pages', 'ocr', 'redact', 'clean', 'forms', 'export'].includes(tab)) tab = 'review';
  if (['clean', 'forms'].includes(tab)) togglePdfMore(true);
  pdfState.tab = tab;
  document.querySelectorAll('[data-pdf-tab]').forEach((button) => {
    const active = button.dataset.pdfTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('[data-pdf-pane]').forEach((pane) => { pane.hidden = pane.dataset.pdfPane !== tab; });
  $('redaction-layer').hidden = tab !== 'redact';
  if (tab !== 'redact') setRedactionDrawing(false);
  if (tab === 'clean' && pdfState.file) runGuarded(inspectWorkingPdf());
  if (tab === 'forms' && pdfState.file) runGuarded(renderPdfForms());
}

function togglePdfMore(force) {
  const panel = $('pdf-more-tabs');
  const toggle = $('toggle-pdf-more');
  if (!panel || !toggle) return;
  const open = typeof force === 'boolean' ? force : panel.hidden;
  if (!open && ['clean', 'forms'].includes(pdfState.tab)) switchPdfTab('review');
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Hide More' : 'More';
}

function switchToolTab(tab) {
  if (!['binder', 'convert', 'batch', 'inspect', 'clean-word'].includes(tab)) tab = 'binder';
  app.toolTab = tab;
  document.querySelectorAll('[data-tool-tab]').forEach((button) => {
    const active = button.dataset.toolTab === tab;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-tool-pane]').forEach((pane) => { pane.hidden = pane.dataset.toolPane !== tab; });
  if (tab === 'clean-word') runGuarded(renderCleanWordPreview());
}

async function chooseTask(task) {
  if (['ocr', 'redact'].includes(task)) {
    const selected = app.homeFiles.find((file) => detectFormat(file) === 'pdf');
    if (selected) {
      const opened = await openPdfFile(selected);
      if (opened !== false) switchPdfTab(task);
    }
    else {
      switchRoute('pdf');
      switchPdfTab(task);
      showStatus('Open a PDF to begin.');
    }
    return;
  }
  switchRoute('tools');
  switchToolTab(task === 'clean-word' ? 'clean-word' : task);
  if (task === 'clean-word') {
    const wordFile = app.homeFiles.find((file) => detectFormat(file) === 'docx');
    if (wordFile) setCleanWordFile(wordFile);
  }
  if (task === 'binder' && app.homeFiles.length) addToolFiles('binder', app.homeFiles);
  if (task === 'convert' && app.homeFiles.length) addToolFiles('convert', app.homeFiles);
  if (task === 'batch' && app.homeFiles.length) addToolFiles('batch', app.homeFiles);
}

function openCompare(tab = 'documents') {
  if (window.CommentMasterWord) window.CommentMasterWord.openCompare(tab);
}

function exposeWorkbenchApi() {
  window.CommentMasterWorkbench = Object.freeze({
    version: WORKBENCH_VERSION,
    currentRoute: () => app.route,
    showResult,
    openFiles: stageHomeFiles,
    resources: () => ({ jobs: app.currentJob ? 1 : 0, objectUrls: app.urls.size, pdfLoaded: Boolean(pdfState.document), ocrWorker: Boolean(pdfState.ocrWorker) })
  });
}

function showStatus(message) {
  const status = $('status');
  if (status) status.textContent = message;
  const pdfStatus = $('pdf-action-status');
  if (pdfStatus && app.route === 'pdf') pdfStatus.textContent = message;
}

function showError(message) {
  const error = $('error-log');
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
  showStatus('The operation could not be completed.');
}

function clearError() {
  const error = $('error-log');
  if (error) { error.textContent = ''; error.hidden = true; }
}

function friendlyError(error) {
  const message = String(error && error.message || error || 'Unknown error');
  if (/password|encrypted/i.test(message)) return 'This PDF is password-protected. Password entry is not available for this operation.';
  if (/invalid pdf|header|xref|object/i.test(message)) return 'This PDF appears damaged. Try Normalize PDF if it can still be opened.';
  if (/memory|allocation|too large|safety limit/i.test(message)) return 'This file is too large for the current browser safety limits. Try a smaller file or fewer pages.';
  return message.replace(/^Error:\s*/i, '');
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal !== 'function') throw new Error('This browser does not support the secure dialog behavior required by Comment Master. Use a current version of Chrome, Edge, Firefox, or Safari.');
  if (!dialog.open) dialog.showModal();
}

function closeOwningDialog(button) {
  const dialog = button.closest('dialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
}

function showResult(type, detail) {
  app.result = { type, ...detail };
  app.resultTab = type === 'comparison' ? 'redline' : 'summary';
  app.resultChangeIndex = 0;
  $('result-title').textContent = resultTitle(type);
  $('result-subtitle').textContent = detail.filename ? `${detail.filename} is ready. Review it before saving.` : 'Review the result before saving.';
  $('result-download').textContent = detail.filename ? `Save ${detail.filename}` : 'Save result';
  const tabs = $('result-tabs');
  if (type === 'comparison') {
    tabs.hidden = false;
    tabs.innerHTML = ['redline', 'original', 'revised', 'side-by-side'].map((tab) => `<button type="button" data-result-tab="${tab}" class="${tab === app.resultTab ? 'active' : ''}">${tab === 'side-by-side' ? 'Side by side' : capitalize(tab)}</button>`).join('');
    tabs.querySelectorAll('[data-result-tab]').forEach((button) => button.addEventListener('click', () => {
      app.resultTab = button.dataset.resultTab;
      app.resultChangeIndex = 0;
      renderResult();
    }));
  } else tabs.hidden = true;
  renderResult();
  openDialog($('result-dialog'));
}

function resultTitle(type) {
  if (type === 'comparison') return 'Comparison ready';
  if (type === 'combined-commentary') return 'Combined commentary ready';
  if (type === 'redaction') return 'Secure redaction complete';
  if (type === 'binder') return 'Binder ready';
  return 'Result ready';
}

function renderResult() {
  const result = app.result;
  if (!result) return;
  $('result-tabs').querySelectorAll('[data-result-tab]').forEach((button) => button.classList.toggle('active', button.dataset.resultTab === app.resultTab));
  const content = $('result-content');
  if (result.type === 'comparison') content.innerHTML = renderComparisonResult(result, app.resultTab);
  else if (result.type === 'combined-commentary') content.innerHTML = renderCommentaryReport(result);
  else content.innerHTML = result.html || `<div class="health-card good"><h3>${escapeHtml(result.heading || 'New copy ready')}</h3><p>${escapeHtml(result.message || 'The operation completed locally in this browser.')}</p></div>`;
  renderResultChangeNavigation();
  bindSynchronizedComparisonScroll();
}

function resultChangeRows() {
  return Array.from($('result-content').querySelectorAll('[data-change-preview]')).filter((row) => row.querySelector('ins, del'));
}

function renderResultChangeNavigation() {
  const navigation = $('result-navigation');
  const visible = app.result?.type === 'comparison' && app.resultTab === 'redline';
  navigation.hidden = !visible;
  if (!visible) return;
  const rows = resultChangeRows();
  if (rows.length) app.resultChangeIndex = Math.max(0, Math.min(app.resultChangeIndex, rows.length - 1));
  rows.forEach((row, index) => {
    row.classList.toggle('current-change', index === app.resultChangeIndex);
    row.tabIndex = -1;
  });
  $('result-change-position').textContent = rows.length ? `Change ${app.resultChangeIndex + 1} of ${rows.length}` : 'No textual changes';
  $('result-prev-change').disabled = !rows.length;
  $('result-next-change').disabled = !rows.length;
}

function navigateResultChange(delta) {
  const rows = resultChangeRows();
  if (!rows.length) return;
  app.resultChangeIndex = (app.resultChangeIndex + delta + rows.length) % rows.length;
  rows.forEach((row, index) => {
    row.classList.toggle('current-change', index === app.resultChangeIndex);
    row.tabIndex = -1;
  });
  const selected = rows[app.resultChangeIndex];
  selected.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  selected.focus({ preventScroll: true });
  $('result-change-position').textContent = `Change ${app.resultChangeIndex + 1} of ${rows.length}`;
}

function bindSynchronizedComparisonScroll() {
  const panels = Array.from($('result-content').querySelectorAll('.comparison-columns > section'));
  if (panels.length !== 2) return;
  let syncing = false;
  panels.forEach((panel, index) => panel.addEventListener('scroll', () => {
    if (syncing) return;
    const sourceRange = Math.max(0, panel.scrollHeight - panel.clientHeight);
    const other = panels[index ? 0 : 1];
    const otherRange = Math.max(0, other.scrollHeight - other.clientHeight);
    syncing = true;
    other.scrollTop = sourceRange ? (panel.scrollTop / sourceRange) * otherRange : 0;
    requestAnimationFrame(() => { syncing = false; });
  }, { passive: true }));
}

function renderComparisonResult(result, tab) {
  const original = Array.isArray(result.preview && result.preview.original) ? result.preview.original : [];
  const revised = Array.isArray(result.preview && result.preview.revised) ? result.preview.revised : [];
  const aligned = Array.isArray(result.preview && result.preview.rows) ? result.preview.rows : [];
  const stats = result.stats || {};
  const summary = `<div class="comparison-summary"><strong>${Number(stats.changedParagraphs || 0).toLocaleString()} changed paragraphs</strong><span>${Number(stats.insertedParagraphs || 0).toLocaleString()} inserted</span><span>${Number(stats.deletedParagraphs || 0).toLocaleString()} deleted</span>${Number.isFinite(Number(stats.formatChangedParagraphs)) ? `<span>${Number(stats.formatChangedParagraphs).toLocaleString()} formatting changes</span>` : ''}</div>`;
  if (tab === 'original') return summary + paragraphPreview(original, 'Original');
  if (tab === 'revised') return summary + paragraphPreview(revised, 'Revised');
  if (tab === 'side-by-side') return `${summary}<div class="comparison-columns"><section><h3>${escapeHtml(result.originalName || 'Original')}</h3>${paragraphPreview(original)}</section><section><h3>${escapeHtml(result.revisedName || 'Revised')}</h3>${paragraphPreview(revised)}</section></div>`;
  const pairs = aligned.length ? aligned.map((row) => [row.original || '', row.revised || '']) : Array.from({ length: Math.max(original.length, revised.length) }, (_value, index) => [original[index] || '', revised[index] || '']);
  const limit = 1000;
  const rows = pairs.slice(0, limit).map(([before, after], index) => `<p data-change-preview="${index}">${inlineDiff(before, after)}</p>`);
  const omitted = pairs.length > limit ? `<p class="operation-note">${(pairs.length - limit).toLocaleString()} additional aligned paragraphs are available in the exported redline.</p>` : '';
  return `${summary}<section class="inline-redline" aria-label="Inline redline">${rows.join('') || '<p>No visible text changes were found.</p>'}${omitted}</section>`;
}

function paragraphPreview(paragraphs, label = '') {
  return `<section class="plain-preview"${label ? ` aria-label="${escapeHtml(label)}"` : ''}>${paragraphs.map((text) => `<p>${escapeHtml(text) || '&nbsp;'}</p>`).join('') || '<p>No text.</p>'}</section>`;
}

function inlineDiff(original, revised) {
  const left = tokenizeDiff(original);
  const right = tokenizeDiff(revised);
  if (left.length * right.length > 250000) return `<del>${escapeHtml(original)}</del><ins>${escapeHtml(revised)}</ins>`;
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const output = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { output.push(escapeHtml(left[i])); i += 1; j += 1; }
    else if (j < right.length && (i >= left.length || table[i][j + 1] >= table[i + 1][j])) { output.push(`<ins>${escapeHtml(right[j])}</ins>`); j += 1; }
    else { output.push(`<del>${escapeHtml(left[i])}</del>`); i += 1; }
  }
  return output.join('');
}

function tokenizeDiff(value) { return String(value).match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || []; }

function renderCommentaryReport(result) {
  const stats = result.stats || {};
  const report = Array.isArray(result.report) ? result.report : [];
  return `<div class="comparison-summary"><strong>${Number(stats.comments || report.filter((item) => item.type === 'Comment').length).toLocaleString()} comments</strong><span>${Number(stats.changedParagraphs || 0).toLocaleString()} changed paragraphs</span><span>${new Set(report.map((item) => item.reviewer).filter(Boolean)).size} reviewers</span></div><div class="commentary-report">${report.map((item) => `<article class="commentary-item${item.replyToId ? ' reply' : ''}"><header><strong>${escapeHtml(item.type)}</strong><span>${escapeHtml(item.author || item.reviewer || 'Unknown reviewer')}</span><time>${escapeHtml(formatDate(item.date))}</time></header>${item.context ? `<blockquote>${escapeHtml(item.context)}</blockquote>` : ''}<p>${escapeHtml(item.text || 'No comment text')}</p><small>${escapeHtml(item.sourceName || '')}</small></article>`).join('') || '<p>No commentary entries were available for preview.</p>'}</div>`;
}

async function saveCurrentResult() {
  if (!app.result || !app.result.blob) return;
  await saveBlob(app.result.blob, app.result.filename || 'Comment Master result');
}

async function saveBlob(blob, filename, preferredHandle = null) {
  const safeName = safeFilename(filename);
  if (window.isSecureContext && typeof window.showSaveFilePicker === 'function') {
    try {
      const extension = extensionOf(safeName);
      const handle = preferredHandle || await window.showSaveFilePicker({ suggestedName: safeName, types: [{ description: 'Comment Master result', accept: { [blob.type || 'application/octet-stream']: extension ? [`.${extension}`] : [] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showStatus(`Saved ${safeName}.`);
      return handle;
    } catch (error) {
      if (error && error.name === 'AbortError') return null;
    }
  }
  const url = URL.createObjectURL(blob);
  app.urls.add(url);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => { URL.revokeObjectURL(url); app.urls.delete(url); }, 1000);
  showStatus(`Prepared ${safeName} for download.`);
  return null;
}

function capitalize(value) { return String(value).charAt(0).toUpperCase() + String(value).slice(1); }
function formatDate(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value || ''); }

function bindDropZone(zone, callback) {
  if (!zone) return;
  ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    zone.classList.remove('dragover');
    if (type === 'drop' && event.dataTransfer && event.dataTransfer.files.length) runGuarded(callback(event.dataTransfer.files));
  }));
}

async function chooseFiles(options = {}) {
  const accept = options.accept || ['.docx', '.pdf', '.xlsx', '.csv', '.odt', '.rtf', '.txt', '.md', '.html', '.png', '.jpg', '.jpeg', '.webp'];
  if (window.isSecureContext && typeof window.showOpenFilePicker === 'function') {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: options.multiple !== false,
        types: [{ description: options.description || 'Documents', accept: { 'application/octet-stream': accept } }],
        excludeAcceptAllOption: false
      });
      const files = await Promise.all(handles.map((handle) => handle.getFile()));
      files.forEach((file, index) => app.pickerHandles.set(file, handles[index]));
      return files;
    } catch (error) {
      if (error && error.name === 'AbortError') return [];
    }
  }
  return new Promise((resolve) => {
    const input = $(options.inputId || 'workbench-file-input');
    if (!input) { resolve([]); return; }
    input.multiple = options.multiple !== false;
    input.value = '';
    input.dataset.pendingPicker = 'true';
    const finish = () => {
      input.removeEventListener('change', finish);
      delete input.dataset.pendingPicker;
      resolve(Array.from(input.files || []));
    };
    input.addEventListener('change', finish, { once: true });
    input.click();
  });
}

async function chooseHomeFiles() {
  const files = await chooseFiles({ inputId: 'workbench-file-input', multiple: true });
  if (files.length) stageHomeFiles(files);
}

function stageHomeFiles(files) {
  const list = Array.from(files || []);
  if (list.length) assertSafeFiles(list);
  app.homeFiles = list;
  renderHomeSelection();
  if (!list.length) return;
  if (list.length === 1) {
    const format = detectFormat(list[0]);
    if (format === 'docx') { runGuarded(openWordFromSelectionOrPicker()); return; }
    if (format === 'pdf') { runGuarded(openPdfFromSelectionOrPicker()); return; }
  }
  switchRoute('home');
}

function renderHomeSelection() {
  const region = $('home-selection');
  const files = app.homeFiles;
  region.hidden = !files.length;
  if (!files.length) {
    $('selected-files').innerHTML = '';
    $('suggestion-actions').innerHTML = '';
    $('home-selection-status').textContent = '';
    return;
  }
  $('home-selection-status').textContent = `${files.length} file${files.length === 1 ? '' : 's'} selected. Recommended next steps:`;
  $('selected-files').innerHTML = files.map((file, index) => `<article class="selected-file"><span class="file-type">${escapeHtml(detectFormat(file).toUpperCase())}</span><div><strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong><small>${escapeHtml(formatLabel(detectFormat(file)))} · ${humanBytes(file.size)}</small></div><button type="button" class="icon-btn" data-home-remove="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button></article>`).join('');
  $('selected-files').querySelectorAll('[data-home-remove]').forEach((button) => button.addEventListener('click', () => {
    app.homeFiles.splice(Number(button.dataset.homeRemove), 1);
    renderHomeSelection();
  }));
  $('suggestion-actions').innerHTML = contextualSuggestions(files).map((key, index) => {
    const suggestion = SUGGESTIONS[key] || [capitalize(key), key];
    return `<button class="btn ${index === 0 ? 'btn-primary' : 'btn-light'}" data-wb-action="suggestion" data-suggestion="${escapeHtml(suggestion[1])}" type="button">${escapeHtml(suggestion[0])}</button>`;
  }).join('');
}

async function activateSuggestion(suggestion) {
  if (suggestion === 'review-word') return openWordFromSelectionOrPicker();
  if (suggestion === 'open-pdf') return openPdfFromSelectionOrPicker();
  if (suggestion === 'compare-documents') {
    const files = app.homeFiles.filter((file) => detectFormat(file) === 'docx').slice(0, 2);
    if (files.length === 2 && window.CommentMasterWord && typeof window.CommentMasterWord.openCompareWithFiles === 'function') window.CommentMasterWord.openCompareWithFiles(files[0], files[1]);
    else openCompare('documents');
    return;
  }
  if (suggestion === 'combine-commentary') {
    const files = app.homeFiles.filter((file) => detectFormat(file) === 'docx');
    if (window.CommentMasterWord && typeof window.CommentMasterWord.openCombineWithFiles === 'function') window.CommentMasterWord.openCombineWithFiles(files[0], files.slice(1));
    else openCompare('combine');
    return;
  }
  if (suggestion === 'inspect') {
    switchRoute('tools');
    switchToolTab('inspect');
    return inspectFiles(app.homeFiles);
  }
  chooseTask(suggestion);
}

async function openWordFromSelectionOrPicker() {
  let file = app.homeFiles.find((candidate) => detectFormat(candidate) === 'docx');
  if (!file) {
    const files = await chooseFiles({ inputId: 'file-input', multiple: false, accept: ['.docx'], description: 'Word document' });
    file = files[0];
  }
  if (!file) return;
  if (!window.CommentMasterWord) throw new Error('The Word workspace is not ready. Reload Comment Master and try again.');
  await window.CommentMasterWord.openFile(file);
  switchRoute('word');
}

async function openPdfFromSelectionOrPicker() {
  let file = app.homeFiles.find((candidate) => detectFormat(candidate) === 'pdf');
  if (!file) {
    const files = await chooseFiles({ inputId: 'pdf-file-input', multiple: false, accept: ['.pdf'], description: 'PDF' });
    file = files[0];
  }
  if (file) await openPdfFile(file);
}

async function handleFileInput(input) {
  if (input.dataset.pendingPicker) return;
  const files = Array.from(input.files || []);
  if (!files.length) return;
  if (input.id === 'workbench-file-input') stageHomeFiles(files);
  else if (input.id === 'pdf-file-input') await openPdfFile(files[0]);
  else if (input.id === 'binder-files') addToolFiles('binder', files);
  else if (input.id === 'convert-files') addToolFiles('convert', files);
  else if (input.id === 'batch-files') addToolFiles('batch', files);
  else if (input.id === 'inspect-files') await inspectFiles(files);
  else if (input.id === 'clean-word-file') setCleanWordFile(files[0]);
  input.value = '';
}

function beginJob(title, subtitle = 'Processing stays on this device.') {
  if (app.currentJob) throw new Error('Another local operation is still running.');
  const controller = new AbortController();
  app.currentJob = { controller, title, started: performance.now() };
  $('progress-title').textContent = title;
  $('progress-subtitle').textContent = subtitle;
  updateJobProgress({ current: 0, total: 1, label: 'Starting…' });
  openDialog($('progress-dialog'));
  return controller.signal;
}

function updateJobProgress(progress) {
  if (!app.currentJob) return;
  const total = Math.max(1, Number(progress.total || 1));
  const current = Math.max(0, Math.min(total, Number(progress.current || 0)));
  const percent = Math.round(current / total * 100);
  $('job-progress').value = percent;
  $('job-progress-value').textContent = `${percent}%`;
  $('job-progress-label').textContent = progress.label || phaseLabel(progress.phase, current, total);
}

function phaseLabel(phase, current, total) {
  const names = { reading: 'Reading', combining: 'Combining', pages: 'Organizing pages', marking: 'Adding marks', images: 'Adding images', rebuilding: 'Building PDF', 'text-layer': 'Adding searchable text', redaction: 'Applying redactions', ocr: 'Recognizing pages', converting: 'Converting files', batch: 'Processing files' };
  return `${names[phase] || 'Processing'} ${current} of ${total}`;
}

function endJob() {
  app.currentJob = null;
  const dialog = $('progress-dialog');
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function cancelCurrentJob() {
  if (!app.currentJob) return;
  app.currentJob.controller.abort();
  if (/OCR|searchable|recognition/i.test(app.currentJob.title) && pdfState.ocrWorker) {
    void pdfState.ocrWorker.worker.terminate().catch(() => {});
    pdfState.ocrWorker = null;
  }
  $('job-progress-label').textContent = 'Cancelling safely…';
  $('job-cancel').disabled = true;
  setTimeout(() => { $('job-cancel').disabled = false; }, 500);
}

async function withJob(title, callback, subtitle) {
  clearError();
  const signal = beginJob(title, subtitle);
  try { return await callback(signal); }
  finally { endJob(); }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) showStatus('A Comment Master update is ready. Reload when convenient.');
      });
    });
  } catch (_) {
    showStatus('Comment Master is ready. Offline installation is unavailable in this browser context.');
  }
}

async function clearOptionalCaches() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const target = registration.active || registration.waiting;
  if (target) target.postMessage({ type: 'CLEAR_OPTIONAL_CACHES' });
  showStatus('Cached optional engines were cleared. They will be prepared again when needed.');
}

async function openPdfFile(file) {
  assertSafeFiles([file]);
  if (detectFormat(file) !== 'pdf') throw new Error('Choose a PDF for the PDF workspace.');
  if (pdfState.file && hasPendingPdfWork() && file !== pdfState.file) {
    const discard = window.confirm('Open another PDF and discard the current unsaved working changes and pending redaction marks?');
    if (!discard) return false;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await closePdfDocument(false);
  pdfState.file = file;
  pdfState.originalBytes = bytes.slice();
  pdfState.bytes = bytes;
  pdfState.saveHandle = app.pickerHandles.get(file) || null;
  pdfState.dirty = false;
  pdfState.redactions.clear();
  pdfState.undo = [];
  await loadPdfViewerDocument();
  pdfState.order = Array.from({ length: pdfState.pageCount }, (_, index) => index);
  pdfState.rotations = {};
  pdfState.current = 0;
  pdfState.inspection = await inspectPdfStructure(pdfState.bytes);
  $('pdf-empty').hidden = true;
  $('pdf-loaded').hidden = false;
  $('pdf-title').textContent = file.name;
  $('pdf-summary').textContent = `${pdfState.pageCount.toLocaleString()} page${pdfState.pageCount === 1 ? '' : 's'} · ${humanBytes(file.size)} · Working copy loaded`;
  switchRoute('pdf');
  switchPdfTab('review');
  renderPdfFileSummary();
  renderPageList();
  await renderPdfPage();
  runGuarded(renderPdfThumbnails());
  runGuarded(detectScannedPdf());
  showStatus(`Opened ${file.name}. The original remains unchanged.`);
  return true;
}

async function loadPdfViewerDocument() {
  if (pdfState.loadingTask) {
    try { await pdfState.loadingTask.destroy(); } catch (_) {}
    pdfState.loadingTask = null;
    pdfState.document = null;
  }
  const loadingTask = pdfjsLib.getDocument(pdfjsDocumentOptions(pdfState.bytes.slice(), { verbosity: 0 }));
  let passwordMessage = '';
  loadingTask.onPassword = (_updatePassword, reason) => {
    passwordMessage = reason ? 'This PDF is password-protected. Entering passwords is not yet supported.' : 'This PDF uses unsupported encryption.';
    void loadingTask.destroy();
  };
  pdfState.loadingTask = loadingTask;
  try {
    pdfState.document = await loadingTask.promise;
  } catch (error) {
    pdfState.document = null;
    pdfState.loadingTask = null;
    throw passwordMessage ? new Error(passwordMessage) : error;
  }
  pdfState.pageCount = pdfState.document.numPages;
  if (pdfState.pageCount > MAX_PDF_PAGES) {
    await loadingTask.destroy();
    pdfState.loadingTask = null;
    pdfState.document = null;
    throw new Error(`This PDF has more than the ${MAX_PDF_PAGES.toLocaleString()}-page browser safety limit.`);
  }
  pdfState.textCache.clear();
  pdfState.textItems.clear();
}

async function closePdfDocument(clearFile = true) {
  pdfState.renderToken += 1;
  pdfState.thumbnailToken += 1;
  if (pdfState.renderTask) {
    try { pdfState.renderTask.cancel(); } catch (_) {}
  }
  if (pdfState.loadingTask) {
    try { await pdfState.loadingTask.destroy(); } catch (_) {}
  }
  pdfState.loadingTask = null;
  pdfState.document = null;
  if (clearFile) {
    pdfState.file = null;
    pdfState.bytes = null;
    pdfState.originalBytes = null;
    pdfState.redactions.clear();
    $('pdf-empty').hidden = false;
    $('pdf-loaded').hidden = true;
  }
}

function renderPdfFileSummary() {
  const redactions = pendingRedactionCount();
  const pendingLabel = redactions ? ` · ${redactions} pending redaction${redactions === 1 ? '' : 's'}` : pdfState.dirty ? ' · unsaved' : '';
  $('pdf-file-pill').textContent = `${pdfState.file.name}${pendingLabel}`;
  $('pdf-file-pill').setAttribute('aria-label', `${pdfState.file.name}${redactions ? `, ${redactions} pending redactions` : pdfState.dirty ? ', unsaved working changes' : ''}`);
  $('pdf-export-pages').textContent = String(pdfState.order.length || pdfState.pageCount);
  $('pdf-export-size').textContent = humanBytes(pdfState.bytes ? pdfState.bytes.length : 0);
  const natural = pdfState.order.every((value, index) => value === index) && pdfState.order.length === pdfState.pageCount;
  const rotated = Object.values(pdfState.rotations).some(Boolean);
  $('pdf-export-changes').textContent = redactions ? `${redactions} redaction mark${redactions === 1 ? '' : 's'} must be applied or cleared before export` : !natural || rotated ? 'Page order, count, or rotation changes pending' : (pdfState.dirty ? 'Working copy has applied changes' : 'None');
}

async function renderPdfPage() {
  if (!pdfState.document || !pdfState.order.length) return;
  const token = ++pdfState.renderToken;
  if (pdfState.renderTask) {
    try { pdfState.renderTask.cancel(); } catch (_) {}
  }
  const sourceIndex = pdfState.order[pdfState.current];
  const page = await pdfState.document.getPage(sourceIndex + 1);
  if (token !== pdfState.renderToken) return;
  const baseViewport = page.getViewport({ scale: 1, rotation: normalizedPageRotation(page, pdfState.current) });
  const container = $('pdf-page-container');
  const zoom = $('pdf-zoom').value;
  let scale = Number(zoom);
  if (!Number.isFinite(scale)) {
    const availableWidth = Math.max(300, container.parentElement.clientWidth - 34);
    const availableHeight = Math.max(420, Math.min(window.innerHeight - 230, 900));
    scale = zoom === 'fit-page' ? Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height) : availableWidth / baseViewport.width;
  }
  scale = Math.max(.25, Math.min(3.5, scale || 1));
  const viewport = page.getViewport({ scale, rotation: normalizedPageRotation(page, pdfState.current) });
  if (viewport.width * viewport.height > MAX_RENDER_PIXELS) throw new Error('This page is too large to render safely at the selected zoom. Reduce the zoom and try again.');
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = $('pdf-canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  container.style.width = `${Math.floor(viewport.width)}px`;
  container.style.height = `${Math.floor(viewport.height)}px`;
  const transform = outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];
  pdfState.renderTask = page.render({ canvasContext: context, viewport, transform, intent: 'display', annotationMode: pdfjsLib.AnnotationMode.DISABLE });
  try { await pdfState.renderTask.promise; }
  catch (error) { if (!/cancel/i.test(String(error && error.message))) throw error; return; }
  if (token !== pdfState.renderToken) return;
  const textContent = await page.getTextContent({ disableNormalization: false, includeMarkedContent: false });
  pdfState.textCache.set(sourceIndex, textContent.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim());
  pdfState.textItems.set(sourceIndex, textContent.items);
  renderPdfTextLayer(textContent, viewport);
  renderRedactionLayer();
  $('pdf-page-number').textContent = `Page ${pdfState.current + 1} of ${pdfState.order.length}`;
  $('pdf-page-accessible-text').textContent = pdfState.textCache.get(sourceIndex) || 'No selectable text was found on this page.';
  document.querySelectorAll('[data-pdf-page]').forEach((button) => button.classList.toggle('active', Number(button.dataset.pdfPage) === pdfState.current));
}

function normalizedPageRotation(page, virtualIndex) {
  const value = Number(page.rotate || page._pageInfo && page._pageInfo.rotate || 0) + Number(pdfState.rotations[virtualIndex] || 0);
  return ((value % 360) + 360) % 360;
}

function renderPdfTextLayer(textContent, viewport) {
  const layer = $('pdf-text-layer');
  layer.innerHTML = '';
  layer.style.width = `${viewport.width}px`;
  layer.style.height = `${viewport.height}px`;
  const fragment = document.createDocumentFragment();
  textContent.items.forEach((item, index) => {
    if (!item.str) return;
    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]));
    const angle = Math.atan2(transform[1], transform[0]);
    const span = document.createElement('span');
    span.textContent = item.str;
    span.dataset.textItem = String(index);
    span.style.left = `${transform[4]}px`;
    span.style.top = `${transform[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = 'sans-serif';
    const measured = Math.max(1, item.width * viewport.scale);
    const estimated = Math.max(1, item.str.length * fontHeight * .52);
    span.style.transform = `rotate(${angle}rad) scaleX(${measured / estimated})`;
    fragment.appendChild(span);
  });
  layer.appendChild(fragment);
}

async function renderPdfThumbnails() {
  const token = ++pdfState.thumbnailToken;
  const rail = $('pdf-thumbnails');
  rail.innerHTML = pdfState.order.map((_source, index) => `<button type="button" class="pdf-thumb${index === pdfState.current ? ' active' : ''}" data-pdf-page="${index}" aria-label="Go to page ${index + 1}"><canvas width="90" height="118" aria-hidden="true"></canvas><span>${index + 1}</span></button>`).join('');
  rail.querySelectorAll('[data-pdf-page]').forEach((button) => button.addEventListener('click', () => goToPdfPage(Number(button.dataset.pdfPage))));
  for (let index = 0; index < pdfState.order.length; index += 1) {
    if (token !== pdfState.thumbnailToken || !pdfState.document) return;
    const page = await pdfState.document.getPage(pdfState.order[index] + 1);
    const base = page.getViewport({ scale: 1, rotation: normalizedPageRotation(page, index) });
    const scale = 90 / base.width;
    const viewport = page.getViewport({ scale, rotation: normalizedPageRotation(page, index) });
    const canvas = rail.querySelector(`[data-pdf-page="${index}"] canvas`);
    if (!canvas) return;
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    try { await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, intent: 'display', annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise; }
    catch (_) { canvas.setAttribute('aria-label', 'Thumbnail unavailable'); }
    if (index % 4 === 0) await yieldToMain();
  }
}

function renderPageList() {
  const list = $('pdf-page-list');
  list.innerHTML = pdfState.order.map((source, index) => `<div class="pdf-page-row${index === pdfState.current ? ' active' : ''}" draggable="true" data-page-row="${index}"><span class="drag-handle" aria-hidden="true">⋮⋮</span><button type="button" class="page-row-main" data-pdf-page="${index}"><strong>Page ${index + 1}</strong><small>Source page ${source + 1}${pdfState.rotations[index] ? ` · rotated ${pdfState.rotations[index]}°` : ''}</small></button><span class="page-row-actions"><button type="button" data-page-move="up" aria-label="Move page ${index + 1} up"${index === 0 ? ' disabled' : ''}>↑</button><button type="button" data-page-move="down" aria-label="Move page ${index + 1} down"${index === pdfState.order.length - 1 ? ' disabled' : ''}>↓</button></span></div>`).join('');
  list.querySelectorAll('[data-pdf-page]').forEach((button) => button.addEventListener('click', () => goToPdfPage(Number(button.dataset.pdfPage))));
  list.querySelectorAll('[data-page-move]').forEach((button) => button.addEventListener('click', () => {
    const row = button.closest('[data-page-row]');
    const from = Number(row.dataset.pageRow);
    runGuarded(Promise.resolve().then(() => movePdfPage(from, from + (button.dataset.pageMove === 'up' ? -1 : 1))));
  }));
  list.querySelectorAll('[data-page-row]').forEach((row) => {
    row.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', row.dataset.pageRow));
    row.addEventListener('dragover', (event) => { event.preventDefault(); row.classList.add('dragover'); });
    row.addEventListener('dragleave', () => row.classList.remove('dragover'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      row.classList.remove('dragover');
      runGuarded(Promise.resolve().then(() => movePdfPage(Number(event.dataTransfer.getData('text/plain')), Number(row.dataset.pageRow))));
    });
  });
  renderPdfFileSummary();
}

function goToPdfPage(index) {
  if (!pdfState.order.length) return;
  pdfState.current = Math.max(0, Math.min(pdfState.order.length - 1, Number(index) || 0));
  runGuarded(renderPdfPage());
  renderPageList();
}

function changePdfPage(delta) { goToPdfPage(pdfState.current + delta); }

async function getPageText(sourceIndex) {
  if (pdfState.textCache.has(sourceIndex)) return pdfState.textCache.get(sourceIndex);
  const page = await pdfState.document.getPage(sourceIndex + 1);
  const content = await page.getTextContent({ disableNormalization: false });
  const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
  pdfState.textCache.set(sourceIndex, text);
  pdfState.textItems.set(sourceIndex, content.items);
  return text;
}

async function detectScannedPdf() {
  const sample = Math.min(pdfState.pageCount, 6);
  let pagesWithText = 0;
  for (let index = 0; index < sample; index += 1) {
    if ((await getPageText(index)).length > 20) pagesWithText += 1;
  }
  const likelyScanned = sample > 0 && pagesWithText / sample < .34;
  $('pdf-scan-suggestion').hidden = !likelyScanned;
  if (likelyScanned) $('pdf-summary').textContent += ' · Looks scanned';
}

async function searchPdf() {
  if (!pdfState.document) return;
  const query = $('pdf-search').value.trim();
  if (!query) throw new Error('Enter a word or phrase to search for.');
  const results = [];
  const lowered = query.toLocaleLowerCase();
  for (let virtual = 0; virtual < pdfState.order.length; virtual += 1) {
    const text = await getPageText(pdfState.order[virtual]);
    const position = text.toLocaleLowerCase().indexOf(lowered);
    if (position >= 0) results.push({ page: virtual, context: text.slice(Math.max(0, position - 70), position + query.length + 90) });
    if (virtual % 10 === 0) await yieldToMain();
  }
  $('pdf-search-results').innerHTML = results.length ? results.map((result) => `<button type="button" data-search-page="${result.page}"><strong>Page ${result.page + 1}</strong><span>${escapeHtml(result.context)}</span></button>`).join('') : '<p>No matches found.</p>';
  $('pdf-search-results').querySelectorAll('[data-search-page]').forEach((button) => button.addEventListener('click', () => goToPdfPage(Number(button.dataset.searchPage))));
  showStatus(`${results.length} page${results.length === 1 ? '' : 's'} contain “${query}”.`);
}

function snapshotPageState(label) {
  pdfState.undo.push({ label, order: pdfState.order.slice(), rotations: { ...pdfState.rotations }, current: pdfState.current });
  if (pdfState.undo.length > 20) pdfState.undo.shift();
}

function pendingRedactionCount() {
  return Array.from(pdfState.redactions.values()).reduce((total, marks) => total + marks.length, 0);
}

function hasPendingPdfWork() {
  return Boolean(pdfState.dirty || pendingRedactionCount());
}

function ensureNoPendingRedactions(action = 'change pages') {
  if (pendingRedactionCount()) throw new Error(`Apply or clear pending redactions before you ${action}. This prevents marks from moving to the wrong page.`);
}

function ensureStaticPageCopySafe(action) {
  const inspection = pdfState.inspection || {};
  if (inspection.formCount || inspection.xfa || inspection.signatures || inspection.outlines) throw new Error(`This PDF contains ${inspection.signatures ? 'signature fields' : inspection.xfa ? 'an XFA form' : inspection.formCount ? 'interactive forms' : 'bookmarks'}. ${action} would discard document-level structure, so Comment Master will not create a misleading copy. Flatten or sanitize an intentional copy first.`);
}

function markPdfDirty() {
  pdfState.dirty = true;
  renderPdfFileSummary();
}

function reindexRotations(mapping) {
  const updated = {};
  mapping.forEach((oldIndex, newIndex) => { if (pdfState.rotations[oldIndex]) updated[newIndex] = pdfState.rotations[oldIndex]; });
  pdfState.rotations = updated;
}

function movePdfPage(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
  ensureNoPendingRedactions('reorder pages');
  snapshotPageState('Reorder pages');
  const indices = pdfState.order.map((_item, index) => index);
  const [rotationIndex] = indices.splice(from, 1);
  indices.splice(to, 0, rotationIndex);
  const [source] = pdfState.order.splice(from, 1);
  pdfState.order.splice(to, 0, source);
  reindexRotations(indices);
  pdfState.current = to;
  markPdfDirty();
  renderPageList();
  runGuarded(renderPdfPage());
  runGuarded(renderPdfThumbnails());
}

function changePageRotation(delta) {
  if (!pdfState.order.length) return;
  ensureNoPendingRedactions('rotate a page');
  snapshotPageState('Rotate page');
  pdfState.rotations[pdfState.current] = ((Number(pdfState.rotations[pdfState.current] || 0) + delta) % 360 + 360) % 360;
  markPdfDirty();
  renderPageList();
  runGuarded(renderPdfPage());
  runGuarded(renderPdfThumbnails());
}

function duplicateCurrentPage() {
  ensureNoPendingRedactions('duplicate a page');
  ensureStaticPageCopySafe('Duplicating pages');
  snapshotPageState('Duplicate page');
  const insertAt = pdfState.current + 1;
  pdfState.order.splice(insertAt, 0, pdfState.order[pdfState.current]);
  const rotations = {};
  for (let index = 0; index < pdfState.order.length; index += 1) {
    if (index < insertAt && pdfState.rotations[index]) rotations[index] = pdfState.rotations[index];
    else if (index === insertAt && pdfState.rotations[pdfState.current]) rotations[index] = pdfState.rotations[pdfState.current];
    else if (index > insertAt && pdfState.rotations[index - 1]) rotations[index] = pdfState.rotations[index - 1];
  }
  pdfState.rotations = rotations;
  pdfState.current = insertAt;
  markPdfDirty();
  renderPageList(); runGuarded(renderPdfPage()); runGuarded(renderPdfThumbnails());
}

function deleteCurrentPage() {
  if (pdfState.order.length <= 1) throw new Error('A PDF must keep at least one page.');
  ensureNoPendingRedactions('delete a page');
  ensureStaticPageCopySafe('Deleting pages');
  snapshotPageState('Delete page');
  const removed = pdfState.current;
  pdfState.order.splice(removed, 1);
  const rotations = {};
  for (let index = 0; index <= pdfState.order.length; index += 1) {
    if (index < removed && pdfState.rotations[index]) rotations[index] = pdfState.rotations[index];
    if (index > removed && pdfState.rotations[index]) rotations[index - 1] = pdfState.rotations[index];
  }
  pdfState.rotations = rotations;
  pdfState.current = Math.min(pdfState.current, pdfState.order.length - 1);
  markPdfDirty();
  renderPageList(); runGuarded(renderPdfPage()); runGuarded(renderPdfThumbnails());
}

function reversePages() {
  ensureNoPendingRedactions('reverse the page order');
  snapshotPageState('Reverse page order');
  const indices = pdfState.order.map((_item, index) => index).reverse();
  pdfState.order.reverse();
  reindexRotations(indices);
  pdfState.current = pdfState.order.length - 1 - pdfState.current;
  markPdfDirty();
  renderPageList(); runGuarded(renderPdfPage()); runGuarded(renderPdfThumbnails());
}

function undoPageChange() {
  ensureNoPendingRedactions('undo a page change');
  const prior = pdfState.undo.pop();
  if (!prior) { showStatus('There is no page change to undo.'); return; }
  pdfState.order = prior.order;
  pdfState.rotations = prior.rotations;
  pdfState.current = Math.min(prior.current, prior.order.length - 1);
  markPdfDirty();
  renderPageList(); runGuarded(renderPdfPage()); runGuarded(renderPdfThumbnails());
}

async function materializePageChanges(signal, options = {}) {
  if (!options.allowPendingRedactions) ensureNoPendingRedactions('continue with another operation');
  const natural = pdfState.order.length === pdfState.pageCount && pdfState.order.every((value, index) => value === index);
  const rotated = Object.values(pdfState.rotations).some(Boolean);
  if (natural && !rotated) return;
  const outputRotations = pdfState.order.map((_source, index) => Number(pdfState.rotations[index] || 0));
  pdfState.bytes = new Uint8Array(await reorderPdf(pdfState.bytes, pdfState.order, outputRotations, updateJobProgress, signal));
  await loadPdfViewerDocument();
  pdfState.order = Array.from({ length: pdfState.pageCount }, (_, index) => index);
  pdfState.rotations = {};
  pdfState.current = Math.min(pdfState.current, pdfState.pageCount - 1);
  pdfState.undo = [];
  markPdfDirty();
  renderPageList();
}

async function extractSelectedPages() {
  if (!pdfState.file) return;
  ensureStaticPageCopySafe('Extracting pages');
  await withJob('Extracting pages', async (signal) => {
    await materializePageChanges(signal);
    const range = $('pdf-page-range').value.trim();
    if (!range) throw new Error('Enter the pages to extract, such as 1-3, 7.');
    const bytes = await extractPdf(pdfState.bytes, range);
    showResult('pdf', { blob: pdfBlob(bytes), filename: productFilename(pdfState.file.name, 'Extract', 'pdf'), heading: 'Selected pages ready', message: `${parsePageRanges(range, pdfState.pageCount).length} pages were copied into a new PDF.` });
  });
}

async function splitEveryPage() {
  if (!pdfState.file) return;
  ensureStaticPageCopySafe('Splitting pages');
  await withJob('Splitting PDF', async (signal) => {
    await materializePageChanges(signal);
    const outputs = await splitPdf(pdfState.bytes);
    const zip = new window.JSZip();
    const base = pdfState.file.name.replace(/\.pdf$/i, '');
    outputs.forEach((output, index) => zip.file(`${safeFilename(base)} - Page ${index + 1}.pdf`, output.bytes));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (metadata) => updateJobProgress({ current: metadata.percent, total: 100, label: 'Packaging page PDFs' }));
    showResult('pdf', { blob, filename: productFilename(pdfState.file.name, 'Split Pages', 'zip'), heading: 'Split pages ready', message: `${outputs.length} individual PDFs were packaged in one ZIP.` });
  });
}

async function addMarksToPdf() {
  if (!pdfState.file) return;
  const options = {
    watermark: $('pdf-watermark').value.trim(),
    header: $('pdf-header').value.trim(),
    footer: $('pdf-footer').value.trim(),
    pageNumbers: $('pdf-page-numbers').checked
  };
  if (!options.watermark && !options.header && !options.footer && !options.pageNumbers) throw new Error('Choose a page number, header, footer, or watermark to add.');
  await withJob('Adding page marks', async (signal) => {
    await materializePageChanges(signal);
    pdfState.bytes = new Uint8Array(await addPdfMarks(pdfState.bytes, options, updateJobProgress, signal));
    await reloadAppliedPdf('Page marks applied to the working copy.');
  });
}

async function reloadAppliedPdf(message) {
  await loadPdfViewerDocument();
  pdfState.order = Array.from({ length: pdfState.pageCount }, (_, index) => index);
  pdfState.rotations = {};
  pdfState.undo = [];
  markPdfDirty();
  pdfState.inspection = await inspectPdfStructure(pdfState.bytes);
  renderPageList();
  await renderPdfPage();
  runGuarded(renderPdfThumbnails());
  showStatus(message);
}

async function exportWorkingPdf() {
  if (!pdfState.file) throw new Error('Open a PDF before exporting.');
  await withJob('Preparing PDF export', async (signal) => {
    await materializePageChanges(signal);
    const filename = productFilename(pdfState.file.name, 'Edit', 'pdf');
    const handle = await saveBlob(pdfBlob(pdfState.bytes), filename);
    if (handle) pdfState.saveHandle = handle;
    pdfState.dirty = false;
    renderPdfFileSummary();
  });
}

async function getOcrWorker(language = 'eng') {
  if (pdfState.ocrWorker && pdfState.ocrWorker.language === language) return pdfState.ocrWorker.worker;
  if (pdfState.ocrWorker) {
    try { await pdfState.ocrWorker.worker.terminate(); } catch (_) {}
    pdfState.ocrWorker = null;
  }
  updateJobProgress({ current: 0, total: 1, label: 'Preparing document recognition for the first time…' });
  const module = await import('../vendor/tesseract/tesseract.esm.min.js');
  const Tesseract = module.default || module;
  const worker = await Tesseract.createWorker(language, 1, {
    workerPath: new URL('../vendor/tesseract/worker.min.js', import.meta.url).href,
    corePath: new URL('../vendor/tesseract/core/', import.meta.url).href,
    langPath: new URL('../vendor/tesseract/lang/', import.meta.url).href,
    gzip: true,
    logger: (message) => {
      if (!app.currentJob || message.status !== 'recognizing text') return;
      const meta = app.currentJob.ocrMeta;
      if (!meta) return;
      const value = meta.index + Math.max(0, Math.min(1, Number(message.progress || 0)));
      updateJobProgress({ current: value, total: meta.total, label: `OCR: page ${meta.index + 1} of ${meta.total}` });
    }
  });
  pdfState.ocrWorker = { language, worker };
  return worker;
}

async function renderPdfPageToCanvas(pageIndex, scale = 2) {
  const page = await pdfState.document.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  if (viewport.width * viewport.height > MAX_RENDER_PIXELS) throw new Error(`Page ${pageIndex + 1} is too large to process safely at OCR or redaction resolution.`);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, intent: 'display', annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
  return { canvas, page, viewport };
}

async function runOcr() {
  if (!pdfState.file) throw new Error('Open a PDF before running OCR.');
  await withJob('Making PDF searchable', async (signal) => {
    await materializePageChanges(signal);
    const mode = $('ocr-pages').value;
    const indices = mode === 'current' ? [pdfState.current] : mode === 'range' ? parsePageRanges($('ocr-range').value, pdfState.pageCount) : Array.from({ length: pdfState.pageCount }, (_, index) => index);
    const language = $('ocr-language').value || 'eng';
    const worker = await getOcrWorker(language);
    const pageText = new Map();
    for (let index = 0; index < indices.length; index += 1) {
      if (signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
      app.currentJob.ocrMeta = { index, total: indices.length };
      updateJobProgress({ current: index, total: indices.length, label: `OCR: page ${index + 1} of ${indices.length}` });
      const { canvas } = await renderPdfPageToCanvas(indices[index], 2);
      const result = await worker.recognize(canvas, { rotateAuto: $('ocr-auto-orient').checked }, { text: true, blocks: true });
      const data = result.data || {};
      const runs = [];
      (data.blocks || []).forEach((block) => (block.paragraphs || []).forEach((paragraph) => (paragraph.lines || []).forEach((line) => (line.words || []).forEach((word) => {
        if (!word.text || !word.bbox) return;
        runs.push({ text: word.text, confidence: word.confidence, x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 });
      }))));
      pageText.set(indices[index], { text: data.text || '', runs, rasterWidth: canvas.width, rasterHeight: canvas.height });
      canvas.width = 1; canvas.height = 1;
      await yieldToMain(signal);
    }
    pdfState.bytes = new Uint8Array(await overlaySearchText(pdfState.bytes, pageText, updateJobProgress, signal));
    await reloadAppliedPdf(`OCR completed for ${indices.length} page${indices.length === 1 ? '' : 's'}. A searchable working copy is ready.`);
    switchPdfTab('review');
  }, 'OCR runs page by page in a local Web Worker.');
}

function setRedactionDrawing(enabled) {
  pdfState.drawing = Boolean(enabled);
  const button = $('redaction-draw-toggle');
  button.setAttribute('aria-pressed', String(pdfState.drawing));
  button.textContent = pdfState.drawing ? 'Drawing enabled · press Esc to stop' : 'Draw redaction boxes';
  $('redaction-layer').classList.toggle('drawing', pdfState.drawing);
}

function beginRedactionBox(event) {
  if (!pdfState.drawing || event.button !== 0) return;
  const bounds = $('redaction-layer').getBoundingClientRect();
  pdfState.drawStart = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pointerId: event.pointerId };
  event.currentTarget.setPointerCapture(event.pointerId);
  const draft = document.createElement('div');
  draft.id = 'redaction-draft';
  draft.className = 'redaction-box draft';
  event.currentTarget.appendChild(draft);
}

function updateRedactionBox(event) {
  if (!pdfState.drawStart || event.pointerId !== pdfState.drawStart.pointerId) return;
  const bounds = $('redaction-layer').getBoundingClientRect();
  const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
  const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
  const left = Math.min(pdfState.drawStart.x, x);
  const top = Math.min(pdfState.drawStart.y, y);
  const draft = $('redaction-draft');
  if (!draft) return;
  Object.assign(draft.style, { left: `${left}px`, top: `${top}px`, width: `${Math.abs(x - pdfState.drawStart.x)}px`, height: `${Math.abs(y - pdfState.drawStart.y)}px` });
}

function finishRedactionBox(event) {
  if (!pdfState.drawStart || event.pointerId !== pdfState.drawStart.pointerId) return;
  updateRedactionBox(event);
  const draft = $('redaction-draft');
  const layer = $('redaction-layer');
  const bounds = layer.getBoundingClientRect();
  if (draft) {
    const rect = draft.getBoundingClientRect();
    if (rect.width >= 5 && rect.height >= 5) addRedaction(pdfState.current, { x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height, w: rect.width / bounds.width, h: rect.height / bounds.height, source: 'box' });
    draft.remove();
  }
  pdfState.drawStart = null;
  renderRedactionLayer();
}

function cancelRedactionBox() {
  pdfState.drawStart = null;
  const draft = $('redaction-draft');
  if (draft) draft.remove();
}

function markSelectedPdfText() {
  if (pdfState.tab !== 'redact') return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !$('pdf-text-layer').contains(selection.anchorNode)) return;
  const layerBounds = $('pdf-text-layer').getBoundingClientRect();
  Array.from(selection.getRangeAt(0).getClientRects()).forEach((rect) => {
    if (rect.width < 2 || rect.height < 2) return;
    addRedaction(pdfState.current, { x: (rect.left - layerBounds.left) / layerBounds.width, y: (rect.top - layerBounds.top) / layerBounds.height, w: rect.width / layerBounds.width, h: rect.height / layerBounds.height, source: 'selection', term: selection.toString().trim() });
  });
  selection.removeAllRanges();
  renderRedactionLayer();
}

function addRedaction(page, redaction) {
  const list = pdfState.redactions.get(page) || [];
  list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...redaction });
  pdfState.redactions.set(page, list);
}

function renderRedactionLayer() {
  const layer = $('redaction-layer');
  layer.querySelectorAll('.redaction-box:not(.draft)').forEach((node) => node.remove());
  const marks = pdfState.redactions.get(pdfState.current) || [];
  marks.forEach((mark) => {
    const box = document.createElement('div');
    box.className = 'redaction-box';
    box.title = mark.term ? `Pending redaction: ${mark.term}` : 'Pending redaction';
    Object.assign(box.style, { left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.w * 100}%`, height: `${mark.h * 100}%` });
    layer.appendChild(box);
  });
  renderRedactionList();
  renderPdfFileSummary();
}

function renderRedactionList() {
  const entries = [];
  pdfState.redactions.forEach((marks, page) => marks.forEach((mark) => entries.push({ page, mark })));
  $('redaction-list').innerHTML = entries.length ? entries.map(({ page, mark }) => `<div class="redaction-row"><span><strong>Page ${page + 1}</strong><small>${escapeHtml(mark.term || (mark.source === 'selection' ? 'Selected text' : 'Drawn box'))}</small></span><button class="btn btn-light" data-wb-action="remove-redaction" data-page="${page}" data-id="${escapeHtml(mark.id)}" type="button">Unmark</button></div>`).join('') : '<p class="muted">No pending redactions.</p>';
}

function removeRedaction(page, id) {
  const list = (pdfState.redactions.get(page) || []).filter((mark) => mark.id !== id);
  if (list.length) pdfState.redactions.set(page, list); else pdfState.redactions.delete(page);
  renderRedactionLayer();
}

function clearRedactions() {
  pdfState.redactions.clear();
  renderRedactionLayer();
}

async function findRedactionMatches() {
  if (!pdfState.document) return;
  const query = $('redaction-search').value.trim();
  if (!query) throw new Error('Enter text or a regular expression to find.');
  let expression;
  try { expression = $('redaction-regex').checked ? new RegExp(query, 'giu') : new RegExp(escapeRegExp(query), 'giu'); }
  catch (error) { throw new Error(`The regular expression is not valid. (${error.message})`); }
  let matchCount = 0;
  for (let virtual = 0; virtual < pdfState.order.length; virtual += 1) {
    const source = pdfState.order[virtual];
    const page = await pdfState.document.getPage(source + 1);
    const content = await page.getTextContent({ disableNormalization: false });
    const viewport = page.getViewport({ scale: 1, rotation: normalizedPageRotation(page, virtual) });
    const segments = [];
    let joined = '';
    content.items.forEach((item, itemIndex) => {
      if (joined) joined += ' ';
      const start = joined.length;
      joined += item.str || '';
      segments.push({ start, end: joined.length, item, itemIndex });
    });
    expression.lastIndex = 0;
    let match;
    while ((match = expression.exec(joined)) && matchCount < 1000) {
      if (!match[0]) { expression.lastIndex += 1; continue; }
      const end = match.index + match[0].length;
      const overlapping = segments.filter((segment) => segment.end > match.index && segment.start < end && segment.item.str);
      overlapping.forEach((segment) => addRedaction(virtual, { ...normalizedTextItemBox(segment.item, viewport), source: 'search', term: match[0] }));
      matchCount += 1;
    }
    await yieldToMain();
  }
  renderRedactionLayer();
  showStatus(`${matchCount} approved search match${matchCount === 1 ? '' : 'es'} marked for review.`);
}

function normalizedTextItemBox(item, viewport) {
  const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const height = Math.max(4, Math.hypot(transform[2], transform[3]));
  const width = Math.max(4, Number(item.width || 0) * viewport.scale);
  return { x: clamp01(transform[4] / viewport.width), y: clamp01((transform[5] - height) / viewport.height), w: clamp01(width / viewport.width), h: clamp01(height / viewport.height) };
}

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function canvasPngBytes(canvas) {
  return canvasImageBytes(canvas, 'image/png');
}

async function canvasImageBytes(canvas, type, quality) {
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The browser could not create a page image.')), type, quality));
  return new Uint8Array(await blob.arrayBuffer());
}

async function applySecureRedactions() {
  const totalMarks = Array.from(pdfState.redactions.values()).reduce((sum, list) => sum + list.length, 0);
  if (!totalMarks) throw new Error('Mark at least one area before applying redactions.');
  await withJob('Applying secure redactions', async (signal) => {
    await materializePageChanges(signal, { allowPendingRedactions: true });
    const replacements = new Map();
    const verifiedTerms = new Set();
    const markedPages = new Set(pdfState.redactions.keys());
    const pages = Array.from({ length: pdfState.pageCount }, (_value, index) => index);
    for (let index = 0; index < pages.length; index += 1) {
      if (signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
      const pageIndex = pages[index];
      updateJobProgress({ current: index, total: pages.length, label: `Securely rebuilding page ${pageIndex + 1} of ${pages.length}` });
      const { canvas, viewport } = await renderPdfPageToCanvas(pageIndex, 2);
      const context = canvas.getContext('2d');
      context.save();
      context.fillStyle = '#000000';
      for (const mark of pdfState.redactions.get(pageIndex) || []) {
        context.fillRect(Math.floor(mark.x * canvas.width) - 2, Math.floor(mark.y * canvas.height) - 2, Math.ceil(mark.w * canvas.width) + 4, Math.ceil(mark.h * canvas.height) + 4);
        if (mark.term) verifiedTerms.add(mark.term);
      }
      context.restore();
      replacements.set(pageIndex, {
        imageBytes: await canvasPngBytes(canvas),
        format: 'png',
        pageWidthPt: viewport.width / viewport.scale,
        pageHeightPt: viewport.height / viewport.scale
      });
      canvas.width = 1; canvas.height = 1;
      await yieldToMain(signal);
    }
    const output = new Uint8Array(await replacePagesWithRasters(pdfState.bytes, replacements, updateJobProgress, signal));
    const verification = await verifyRedactedOutput(output, pages, verifiedTerms);
    pdfState.bytes = output;
    pdfState.redactions.clear();
    await reloadAppliedPdf('Secure redaction completed. A new rasterized working copy is ready.');
    showResult('redaction', {
      blob: pdfBlob(output),
      filename: productFilename(pdfState.file.name, 'Redacted', 'pdf'),
      heading: 'Secure redaction complete',
      message: `${totalMarks} redaction mark${totalMarks === 1 ? '' : 's'} on ${markedPages.size} page${markedPages.size === 1 ? '' : 's'} were burned into a fresh, flattened ${pages.length}-page PDF. Rebuilding every page prevents shared hidden resources from retaining removed content. ${verification}`
    });
  }, 'Every page is rebuilt locally so covered content and shared hidden resources are not retained.');
}

async function verifyRedactedOutput(bytes, pages, terms) {
  const loadingTask = pdfjsLib.getDocument(pdfjsDocumentOptions(bytes.slice()));
  const document = await loadingTask.promise;
  try {
    let extracted = '';
    for (const pageIndex of pages) {
      const page = await document.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      extracted += ` ${content.items.map((item) => item.str || '').join(' ')}`;
    }
    const remaining = Array.from(terms).filter((term) => extracted.toLocaleLowerCase().includes(term.toLocaleLowerCase()) || containsRawString(bytes, term));
    if (remaining.length) return 'The document was rebuilt, but automated string verification found text that may also occur elsewhere. Review the exported copy before sharing.';
    return terms.size ? 'Automated text and raw-stream checks found none of the approved strings in the rebuilt document.' : 'The rebuilt document contains no recoverable original text layer; visually review the exported copy before sharing.';
  } finally { await loadingTask.destroy(); }
}

function applySanitizePreset(preset) {
  const ids = ['sanitize-metadata', 'sanitize-comments', 'sanitize-attachments', 'sanitize-javascript', 'sanitize-links', 'sanitize-form-values'];
  ids.forEach((id) => { $(id).checked = false; });
  const maps = {
    metadata: ['sanitize-metadata'],
    comments: ['sanitize-comments'],
    sharing: ['sanitize-metadata', 'sanitize-comments', 'sanitize-attachments', 'sanitize-javascript', 'sanitize-form-values'],
    maximum: ids
  };
  (maps[preset] || []).forEach((id) => { $(id).checked = true; });
}

function sanitizeOptions() {
  return {
    metadata: $('sanitize-metadata').checked,
    annotations: $('sanitize-comments').checked,
    attachments: $('sanitize-attachments').checked,
    javascript: $('sanitize-javascript').checked,
    actions: $('sanitize-javascript').checked,
    externalLinks: $('sanitize-links').checked,
    formValues: $('sanitize-form-values').checked
  };
}

async function sanitizeWorkingPdf() {
  const options = sanitizeOptions();
  if (!Object.values(options).some(Boolean)) throw new Error('Choose at least one category to remove.');
  await withJob('Sanitizing PDF', async (signal) => {
    await materializePageChanges(signal);
    const result = await sanitizePdf(pdfState.bytes, options);
    pdfState.bytes = new Uint8Array(result.bytes);
    await reloadAppliedPdf(`Removed: ${result.removed.join(', ') || 'the selected categories'}.`);
    showResult('pdf', { blob: pdfBlob(pdfState.bytes), filename: productFilename(pdfState.file.name, 'Sanitized', 'pdf'), heading: 'Sanitized copy ready', message: result.removed.length ? `Removed ${result.removed.join(', ')}.` : 'The selected cleanup completed.' });
  });
}

async function inspectWorkingPdf() {
  if (!pdfState.file) return;
  const structure = await inspectPdfStructure(pdfState.bytes);
  let searchablePages = 0;
  let blankPages = 0;
  const pageTexts = [];
  for (let index = 0; index < pdfState.pageCount; index += 1) {
    const text = await getPageText(index);
    pageTexts.push(text);
    if (text.length > 20) searchablePages += 1;
    if (!text.trim()) blankPages += 1;
    if (index % 20 === 0) await yieldToMain();
  }
  const coverage = pdfState.pageCount ? Math.round(searchablePages / pdfState.pageCount * 100) : 0;
  const cards = [
    healthCard(coverage >= 90 ? 'good' : coverage ? 'review' : 'action', coverage >= 90 ? 'Searchable text looks good' : coverage ? 'Mixed text coverage' : 'Likely scanned PDF', `${searchablePages} of ${pdfState.pageCount} pages contain meaningful selectable text (${coverage}%).`),
    healthCard(structure.encrypted ? 'review' : 'good', structure.encrypted ? 'Encryption detected' : 'No encryption detected', structure.encrypted ? 'Some editing operations may be unavailable and existing signatures can be invalidated by changes.' : 'The file does not advertise PDF encryption.'),
    healthCard(structure.javascript || structure.automaticActions || structure.attachments ? 'action' : 'good', structure.javascript || structure.automaticActions || structure.attachments ? 'Active or embedded content deserves review' : 'No active-content indicators found', `${structure.javascript ? 'JavaScript detected. ' : ''}${structure.automaticActions ? 'Automatic actions detected. ' : ''}${structure.attachments ? `${structure.attachments} attachment indicator${structure.attachments === 1 ? '' : 's'} found.` : ''}` || 'No JavaScript, automatic-action, or embedded-file indicators were found by the local structural checks.'),
    healthCard(structure.annotations || structure.externalLinks ? 'review' : 'good', structure.annotations || structure.externalLinks ? 'Review content remains' : 'No review content indicators', `${structure.annotations} annotation container${structure.annotations === 1 ? '' : 's'} and ${structure.externalLinks} external link indicator${structure.externalLinks === 1 ? '' : 's'}.`),
    healthCard(structure.inconsistentPageSizes ? 'review' : 'good', structure.inconsistentPageSizes ? 'Page sizes vary' : 'Page sizes are consistent', structure.inconsistentPageSizes ? 'This may be intentional, but inspect page transitions before creating a binder.' : `${structure.pageCount} page${structure.pageCount === 1 ? '' : 's'} use a consistent size.`)
  ];
  if (structure.forms.length) cards.push(healthCard('review', `${structure.forms.length} form field${structure.forms.length === 1 ? '' : 's'}`, structure.xfa ? 'XFA is present and is not editable here. Standard fields are available in Forms.' : 'Standard fields can be filled or flattened in the Forms section.'));
  if (structure.signatures) cards.push(healthCard('review', `${structure.signatures} signature indicator${structure.signatures === 1 ? '' : 's'}`, 'Comment Master can report that a signature exists, but does not claim current certificate trust or revocation status. Editing may invalidate the signature.'));
  if (blankPages) cards.push(healthCard('review', `${blankPages} page${blankPages === 1 ? '' : 's'} with no extracted text`, 'These may be image-only or intentionally blank. Review before removing anything.'));
  cards.unshift(`<div class="health-summary"><strong>${humanBytes(structure.fileSize)}</strong><span>${structure.pageCount} pages</span><span>${structure.rawIndicators.images} image objects</span><span>${structure.rawIndicators.fonts} font objects</span></div>`);
  $('pdf-health-results').innerHTML = cards.join('');
  pdfState.inspection = structure;
  return structure;
}

function healthCard(level, title, text) {
  const label = level === 'good' ? 'Good' : level === 'action' ? 'Action Recommended' : 'Worth Reviewing';
  return `<article class="health-card ${level}"><span>${label}</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p></article>`;
}

async function normalizeWorkingPdf() {
  ensureStaticPageCopySafe('Normalizing this PDF');
  await withJob('Normalizing PDF', async (signal) => {
    await materializePageChanges(signal);
    pdfState.bytes = new Uint8Array(await repairPdf(pdfState.bytes));
    await reloadAppliedPdf('The PDF was parsed and rewritten into a normalized working copy. This is not a guarantee that every damaged PDF can be repaired.');
  });
}

async function optimizeWorkingPdf() {
  const mode = $('pdf-optimize-mode').value || 'lossless';
  const label = mode === 'lossless' ? 'Lossless PDF optimization' : mode === 'balanced' ? 'Balanced PDF optimization' : 'Smaller PDF optimization';
  await withJob(label, async (signal) => {
    await materializePageChanges(signal);
    const originalSize = pdfState.bytes.byteLength;
    if (mode === 'lossless') {
      const result = await optimizePdf(pdfState.bytes, 'lossless');
      pdfState.bytes = new Uint8Array(result.bytes);
      await reloadAppliedPdf(`Lossless rewrite complete: ${humanBytes(result.originalSize)} to ${humanBytes(result.resultSize)}.`);
      showResult('pdf', { blob: pdfBlob(pdfState.bytes), filename: productFilename(pdfState.file.name, 'Optimized', 'pdf'), heading: 'Optimized copy ready', message: result.saved > 0 ? `Reduced by ${humanBytes(result.saved)} without rasterizing pages.` : 'The normalized copy is not smaller. No page was rasterized merely to claim a reduction.' });
      return;
    }
    pdfState.bytes = await rasterOptimizePdf(mode, signal);
    const resultSize = pdfState.bytes.byteLength;
    await reloadAppliedPdf(`${mode === 'balanced' ? 'Balanced' : 'Smaller File'} rebuild complete: ${humanBytes(originalSize)} to ${humanBytes(resultSize)}.`);
    const difference = originalSize - resultSize;
    showResult('pdf', {
      blob: pdfBlob(pdfState.bytes),
      filename: productFilename(pdfState.file.name, mode === 'balanced' ? 'Balanced' : 'Smaller', 'pdf'),
      heading: 'Optimized copy ready',
      message: `${pdfState.pageCount} page${pdfState.pageCount === 1 ? '' : 's'} were rebuilt locally as compressed images. ${difference > 0 ? `File size was reduced by ${humanBytes(difference)}.` : 'This source did not become smaller; compare the result before saving.'} Forms, links, tags, bookmarks, and signatures are not retained in this mode.`
    });
  });
}

async function rasterOptimizePdf(mode, signal) {
  const settings = mode === 'balanced' ? { scale: 1.6, quality: .78 } : { scale: 1.1, quality: .56 };
  const replacements = new Map();
  const searchableText = new Map();
  for (let pageIndex = 0; pageIndex < pdfState.pageCount; pageIndex += 1) {
    if (signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
    updateJobProgress({ phase: 'rebuilding', current: pageIndex, total: pdfState.pageCount, label: `Optimizing page ${pageIndex + 1} of ${pdfState.pageCount}` });
    const { canvas, page, viewport } = await renderPdfPageToCanvas(pageIndex, settings.scale);
    const baseViewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const runs = content.items.filter((item) => item.str).map((item) => {
      const box = normalizedTextItemBox(item, viewport);
      return {
        text: item.str,
        x0: box.x * canvas.width,
        y0: box.y * canvas.height,
        x1: (box.x + box.w) * canvas.width,
        y1: (box.y + box.h) * canvas.height
      };
    });
    if (runs.length) searchableText.set(pageIndex, {
      text: content.items.map((item) => item.str || '').join(' '),
      runs,
      rasterWidth: canvas.width,
      rasterHeight: canvas.height
    });
    replacements.set(pageIndex, {
      imageBytes: await canvasImageBytes(canvas, 'image/jpeg', settings.quality),
      format: 'jpg',
      pageWidthPt: baseViewport.width,
      pageHeightPt: baseViewport.height
    });
    canvas.width = 1;
    canvas.height = 1;
    await yieldToMain(signal);
  }
  let output = new Uint8Array(await replacePagesWithRasters(pdfState.bytes, replacements, updateJobProgress, signal));
  if (searchableText.size) output = new Uint8Array(await overlaySearchText(output, searchableText, updateJobProgress, signal));
  return output;
}

async function renderPdfForms() {
  if (!pdfState.file) return;
  const structure = pdfState.inspection || await inspectPdfStructure(pdfState.bytes);
  const container = $('pdf-form-fields');
  if (!structure.forms.length) {
    container.innerHTML = '<div class="health-card good"><h4>No standard form fields found</h4><p>This PDF does not expose standard AcroForm fields.</p></div>';
    return;
  }
  container.innerHTML = structure.forms.map((field, index) => {
    const checkbox = /CheckBox/i.test(field.type);
    const select = /Dropdown|OptionList/i.test(field.type);
    const signature = /Signature/i.test(field.type);
    if (signature) return `<div class="queue-row"><div><strong>${escapeHtml(field.name)}</strong><small>Digital signature field · inspection only</small></div></div>`;
    return `<label class="queue-row"><span><strong>${escapeHtml(field.name)}</strong><small>${escapeHtml(field.type)}</small></span>${checkbox ? `<input type="checkbox" data-form-field="${escapeHtml(field.name)}" ${field.value === 'Checked' ? 'checked' : ''}>` : select ? `<input data-form-field="${escapeHtml(field.name)}" value="${escapeHtml(field.value)}">` : `<input data-form-field="${escapeHtml(field.name)}" value="${escapeHtml(field.value)}">`}</label>`;
  }).join('');
}

function pdfFormValues() {
  const values = {};
  $('pdf-form-fields').querySelectorAll('[data-form-field]').forEach((input) => { values[input.dataset.formField] = input.type === 'checkbox' ? input.checked : input.value; });
  return values;
}

async function savePdfForm(flatten, reset) {
  if (!pdfState.file) return;
  const values = pdfFormValues();
  if (!reset) {
    const unsupported = Object.entries(values).find(([_name, value]) => typeof value === 'string' && !isStandardPdfText(value));
    if (unsupported) throw new Error(`The field “${unsupported[0]}” contains characters that this browser-only form writer cannot embed safely. This release supports standard Latin and Western European form text; leave that field unchanged or use a compatible value.`);
  }
  await withJob(reset ? 'Resetting form fields' : flatten ? 'Flattening PDF form' : 'Completing PDF form', async () => {
    const bytes = await fillAndFlattenPdf(pdfState.bytes, values, { flatten, reset });
    pdfState.bytes = new Uint8Array(bytes);
    await reloadAppliedPdf(reset ? 'Form fields were reset in the working copy.' : flatten ? 'Visible form values were flattened into the working copy.' : 'Form values were added to the working copy.');
    renderPdfForms();
  });
}

function isStandardPdfText(value) {
  const winAnsiExtras = new Set([0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6, 0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122]);
  return Array.from(String(value || '')).every((character) => {
    const point = character.codePointAt(0);
    return point <= 0xff || winAnsiExtras.has(point);
  });
}

async function chooseToolFiles(queue) {
  const files = await chooseFiles({ inputId: `${queue}-files`, multiple: true });
  if (files.length) addToolFiles(queue, files);
}

function addToolFiles(queue, files) {
  if (!['binder', 'convert', 'batch'].includes(queue)) return;
  const incoming = assertSafeFiles(Array.from(files || []));
  const target = toolState[queue];
  incoming.forEach((file) => {
    const duplicate = target.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
    if (!duplicate) target.push({ file, status: 'Ready', error: '', result: null, pageRange: '' });
  });
  renderToolQueue(queue);
}

function removeQueuedFile(queue, index) {
  if (!toolState[queue]) return;
  toolState[queue].splice(index, 1);
  renderToolQueue(queue);
}

function renderToolQueue(queue) {
  const container = $(`${queue}-queue`);
  if (!container) return;
  const items = toolState[queue];
  if (!items.length) {
    container.innerHTML = '<p class="muted">No files added.</p>';
    return;
  }
  container.innerHTML = items.map((item, index) => `<article class="queue-row${item.error ? ' error' : ''}" ${queue === 'binder' ? 'draggable="true"' : ''} data-queue-row="${index}"><span class="file-type">${escapeHtml(detectFormat(item.file).toUpperCase())}</span><div class="queue-file"><strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong><small>${humanBytes(item.file.size)} · ${escapeHtml(item.status || 'Ready')}</small>${item.error ? `<small class="queue-error">${escapeHtml(item.error)}</small>` : ''}${queue === 'binder' && detectFormat(item.file) === 'pdf' ? `<label>Pages <input data-binder-range="${index}" value="${escapeHtml(item.pageRange || '')}" placeholder="All or 1-3, 8"></label>` : ''}</div>${item.result ? `<button class="btn btn-light" data-result-index="${index}" type="button">Save</button>` : ''}<button class="btn btn-light" data-wb-action="remove-queued-file" data-queue="${queue}" data-index="${index}" type="button">Remove</button></article>`).join('');
  container.querySelectorAll('[data-binder-range]').forEach((input) => input.addEventListener('input', () => { toolState.binder[Number(input.dataset.binderRange)].pageRange = input.value; }));
  container.querySelectorAll('[data-result-index]').forEach((button) => button.addEventListener('click', () => {
    const result = items[Number(button.dataset.resultIndex)].result;
    if (result) saveBlob(result.blob, result.filename);
  }));
  if (queue === 'binder') bindBinderReordering(container);
}

function bindBinderReordering(container) {
  container.querySelectorAll('[data-queue-row]').forEach((row) => {
    row.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', row.dataset.queueRow));
    row.addEventListener('dragover', (event) => { event.preventDefault(); row.classList.add('dragover'); });
    row.addEventListener('dragleave', () => row.classList.remove('dragover'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      row.classList.remove('dragover');
      const from = Number(event.dataTransfer.getData('text/plain'));
      const to = Number(row.dataset.queueRow);
      if (!Number.isInteger(from) || from === to) return;
      const [item] = toolState.binder.splice(from, 1);
      toolState.binder.splice(to, 0, item);
      renderToolQueue('binder');
    });
  });
}

async function buildBinder() {
  if (!toolState.binder.length) throw new Error('Add at least one file to the binder.');
  await withJob('Building binder', async (signal) => {
    const inputs = [];
    const skipped = [];
    for (let index = 0; index < toolState.binder.length; index += 1) {
      const item = toolState.binder[index];
      item.status = 'Converting'; item.error = '';
      renderToolQueue('binder');
      updateJobProgress({ phase: 'converting', current: index, total: toolState.binder.length, label: `Converting ${index + 1} of ${toolState.binder.length}: ${item.file.name}` });
      try {
        const bytes = await convertFileToPdfBytes(item.file, signal);
        let pageIndices;
        if (item.pageRange && detectFormat(item.file) === 'pdf') {
          const document = await loadPdf(bytes);
          pageIndices = parsePageRanges(item.pageRange, document.getPageCount());
        }
        inputs.push({ bytes, name: item.file.name, pageIndices });
        item.status = 'Ready';
      } catch (error) {
        item.status = 'Skipped'; item.error = friendlyError(error); skipped.push(item.file.name);
      }
      renderToolQueue('binder');
      await yieldToMain(signal);
    }
    if (!inputs.length) throw new Error('None of the selected files could be added to the binder. Review the item-level errors and try again.');
    const result = await mergePdfInputs(inputs, {
      tableOfContents: $('binder-toc').checked,
      dividers: $('binder-dividers').checked,
      sourceLabels: $('binder-labels').checked,
      pageNumbers: $('binder-page-numbers').checked,
      bookmarks: true
    }, updateJobProgress, signal);
    const firstName = inputs[0].name || 'Documents';
    showResult('binder', {
      blob: pdfBlob(result.bytes), filename: productFilename(firstName, 'Binder', 'pdf'),
      heading: 'Binder ready',
      message: `${inputs.length} source file${inputs.length === 1 ? '' : 's'} produced a ${result.pageCount}-page binder${skipped.length ? `. ${skipped.length} damaged or unsupported item${skipped.length === 1 ? ' was' : 's were'} skipped.` : '.'}`
    });
  }, 'Files are converted one at a time so one damaged item does not discard the rest.');
}

async function chooseInspectorFiles() {
  const files = await chooseFiles({ inputId: 'inspect-files', multiple: true });
  if (files.length) inspectFiles(files);
}

async function convertQueuedFiles() {
  if (!toolState.convert.length) throw new Error('Add at least one file to convert.');
  const output = $('convert-output').value;
  await withJob('Converting files', async (signal) => {
    const results = [];
    for (let index = 0; index < toolState.convert.length; index += 1) {
      const item = toolState.convert[index];
      item.status = 'Converting'; item.error = ''; item.result = null;
      renderToolQueue('convert');
      updateJobProgress({ phase: 'converting', current: index, total: toolState.convert.length, label: `Converting ${index + 1} of ${toolState.convert.length}: ${item.file.name}` });
      try {
        const result = await convertFile(item.file, output, signal);
        item.status = 'Complete'; item.result = result; results.push(result);
      } catch (error) {
        item.status = 'Error'; item.error = friendlyError(error);
      }
      renderToolQueue('convert');
      await yieldToMain(signal);
    }
    if (!results.length) throw new Error('No conversion completed. Review the item-level errors.');
    if (results.length === 1) showResult('conversion', { ...results[0], heading: 'Conversion ready', message: results[0].note || 'The converted copy is ready.' });
    else {
      const zip = new window.JSZip();
      results.forEach((result) => zip.file(result.filename, result.blob));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      showResult('conversion', { blob, filename: `Converted Documents (${dateStamp()}).zip`, heading: 'Conversions ready', message: `${results.length} converted files were packaged together. Individual Save buttons remain available in the queue.` });
    }
  });
}

async function convertFile(file, output, signal) {
  const format = detectFormat(file);
  if (output === 'pdf') {
    const bytes = await convertFileToPdfBytes(file, signal);
    return { blob: pdfBlob(bytes), filename: productFilename(file.name, 'Converted', 'pdf'), note: officeConversionNote(format) };
  }
  if (output === 'images') {
    if (format !== 'pdf') throw new Error('PDF page images require a PDF input.');
    return pdfToImages(file, signal);
  }
  const extracted = await extractFileContent(file, signal);
  if (output === 'txt') return { blob: new Blob([extracted.text], { type: 'text/plain;charset=utf-8' }), filename: productFilename(file.name, 'Converted', 'txt'), note: extracted.note };
  if (output === 'html') {
    const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(file.name)}</title><main>${extracted.html || `<pre>${escapeHtml(extracted.text)}</pre>`}</main>`;
    return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), filename: productFilename(file.name, 'Converted', 'html'), note: extracted.note };
  }
  if (output === 'md') return { blob: new Blob([extracted.markdown || extracted.text], { type: 'text/markdown;charset=utf-8' }), filename: productFilename(file.name, 'Converted', 'md'), note: extracted.note };
  if (output === 'docx') return { blob: await createBasicDocx(extracted.text, file.name), filename: productFilename(file.name, 'Converted', 'docx'), note: extracted.note };
  throw new Error(`The ${output} conversion is not available for this file.`);
}

function officeConversionNote(format) {
  if (['docx', 'xlsx', 'pptx', 'odt', 'rtf'].includes(format)) return 'Text and readable structure were preserved, but complex Office layout, charts, and pagination may differ from the source.';
  return 'The conversion completed locally.';
}

async function convertFileToPdfBytes(file, signal) {
  const format = detectFormat(file);
  if (format === 'pdf') return new Uint8Array(await file.arrayBuffer());
  if (['png', 'jpg'].includes(format)) return new Uint8Array(await createPdfFromImages([file], {}, updateJobProgress, signal));
  if (['webp', 'gif'].includes(format)) {
    const png = await imageFileToPng(file);
    return new Uint8Array(await createPdfFromImages([png], {}, updateJobProgress, signal));
  }
  const extracted = await extractFileContent(file, signal);
  if (!extracted.text.trim()) throw new Error(`${file.name} did not contain convertible text.`);
  return new Uint8Array(await createTextPdf(extracted.text, { title: file.name }));
}

async function extractFileContent(file, signal) {
  const format = detectFormat(file);
  if (['txt', 'csv'].includes(format)) {
    const text = await file.text();
    return { text, html: `<pre>${escapeHtml(text)}</pre>`, markdown: text };
  }
  if (format === 'md') {
    const markdown = await file.text();
    const html = DOMPurify.sanitize(marked.parse(markdown), sanitizerOptions());
    return { text: htmlToText(html), html, markdown };
  }
  if (format === 'html') {
    const html = DOMPurify.sanitize(await file.text(), sanitizerOptions());
    return { text: htmlToText(html), html, markdown: htmlToText(html) };
  }
  if (format === 'rtf') {
    const text = rtfToText(await file.text());
    return { text, html: `<pre>${escapeHtml(text)}</pre>`, markdown: text, note: 'Readable RTF text was preserved. Complex formatting may differ.' };
  }
  if (format === 'docx') return extractDocxWithMammoth(file);
  if (['xlsx', 'pptx', 'odt'].includes(format)) {
    const text = await extractZipOfficeText(file, format, signal);
    return { text, html: `<pre>${escapeHtml(text)}</pre>`, markdown: text, note: officeConversionNote(format) };
  }
  if (format === 'pdf') {
    const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()), signal);
    return { text, html: `<pre>${escapeHtml(text)}</pre>`, markdown: text, note: 'PDF text was extracted in reading order where available. Complex layout may differ.' };
  }
  throw new Error(`${formatLabel(format)} conversion is not supported for this output.`);
}

function sanitizerOptions() {
  return {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'link', 'meta',
      'img', 'picture', 'source', 'video', 'audio', 'track'
    ],
    FORBID_ATTR: ['src', 'srcset', 'href', 'xlink:href', 'poster'],
    ALLOW_DATA_ATTR: false
  };
}

function htmlToText(html) {
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(html, sanitizerOptions());
  container.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  container.querySelectorAll('p,div,li,tr,h1,h2,h3,h4,h5,h6,blockquote').forEach((node) => node.append('\n'));
  return (container.textContent || '').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

async function loadMammoth() {
  if (window.mammoth) return window.mammoth;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/mammoth/mammoth.browser.min.js', import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error('The local Word conversion component could not be prepared.'));
    document.head.appendChild(script);
  });
  return window.mammoth;
}

async function extractDocxWithMammoth(file) {
  const mammoth = await loadMammoth();
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { ignoreEmptyParagraphs: false, externalFileAccess: false });
  const html = DOMPurify.sanitize(result.value, sanitizerOptions());
  return { text: htmlToText(html), html, markdown: htmlToText(html), note: 'Readable Word structure and text were preserved. Exact page layout, fields, and floating objects may differ.' };
}

async function extractZipOfficeText(file, format, signal) {
  const zip = await safeLoadZip(file);
  let paths = [];
  if (format === 'odt') paths = ['content.xml'];
  if (format === 'pptx') paths = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path)).sort(naturalPathSort);
  if (format === 'xlsx') paths = Object.keys(zip.files).filter((path) => /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(path)).sort(naturalPathSort);
  const texts = [];
  for (const path of paths) {
    if (signal && signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
    const xml = await zip.file(path).async('text');
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.querySelector('parsererror')) throw new Error(`${file.name} contains malformed XML in ${path}.`);
    const values = Array.from(parsed.getElementsByTagName('*')).filter((node) => ['t', 'p', 'h'].includes(node.localName)).map((node) => node.textContent || '').filter(Boolean);
    if (values.length) texts.push(values.join(format === 'xlsx' ? '\t' : ' '));
    await yieldToMain(signal);
  }
  return texts.join('\n\n').trim();
}

function naturalPathSort(left, right) { return left.localeCompare(right, undefined, { numeric: true }); }

function rtfToText(rtf) {
  return String(rtf).replace(/\\par[d]?\b/g, '\n').replace(/\\tab\b/g, '\t').replace(/\\'[0-9a-f]{2}/gi, (match) => String.fromCharCode(parseInt(match.slice(2), 16))).replace(/\\u(-?\d+)\??/g, (_match, value) => String.fromCharCode(Number(value) < 0 ? Number(value) + 65536 : Number(value))).replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

async function extractPdfText(bytes, signal) {
  const task = pdfjsLib.getDocument(pdfjsDocumentOptions(bytes.slice()));
  const document = await task.promise;
  try {
    const pages = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      if (signal && signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim());
    }
    return pages.join('\n\n');
  } finally { await task.destroy(); }
}

async function imageFileToPng(file) {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > MAX_RENDER_PIXELS) { bitmap.close(); throw new Error(`${file.name} has too many decoded pixels to process safely.`); }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The image could not be converted.')), 'image/png'));
  canvas.width = 1; canvas.height = 1;
  return new File([blob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' });
}

async function pdfToImages(file, signal) {
  const task = pdfjsLib.getDocument(pdfjsDocumentOptions(new Uint8Array(await file.arrayBuffer())));
  const document = await task.promise;
  const zip = new window.JSZip();
  try {
    for (let index = 1; index <= document.numPages; index += 1) {
      if (signal && signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 2 });
      if (viewport.width * viewport.height > MAX_RENDER_PIXELS) throw new Error(`Page ${index} is too large to render safely.`);
      const pageCanvas = window.document.createElement('canvas');
      pageCanvas.width = Math.ceil(viewport.width); pageCanvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: pageCanvas.getContext('2d', { alpha: false }), viewport }).promise;
      zip.file(`${safeFilename(file.name.replace(/\.pdf$/i, ''))} - Page ${index}.png`, await canvasPngBytes(pageCanvas));
      pageCanvas.width = 1; pageCanvas.height = 1;
      updateJobProgress({ current: index, total: document.numPages, label: `Rendering page ${index} of ${document.numPages}` });
    }
  } finally { await task.destroy(); }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  return { blob, filename: productFilename(file.name, 'Page Images', 'zip'), note: 'Each PDF page was rendered to a PNG image.' };
}

async function createBasicDocx(text, sourceName) {
  const zip = new window.JSZip();
  const paragraphs = String(text || '').split(/\r?\n/).map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('');
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(sourceName)}</dc:title><dc:creator>Comment Master</dc:creator></cp:coreProperties>`);
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function escapeXml(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function dateStamp(date = new Date()) { return `${date.getDate()}.${date.getMonth() + 1}.${String(date.getFullYear()).slice(-2)}`; }

async function inspectFiles(files) {
  const list = assertSafeFiles(Array.from(files || []));
  toolState.inspectorFiles = list;
  switchRoute('tools');
  switchToolTab('inspect');
  await withJob('Inspecting documents', async (signal) => {
    const results = [];
    for (let index = 0; index < list.length; index += 1) {
      updateJobProgress({ current: index, total: list.length, label: `Inspecting ${index + 1} of ${list.length}: ${list[index].name}` });
      try { results.push(await inspectAnyFile(list[index], signal)); }
      catch (error) { results.push({ name: list[index].name, format: detectFormat(list[index]), error: friendlyError(error) }); }
      await yieldToMain(signal);
    }
    renderInspectorResults(results);
  });
}

async function inspectAnyFile(file, signal) {
  const format = detectFormat(file);
  if (format === 'pdf') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const structure = await inspectPdfStructure(bytes);
    let searchable = 0;
    let task = null;
    try {
      task = pdfjsLib.getDocument(pdfjsDocumentOptions(bytes.slice()));
      const document = await task.promise;
      for (let index = 1; index <= document.numPages; index += 1) {
        if (signal && signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
        const page = await document.getPage(index);
        const content = await page.getTextContent();
        if (content.items.map((item) => item.str || '').join('').trim().length > 20) searchable += 1;
      }
    } catch (_) { /* structural results remain useful */ }
    finally { if (task) await task.destroy().catch(() => {}); }
    return { name: file.name, format, size: file.size, structure, searchable };
  }
  if (format === 'docx') return { name: file.name, format, size: file.size, docx: await inspectDocx(file) };
  const content = await extractFileContent(file, signal).catch(() => ({ text: '' }));
  return { name: file.name, format, size: file.size, textLength: content.text.length, lines: content.text ? content.text.split(/\r?\n/).length : 0 };
}

function renderInspectorResults(results) {
  $('inspector-results').innerHTML = results.map((result) => {
    if (result.error) return `<article class="health-card action"><span>Action Recommended</span><h4>${escapeHtml(result.name)}</h4><p>${escapeHtml(result.error)}</p></article>`;
    if (result.format === 'pdf') {
      const info = result.structure;
      const concerns = info.encrypted || info.javascript || info.automaticActions || info.attachments;
      return `<article class="health-card ${concerns ? 'review' : 'good'}"><span>${concerns ? 'Worth Reviewing' : 'Good'}</span><h4>${escapeHtml(result.name)}</h4><p>${humanBytes(result.size)} · ${info.pageCount} pages · ${result.searchable} searchable · ${info.formCount} form fields</p><dl class="compact-facts"><div><dt>Metadata</dt><dd>${escapeHtml([info.metadata.author, info.metadata.title].filter(Boolean).join(' · ') || 'None found')}</dd></div><div><dt>Review content</dt><dd>${info.annotations} annotation indicators · ${info.externalLinks} external links</dd></div><div><dt>Embedded or active</dt><dd>${info.attachments} attachments · ${info.javascript || info.automaticActions ? 'Actions found' : 'None found'}</dd></div><div><dt>Signatures</dt><dd>${info.signatures || 'None detected'}</dd></div></dl></article>`;
    }
    if (result.format === 'docx') {
      const info = result.docx;
      const concerns = info.comments || info.revisions || info.hiddenRuns || info.externalRelationships || info.embeddedObjects || info.macros;
      return `<article class="health-card ${concerns ? 'review' : 'good'}"><span>${concerns ? 'Worth Reviewing' : 'Good'}</span><h4>${escapeHtml(result.name)}</h4><p>${humanBytes(result.size)} · ${info.words.toLocaleString()} words · ${info.paragraphs.toLocaleString()} paragraphs</p><dl class="compact-facts"><div><dt>Review content</dt><dd>${info.comments} comments · ${info.revisions} tracked changes · ${info.reviewers.length} reviewers</dd></div><div><dt>Structure</dt><dd>${info.sections} sections · ${info.tables} tables · ${info.images} images</dd></div><div><dt>Privacy</dt><dd>${info.hiddenRuns} hidden runs · ${info.customProperties ? 'custom properties' : 'no custom properties'}</dd></div><div><dt>Relationships</dt><dd>${info.externalRelationships} external · ${info.embeddedObjects} embedded objects${info.macros ? ' · macros detected' : ''}</dd></div></dl></article>`;
    }
    return `<article class="health-card good"><span>Good</span><h4>${escapeHtml(result.name)}</h4><p>${humanBytes(result.size)} · ${escapeHtml(formatLabel(result.format))} · ${Number(result.textLength || 0).toLocaleString()} readable characters</p></article>`;
  }).join('');
}

async function safeLoadZip(file) {
  if (!window.JSZip) throw new Error('The local Office package reader is unavailable.');
  const fileName = file.name || 'Office package';
  if (file.size > 100 * 1024 * 1024) throw new Error(`${fileName} exceeds the 100 MB Office-package safety limit.`);
  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (signature.length < 4 || signature[0] !== 0x50 || signature[1] !== 0x4b) throw new Error(`${fileName} is not a valid ZIP-based Office package.`);
  const zip = await window.JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  const entries = Object.values(zip.files);
  if (entries.length > 5000) throw new Error(`${fileName} contains too many package entries.`);
  let totalExpanded = 0;
  entries.forEach((entry) => {
    const name = entry.unsafeOriginalName || entry.name;
    if (/^(?:\/|\\)|(?:^|[\/\\])\.\.(?:[\/\\]|$)|\0/.test(name)) throw new Error(`${fileName} contains an unsafe package path.`);
    const size = Number(entry._data && entry._data.uncompressedSize || 0);
    const compressed = Number(entry._data && entry._data.compressedSize || 0);
    if (!Number.isFinite(size) || size < 0 || !Number.isFinite(compressed) || compressed < 0) throw new Error(`${fileName} has invalid package size information.`);
    if (size > 64 * 1024 * 1024) throw new Error(`${fileName} contains an unusually large package entry.`);
    if (size > 1024 * 1024 && compressed > 0 && size / compressed > 200) throw new Error(`${fileName} contains an unsafe compression ratio.`);
    totalExpanded += size;
  });
  if (totalExpanded > 256 * 1024 * 1024) throw new Error(`${fileName} expands beyond the 256 MB Office-package safety limit.`);
  return window.JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
}

async function inspectDocx(file) {
  const zip = await safeLoadZip(file);
  const paths = Object.keys(zip.files);
  const wordXmlPaths = paths.filter((path) => /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments\d*)\.xml$/i.test(path));
  if (wordXmlPaths.length > 512) throw new Error(`${file.name} contains too many Word story parts to inspect safely.`);
  let text = '';
  let paragraphs = 0;
  let tables = 0;
  let sections = 0;
  let comments = 0;
  let revisions = 0;
  let hiddenRuns = 0;
  const reviewers = new Set();
  for (const path of wordXmlPaths) {
    const xml = await zip.file(path).async('text');
    const document = parseXmlSafe(xml, path);
    text += ` ${elementsByLocal(document, 't').map((node) => node.textContent || '').join(' ')}`;
    paragraphs += elementsByLocal(document, 'p').length;
    tables += elementsByLocal(document, 'tbl').length;
    sections += elementsByLocal(document, 'sectPr').length;
    if (/comments/i.test(path)) comments += elementsByLocal(document, 'comment').length;
    ['ins', 'del', 'moveFrom', 'moveTo', 'pPrChange', 'rPrChange', 'tblPrChange', 'trPrChange', 'tcPrChange', 'cellIns', 'cellDel', 'cellMerge'].forEach((name) => {
      const nodes = elementsByLocal(document, name);
      revisions += nodes.length;
      nodes.forEach((node) => {
        const author = Array.from(node.attributes || []).find((attribute) => attribute.localName === 'author');
        if (author && author.value) reviewers.add(author.value);
      });
    });
    elementsByLocal(document, 'comment').forEach((node) => {
      const author = Array.from(node.attributes || []).find((attribute) => attribute.localName === 'author');
      if (author && author.value) reviewers.add(author.value);
    });
    hiddenRuns += elementsByLocal(document, 'r').filter((run) => elementsByLocal(run, 'vanish').length || elementsByLocal(run, 'webHidden').length).length;
  }
  let externalRelationships = 0;
  for (const path of paths.filter((name) => /\.rels$/i.test(name))) {
    const xml = await zip.file(path).async('text');
    externalRelationships += (xml.match(/TargetMode\s*=\s*["']External["']/gi) || []).length;
  }
  const core = zip.file('docProps/core.xml') ? await zip.file('docProps/core.xml').async('text') : '';
  const appProps = zip.file('docProps/app.xml') ? await zip.file('docProps/app.xml').async('text') : '';
  const words = text.trim() ? (text.trim().match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length : 0;
  return {
    words, characters: Array.from(text.replace(/\s/g, '')).length, paragraphs, tables,
    sections: sections || Number((appProps.match(/<Pages>(\d+)<\/Pages>/i) || [])[1] || 0),
    comments, revisions, reviewers: Array.from(reviewers), hiddenRuns,
    images: paths.filter((path) => /^word\/media\//i.test(path)).length,
    headers: paths.filter((path) => /^word\/header\d*\.xml$/i.test(path)).length,
    footers: paths.filter((path) => /^word\/footer\d*\.xml$/i.test(path)).length,
    footnotes: paths.includes('word/footnotes.xml'), endnotes: paths.includes('word/endnotes.xml'),
    customProperties: paths.includes('docProps/custom.xml'),
    embeddedObjects: paths.filter((path) => /^word\/(?:embeddings|activeX)\//i.test(path)).length,
    macros: paths.some((path) => /vbaProject\.bin$|activeX/i.test(path)), externalRelationships,
    metadata: { creator: xmlText(core, 'creator'), lastModifiedBy: xmlText(core, 'lastModifiedBy'), title: xmlText(core, 'title'), subject: xmlText(core, 'subject') }
  };
}

function parseXmlSafe(xml, path) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(`${path} contains unsupported XML entity declarations.`);
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error(`${path} contains malformed XML.`);
  return document;
}

function elementsByLocal(root, localName) { return Array.from(root.getElementsByTagName('*')).filter((node) => node.localName === localName); }
function xmlText(xml, localName) { if (!xml) return ''; const document = parseXmlSafe(xml, 'document properties'); const node = elementsByLocal(document, localName)[0]; return node ? node.textContent || '' : ''; }

async function runBatch() {
  if (!toolState.batch.length) throw new Error('Add at least one file to the batch queue.');
  const operation = $('batch-operation').value;
  toolState.batchResults = [];
  await withJob('Processing batch', async (signal) => {
    for (let index = 0; index < toolState.batch.length; index += 1) {
      const item = toolState.batch[index];
      item.status = 'Processing'; item.error = ''; item.result = null;
      renderToolQueue('batch');
      updateJobProgress({ phase: 'batch', current: index, total: toolState.batch.length, label: `${index + 1} of ${toolState.batch.length}: ${item.file.name}` });
      try {
        const result = await runBatchItem(item.file, operation, signal);
        item.status = 'Complete'; item.result = result; toolState.batchResults.push(result);
      } catch (error) {
        item.status = 'Error'; item.error = friendlyError(error);
      }
      renderToolQueue('batch');
      await yieldToMain(signal);
    }
    $('batch-download-zip').disabled = !toolState.batchResults.length;
    showStatus(`${toolState.batchResults.length} of ${toolState.batch.length} batch items completed.`);
  });
}

async function runBatchItem(file, operation, signal) {
  const format = detectFormat(file);
  if (operation === 'inspect') {
    const result = await inspectAnyFile(file, signal);
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    return { blob, filename: productFilename(file.name, 'Health Check', 'json') };
  }
  if (operation === 'convert-pdf') return convertFile(file, 'pdf', signal);
  if (operation === 'remove-metadata') {
    if (format === 'pdf') {
      const result = await sanitizePdf(new Uint8Array(await file.arrayBuffer()), { metadata: true });
      return { blob: pdfBlob(result.bytes), filename: productFilename(file.name, 'Clean', 'pdf') };
    }
    if (format === 'docx') {
      const blob = await cleanWordFile(file, { personalMetadata: true, customProperties: true });
      return { blob, filename: productFilename(file.name, 'Clean', 'docx') };
    }
    throw new Error('Metadata removal is available for PDF and DOCX files.');
  }
  if (!['pdf'].includes(format)) throw new Error('This batch operation requires PDF files.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (operation === 'page-numbers') return { blob: pdfBlob(await addPdfMarks(bytes, { pageNumbers: true }, updateJobProgress, signal)), filename: productFilename(file.name, 'Numbered', 'pdf') };
  if (operation === 'watermark') {
    const watermark = $('batch-watermark').value.trim();
    if (!watermark) throw new Error('Enter watermark text before running the batch.');
    return { blob: pdfBlob(await addPdfMarks(bytes, { watermark }, updateJobProgress, signal)), filename: productFilename(file.name, 'Watermarked', 'pdf') };
  }
  if (operation === 'optimize') {
    const result = await optimizePdf(bytes, 'lossless');
    return { blob: pdfBlob(result.bytes), filename: productFilename(file.name, 'Optimized', 'pdf') };
  }
  throw new Error('Choose a supported batch operation.');
}

async function downloadBatchZip() {
  if (!toolState.batchResults.length) return;
  const zip = new window.JSZip();
  toolState.batchResults.forEach((result) => zip.file(result.filename, result.blob));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  await saveBlob(blob, `Comment Master Batch (${dateStamp()}).zip`);
}

async function chooseCleanWordFile() {
  const files = await chooseFiles({ inputId: 'clean-word-file', multiple: false, accept: ['.docx'], description: 'Word document' });
  if (files[0]) setCleanWordFile(files[0]);
}

async function useCurrentWordForClean() {
  if (!window.CommentMasterWord || !window.CommentMasterWord.hasDocument()) throw new Error('Open a Word document before choosing the current document.');
  setCleanWordFile(await window.CommentMasterWord.currentDocumentFile());
}

function setCleanWordFile(file) {
  if (!file) return;
  if (detectFormat(file) !== 'docx') throw new Error('Create Clean Word Copy requires a DOCX file.');
  app.cleanWordFile = file;
  $('clean-word-source').textContent = `${file.name} · ${humanBytes(file.size)}`;
  renderCleanWordPreview();
}

function cleanWordOptions() {
  return {
    acceptChanges: $('clean-accept-changes').checked,
    removeComments: $('clean-remove-comments').checked,
    reviewMetadata: $('clean-review-metadata').checked,
    personalMetadata: $('clean-personal-metadata').checked,
    hiddenText: $('clean-hidden-text').checked,
    customProperties: $('clean-custom-properties').checked,
    externalRelationships: $('clean-external-relationships').checked,
    embeddedContent: $('clean-embedded-content').checked
  };
}

async function renderCleanWordPreview() {
  if (!app.cleanWordFile) {
    $('clean-word-preview').textContent = 'Choose a document to preview the cleanup.';
    return;
  }
  try {
    const info = await inspectDocx(app.cleanWordFile);
    const options = cleanWordOptions();
    const changes = [];
    if (options.acceptChanges) changes.push(`accept ${info.revisions} tracked changes`);
    if (options.removeComments) changes.push(`remove ${info.comments} comments`);
    if (options.reviewMetadata) changes.push('remove review attribution that remains');
    if (options.personalMetadata) changes.push('clear personal document properties');
    if (options.hiddenText) changes.push(`remove ${info.hiddenRuns} hidden text runs`);
    if (options.customProperties && info.customProperties) changes.push('remove custom properties');
    if (options.externalRelationships) changes.push(`remove ${info.externalRelationships} external relationships`);
    if (options.embeddedContent) changes.push(`remove ${info.embeddedObjects} embedded or active items`);
    $('clean-word-preview').innerHTML = `<strong>Planned cleanup</strong><p>${changes.length ? escapeHtml(changes.join('; ')) : 'No cleanup operations are selected.'}.</p><p>Visible substantive language is not otherwise rewritten.</p>`;
  } catch (error) { $('clean-word-preview').textContent = friendlyError(error); }
}

async function createCleanWordCopy() {
  if (!app.cleanWordFile) throw new Error('Choose a Word document to clean.');
  const options = cleanWordOptions();
  if (!Object.values(options).some(Boolean)) throw new Error('Choose at least one cleanup operation.');
  await withJob('Creating clean Word copy', async () => {
    const blob = await cleanWordFile(app.cleanWordFile, options);
    showResult('clean-word', { blob, filename: productFilename(app.cleanWordFile.name, 'Clean', 'docx'), heading: 'Clean Word copy ready', message: 'The selected review, metadata, hidden-text, relationship, and embedded-content cleanup was applied to a new copy. Open the result in Word and review it before external sharing.' });
  });
}

async function cleanWordFile(file, options) {
  const zip = await safeLoadZip(file);
  const serializer = new XMLSerializer();
  const paths = Object.keys(zip.files);
  const storyPaths = paths.filter((path) => /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments\d*)\.xml$/i.test(path));
  if (storyPaths.length > 512) throw new Error(`${file.name} contains too many Word story parts to clean safely.`);
  const modifiedParts = new Set();
  for (const path of storyPaths) {
    const entry = zip.file(path);
    if (!entry) continue;
    const document = parseXmlSafe(await entry.async('text'), path);
    if (options.acceptChanges) acceptWordRevisions(document);
    if (options.removeComments) removeWordCommentMarkers(document);
    if (options.reviewMetadata) clearReviewAttributes(document);
    if (options.hiddenText) removeHiddenWordRuns(document);
    zip.file(path, serializer.serializeToString(document));
    modifiedParts.add(path);
  }
  if (options.personalMetadata && zip.file('docProps/core.xml')) {
    const document = parseXmlSafe(await zip.file('docProps/core.xml').async('text'), 'docProps/core.xml');
    ['creator', 'lastModifiedBy', 'created', 'modified', 'lastPrinted', 'revision', 'totalTime'].forEach((name) => elementsByLocal(document, name).forEach((node) => { node.textContent = ''; }));
    zip.file('docProps/core.xml', serializer.serializeToString(document));
    modifiedParts.add('docProps/core.xml');
  }
  if (options.reviewMetadata && !options.removeComments) await anonymizeModernReviewMetadata(zip, serializer, modifiedParts);
  if (options.removeComments) removeZipPaths(zip, (path) => /^word\/(?:comments\d*|people|commentsExtended|commentsIds|commentsExtensible)\.xml$/i.test(path));
  if (options.customProperties) removeZipPaths(zip, (path) => /^docProps\/custom\.xml$/i.test(path));
  if (options.embeddedContent) removeZipPaths(zip, (path) => /^(?:word\/(?:embeddings|activeX)\/|customUI\/)|vbaProject\.bin$/i.test(path));
  (await cleanRelationshipParts(zip, options, serializer)).forEach((path) => modifiedParts.add(path));
  if (await cleanContentTypes(zip, options, serializer)) modifiedParts.add('[Content_Types].xml');
  const blob = await zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'DOS' });
  await validateCleanWordPackage(blob, modifiedParts);
  return blob;
}

function acceptWordRevisions(document) {
  const deletionNames = new Set(['del', 'moveFrom']);
  const insertionNames = new Set(['ins', 'moveTo']);
  Array.from(document.getElementsByTagName('*')).reverse().forEach((node) => {
    if (deletionNames.has(node.localName)) node.remove();
    else if (insertionNames.has(node.localName)) unwrapNode(node);
    else if (node.localName === 'cellDel') {
      const cell = closestLocal(node, 'tc');
      if (cell) cell.remove(); else node.remove();
    } else if (/Change$/.test(node.localName) || /Range(?:Start|End)$/.test(node.localName) || ['cellIns', 'cellMerge'].includes(node.localName)) node.remove();
  });
}

function unwrapNode(node) { const parent = node.parentNode; if (!parent) return; while (node.firstChild) parent.insertBefore(node.firstChild, node); parent.removeChild(node); }
function closestLocal(node, name) { let current = node.parentNode; while (current && current.nodeType === 1) { if (current.localName === name) return current; current = current.parentNode; } return null; }

function removeWordCommentMarkers(document) {
  const names = new Set(['commentRangeStart', 'commentRangeEnd', 'commentReference', 'comment', 'commentReference']);
  Array.from(document.getElementsByTagName('*')).filter((node) => names.has(node.localName)).forEach((node) => node.remove());
}

function clearReviewAttributes(document) {
  Array.from(document.getElementsByTagName('*')).forEach((node) => Array.from(node.attributes || []).forEach((attribute) => {
    if (attribute.localName === 'author') attribute.value = 'Anonymous';
    else if (attribute.localName === 'initials') attribute.value = '';
    else if (attribute.localName === 'date') node.removeAttributeNode(attribute);
  }));
}

async function anonymizeModernReviewMetadata(zip, serializer, modifiedParts) {
  const paths = Object.keys(zip.files).filter((path) => /^word\/(?:people|commentsExtended|commentsIds|commentsExtensible)\.xml$/i.test(path));
  for (const path of paths) {
    const document = parseXmlSafe(await zip.file(path).async('text'), path);
    Array.from(document.getElementsByTagName('*')).forEach((node) => Array.from(node.attributes || []).forEach((attribute) => {
      if (['author', 'name', 'displayName'].includes(attribute.localName)) attribute.value = 'Anonymous';
      else if (['initials', 'providerId', 'userId'].includes(attribute.localName)) attribute.value = '';
    }));
    zip.file(path, serializer.serializeToString(document));
    modifiedParts.add(path);
  }
}

function removeHiddenWordRuns(document) {
  elementsByLocal(document, 'r').filter((run) => elementsByLocal(run, 'vanish').length || elementsByLocal(run, 'webHidden').length).forEach((run) => run.remove());
}

function removeZipPaths(zip, predicate) { Object.keys(zip.files).filter(predicate).forEach((path) => zip.remove(path)); }

async function cleanRelationshipParts(zip, options, serializer) {
  const modified = new Set();
  for (const path of Object.keys(zip.files).filter((name) => /\.rels$/i.test(name))) {
    const entry = zip.file(path);
    if (!entry) continue;
    const document = parseXmlSafe(await entry.async('text'), path);
    const removed = new Map();
    elementsByLocal(document, 'Relationship').forEach((relationship) => {
      const id = relationship.getAttribute('Id') || '';
      const type = relationship.getAttribute('Type') || '';
      const targetMode = relationship.getAttribute('TargetMode') || '';
      const remove = options.removeComments && /comments|people/i.test(type)
        || options.customProperties && /custom-properties/i.test(type)
        || options.externalRelationships && /external/i.test(targetMode)
        || options.embeddedContent && /oleObject|package|activeX|attachedTemplate|vbaProject|customUI/i.test(type);
      if (remove) {
        if (id) removed.set(id, { type, targetMode });
        relationship.remove();
      }
    });
    if (!removed.size) continue;
    zip.file(path, serializer.serializeToString(document));
    modified.add(path);
    const ownerPath = ownerPartFromRelationshipsPath(path);
    if (ownerPath && zip.file(ownerPath)) {
      const owner = parseXmlSafe(await zip.file(ownerPath).async('text'), ownerPath);
      if (removeOwnerRelationshipReferences(owner, removed)) {
        zip.file(ownerPath, serializer.serializeToString(owner));
        modified.add(ownerPath);
      }
    }
  }
  return modified;
}

async function cleanContentTypes(zip, options, serializer) {
  const entry = zip.file('[Content_Types].xml');
  if (!entry) return false;
  const document = parseXmlSafe(await entry.async('text'), '[Content_Types].xml');
  let changed = false;
  elementsByLocal(document, 'Override').forEach((override) => {
    const name = override.getAttribute('PartName') || '';
    const contentType = override.getAttribute('ContentType') || '';
    const remove = options.removeComments && /comments|people/i.test(name + contentType)
      || options.customProperties && /custom-properties|docProps\/custom/i.test(name + contentType)
      || options.embeddedContent && /activeX|vba|oleObject|customUI/i.test(name + contentType);
    if (remove) { override.remove(); changed = true; }
  });
  if (changed) zip.file('[Content_Types].xml', serializer.serializeToString(document));
  return changed;
}

function ownerPartFromRelationshipsPath(path) {
  if (path === '_rels/.rels') return '';
  const match = String(path).match(/^(.*)\/_rels\/([^/]+)\.rels$/i);
  return match ? `${match[1]}/${match[2]}` : '';
}

function removeOwnerRelationshipReferences(document, removed) {
  const removable = new Set(['drawing', 'pict', 'object', 'oleObject', 'control', 'altChunk', 'attachedTemplate']);
  let changed = false;
  Array.from(document.getElementsByTagName('*')).reverse().forEach((node) => {
    for (const attribute of Array.from(node.attributes || [])) {
      if (!removed.has(attribute.value) || !['id', 'embed', 'link'].includes(attribute.localName) || !/relationships/i.test(attribute.namespaceURI || '')) continue;
      changed = true;
      if (node.localName === 'hyperlink') { unwrapNode(node); break; }
      let target = node;
      while (target.parentNode && target.parentNode.nodeType === 1 && !removable.has(target.localName)) target = target.parentNode;
      if (removable.has(target.localName)) target.remove();
      else node.removeAttributeNode(attribute);
      break;
    }
  });
  return changed;
}

async function validateCleanWordPackage(blob, modifiedParts) {
  const zip = await safeLoadZip(blob);
  for (const required of ['[Content_Types].xml', '_rels/.rels']) {
    if (!zip.file(required)) throw new Error(`Clean Word validation failed: missing ${required}.`);
  }
  for (const path of modifiedParts) {
    const entry = zip.file(path);
    if (entry && /(?:\.xml|\.rels)$/i.test(path)) parseXmlSafe(await entry.async('text'), path);
  }
  await validatePackageRelationships(zip);
}

async function validatePackageRelationships(zip) {
  let mainDocumentFound = false;
  for (const relsPath of Object.keys(zip.files).filter((path) => /\.rels$/i.test(path))) {
    const relationships = parseXmlSafe(await zip.file(relsPath).async('text'), relsPath);
    const ids = new Set();
    for (const relationship of elementsByLocal(relationships, 'Relationship')) {
      const id = relationship.getAttribute('Id') || '';
      const type = relationship.getAttribute('Type') || '';
      const target = relationship.getAttribute('Target') || '';
      const external = /external/i.test(relationship.getAttribute('TargetMode') || '');
      if (!id || ids.has(id)) throw new Error(`Clean Word validation failed: invalid relationship ID in ${relsPath}.`);
      ids.add(id);
      if (/\/officeDocument$/i.test(type)) mainDocumentFound = true;
      if (!external) {
        const resolved = resolvePackageTarget(ownerPartFromRelationshipsPath(relsPath), target);
        if (!resolved || !zip.file(resolved)) throw new Error(`Clean Word validation failed: ${relsPath} points to a missing package part.`);
      }
    }
    const ownerPath = ownerPartFromRelationshipsPath(relsPath);
    if (ownerPath && zip.file(ownerPath) && /\.xml$/i.test(ownerPath)) {
      const owner = parseXmlSafe(await zip.file(ownerPath).async('text'), ownerPath);
      Array.from(owner.getElementsByTagName('*')).forEach((node) => Array.from(node.attributes || []).forEach((attribute) => {
        if (['id', 'embed', 'link'].includes(attribute.localName) && /relationships/i.test(attribute.namespaceURI || '') && !ids.has(attribute.value)) throw new Error(`Clean Word validation failed: ${ownerPath} contains an unresolved relationship reference.`);
      }));
    }
  }
  if (!mainDocumentFound) throw new Error('Clean Word validation failed: the main document relationship is missing.');
}

function resolvePackageTarget(ownerPath, target) {
  let raw = String(target || '').split('#')[0].split('?')[0];
  try { raw = decodeURIComponent(raw); } catch (_) { /* keep the literal package URI */ }
  if (!raw) return '';
  const base = raw.startsWith('/') ? [] : String(ownerPath || '').split('/').slice(0, -1);
  for (const part of raw.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!base.length) return ''; base.pop(); }
    else base.push(part);
  }
  return base.join('/');
}

async function clearLocalWorkspace() {
  const comparisonWork = Boolean(window.CommentMasterWord && typeof window.CommentMasterWord.hasComparisonState === 'function' && window.CommentMasterWord.hasComparisonState());
  const wordWork = Boolean(window.CommentMasterWord && window.CommentMasterWord.hasDocument());
  const hasWork = app.homeFiles.length || pdfState.file || toolState.binder.length || toolState.convert.length || toolState.batch.length || app.cleanWordFile || comparisonWork || wordWork;
  if (hasWork && !window.confirm('Clear selected files, PDF working changes, queues, and completed in-memory results from this browser tab? Saved downloads are not affected.')) return;
  stageHomeFiles([]);
  toolState.binder = []; toolState.convert = []; toolState.batch = []; toolState.batchResults = []; toolState.inspectorFiles = [];
  app.cleanWordFile = null; app.result = null;
  if (wordWork && typeof window.CommentMasterWord.clearLocalDocument === 'function') window.CommentMasterWord.clearLocalDocument();
  if (window.CommentMasterWord && typeof window.CommentMasterWord.clearComparisonState === 'function') window.CommentMasterWord.clearComparisonState();
  renderToolQueue('binder'); renderToolQueue('convert'); renderToolQueue('batch');
  $('inspector-results').innerHTML = '';
  $('clean-word-source').textContent = 'Use the loaded Word document or choose another DOCX.';
  await closePdfDocument(true);
  if (pdfState.ocrWorker) { try { await pdfState.ocrWorker.worker.terminate(); } catch (_) {} pdfState.ocrWorker = null; }
  app.urls.forEach((url) => URL.revokeObjectURL(url)); app.urls.clear();
  showStatus('Local workspace cleared. No document archive was retained.');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
