import { inspectDocxReviewAuthors, renameDocxReviewAuthors } from './reviewer-names.mjs';

const state = {
  busy: false,
  lastScan: null
};

const ui = {};

function bindUi() {
  ui.status = document.getElementById('status');
  ui.target = document.getElementById('target-author');
  ui.replacement = document.getElementById('replacement-author');
  ui.apply = document.getElementById('apply');
  ui.refresh = document.getElementById('refresh');
  ui.summary = document.getElementById('summary');
  ui.details = document.getElementById('details');

  const remembered = localStorage.getItem('commentMaster.wordAddin.replacementAuthor') || '';
  ui.replacement.value = remembered;
  ui.replacement.addEventListener('input', updateButtons);
  ui.target.addEventListener('change', updateButtons);
  ui.apply.addEventListener('click', runRename);
  ui.refresh.addEventListener('click', refreshAuthors);
}

function setBusy(busy, message) {
  state.busy = busy;
  document.body.classList.toggle('busy', busy);
  if (message) setStatus(message, 'working');
  updateButtons();
}

function setStatus(message, kind = 'neutral') {
  ui.status.textContent = message;
  ui.status.dataset.kind = kind;
}

function updateButtons() {
  if (!ui.apply) return;
  const hasTarget = ui.target.options.length > 0 && ui.target.value !== '__none__';
  const hasReplacement = Boolean(ui.replacement.value.trim());
  ui.apply.disabled = state.busy || !hasTarget || !hasReplacement;
  ui.refresh.disabled = state.busy;
  ui.target.disabled = state.busy || ui.target.options.length === 0;
  ui.replacement.disabled = state.busy;
}

function closeOfficeFile(file) {
  return new Promise((resolve) => {
    try { file.closeAsync(() => resolve()); }
    catch { resolve(); }
  });
}

function getSlice(file, index) {
  return new Promise((resolve, reject) => {
    file.getSliceAsync(index, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve(result.value);
      else reject(new Error(result.error?.message || `Could not read document slice ${index + 1}.`));
    });
  });
}

function openOfficeFile() {
  if (!Office.context.requirements.isSetSupported('CompressedFile', '1.1')) {
    return Promise.reject(new Error('This version of Word cannot provide the compressed DOCX needed for reviewer-name changes.'));
  }
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(
      Office.FileType.Compressed,
      { sliceSize: 4 * 1024 * 1024 },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) resolve(result.value);
        else reject(new Error(result.error?.message || 'Word could not provide a DOCX copy of the current document.'));
      }
    );
  });
}

async function getCurrentDocumentBytes() {
  const file = await openOfficeFile();
  try {
    const chunks = [];
    let total = 0;
    for (let index = 0; index < file.sliceCount; index += 1) {
      const slice = await getSlice(file, index);
      const chunk = slice.data instanceof Uint8Array ? slice.data : new Uint8Array(slice.data);
      chunks.push(chunk);
      total += chunk.length;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    await closeOfficeFile(file);
  }
}

function authorLabel(row) {
  const name = row.author || '(no author name)';
  const pieces = [];
  if (row.changes) pieces.push(`${row.changes} change${row.changes === 1 ? '' : 's'}`);
  if (row.comments) pieces.push(`${row.comments} comment${row.comments === 1 ? '' : 's'}`);
  return `${name} · ${pieces.join(', ')}`;
}

function renderScan(scan, preferredValue) {
  state.lastScan = scan;
  ui.target.replaceChildren();

  if (!scan.total) {
    const option = new Option('No review authors found', '__none__');
    ui.target.add(option);
    ui.summary.textContent = 'No comments or tracked changes with reviewer attribution were found.';
    ui.details.textContent = '';
    setStatus('Nothing to rename in this document.', 'neutral');
    updateButtons();
    return;
  }

  const all = new Option(`All reviewer names · ${scan.total} item${scan.total === 1 ? '' : 's'}`, '__all__');
  ui.target.add(all);
  for (const row of scan.authors) ui.target.add(new Option(authorLabel(row), row.author));

  const options = Array.from(ui.target.options);
  if (preferredValue != null && options.some((option) => option.value === preferredValue)) ui.target.value = preferredValue;
  else if (scan.authors.length === 1) ui.target.value = scan.authors[0].author;
  else ui.target.value = scan.authors[0]?.author ?? '__all__';

  const changes = scan.authors.reduce((sum, row) => sum + row.changes, 0);
  const comments = scan.authors.reduce((sum, row) => sum + row.comments, 0);
  ui.summary.textContent = `${scan.authors.length} reviewer name${scan.authors.length === 1 ? '' : 's'} found across ${scan.total} review item${scan.total === 1 ? '' : 's'}.`;
  ui.details.textContent = `${changes} tracked change${changes === 1 ? '' : 's'} · ${comments} comment${comments === 1 ? '' : 's'}`;
  setStatus('Ready.', 'success');
  updateButtons();
}

async function refreshAuthors() {
  if (state.busy) return;
  const preferred = ui.target.value;
  setBusy(true, 'Reading the current document…');
  try {
    const bytes = await getCurrentDocumentBytes();
    const scan = await inspectDocxReviewAuthors(bytes);
    renderScan(scan, preferred);
  } catch (error) {
    state.lastScan = null;
    ui.target.replaceChildren(new Option('Unavailable', '__none__'));
    ui.summary.textContent = '';
    ui.details.textContent = '';
    setStatus(formatError(error), 'error');
  } finally {
    setBusy(false);
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function openRevisedDocument(bytes) {
  if (!Office.context.requirements.isSetSupported('WordApi', '1.3')) {
    throw new Error('This version of Word does not support opening a revised DOCX from the add-in. WordApi 1.3 or later is required.');
  }
  const base64 = bytesToBase64(bytes);
  await Word.run(async (context) => {
    const created = context.application.createDocument(base64);
    await context.sync();
    created.open();
    await context.sync();
  });
}

async function runRename() {
  if (state.busy) return;
  const fromAuthor = ui.target.value;
  const toAuthor = ui.replacement.value.trim();
  if (!toAuthor || fromAuthor === '__none__') return;

  setBusy(true, 'Creating a revised copy…');
  try {
    localStorage.setItem('commentMaster.wordAddin.replacementAuthor', toAuthor);
    const bytes = await getCurrentDocumentBytes();
    const result = await renameDocxReviewAuthors(bytes, fromAuthor, toAuthor);
    setStatus(`Changed ${result.changed} review item${result.changed === 1 ? '' : 's'}. Opening the revised copy…`, 'working');
    await openRevisedDocument(result.bytes);
    renderScan(result.verification, toAuthor);
    setStatus(`Done. Opened a revised copy with ${result.changed} reviewer attribution${result.changed === 1 ? '' : 's'} changed.`, 'success');
  } catch (error) {
    setStatus(formatError(error), 'error');
  } finally {
    setBusy(false);
  }
}

function formatError(error) {
  return error?.message || String(error || 'Unknown error');
}

async function start() {
  bindUi();
  setStatus('Connecting to Word…', 'working');
  try {
    await Office.onReady();
    if (Office.context.host !== Office.HostType.Word) throw new Error('This add-in only works in Microsoft Word.');
    await refreshAuthors();
  } catch (error) {
    setStatus(formatError(error), 'error');
    updateButtons();
  }
}

start();
