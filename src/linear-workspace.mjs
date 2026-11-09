import { SUMMARY_COLUMNS, buildReviewSummary, summaryRows } from './review-summary.mjs?v=7.3.1';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const SECTIONS = [
  ['file', 'Load document', 'Choose a Word file to work on.'],
  ['names', 'Change names', 'Replace reviewer names in comments and tracked changes.'],
  ['review', 'Edit comments and redlines', 'Edit individual comments, tracked text, names, and dates.'],
  ['times', 'Update dates and times', 'Set, remove, shift, or sequence review timestamps.'],
  ['metadata', 'Remove metadata', 'Remove document properties without removing review activity.'],
  ['find', 'Find and replace', 'Optional replacements within Word text.'],
  ['redlines', 'Create redlines', 'Turn a paragraph replacement into a tracked change.'],
  ['inspect', 'Inspect document', 'Check links, document structure, and package details.'],
  ['compare', 'Compare and combine', 'Compare versions or combine reviewers’ copies.']
];
const EMBEDDED = { review: ['view-table', 'all'], metadata: ['view-meta', 'meta'], find: ['view-regex', 'regex'], redlines: ['view-ghost', 'ghost'], links: ['view-relationships', 'relationships'], structure: ['view-forensics', 'forensics'], parts: ['view-parts', 'parts'] };
const scope = (id) => `<label>Apply to<select id="${id}"><option value="all">Comments and redlines</option><option value="comments">Comments only</option><option value="changes">Redlines only</option><option value="selected">Selected review items</option></select></label>`;
const feedback = (key) => `<p id="linear-${key}-feedback" class="linear-feedback" role="status" aria-live="polite" hidden></p>`;
const mount = (key) => `<div id="linear-mount-${key}" class="linear-mount"></div>`;
function section(key, content) {
  const index = SECTIONS.findIndex((s) => s[0] === key), [, title, description] = SECTIONS[index];
  return `<details id="linear-section-${key}" class="linear-section" data-linear-section="${key}"${key === 'file' ? ' open' : ''}>
    <summary><span class="linear-step">${String(index + 1).padStart(2, '0')}</span><span class="linear-section-copy"><strong>${title}</strong><span>${description}</span></span><span class="linear-status" data-status-for="${key}">${key === 'file' ? 'Not loaded' : 'Not used'}</span></summary>
    <div class="linear-section-body">${key === 'file' ? content : `<p class="linear-load-first" data-load-first>Load a document above to use this section.</p><fieldset class="linear-fields" data-needs-document disabled>${content}</fieldset>`}</div></details>`;
}
function template() {
  const sidebar = SECTIONS.map(([key, title], i) => `<button type="button" data-linear-jump="${key}"><span class="linear-nav-index">${i + 1}</span><span>${title}<small data-nav-status="${key}">${key === 'file' ? 'Not loaded' : 'Not used'}</small></span></button>`).join('');
  return `<div class="linear-layout">
    <aside class="linear-sidebar" aria-label="Document tools">
      <button id="linear-sidebar-toggle" class="linear-sidebar-toggle" type="button" aria-expanded="false" aria-controls="linear-sidebar-content">Sections and tools <span aria-hidden="true">⌄</span></button>
      <div id="linear-sidebar-content"><p class="linear-nav-label">YOUR DOCUMENT</p><nav aria-label="Document workflow">${sidebar}<button type="button" data-linear-jump="download"><span class="linear-nav-index">↓</span><span>Download<small data-nav-status="download">Not downloaded</small></span></button></nav>
      <details class="linear-other-tools"><summary>PDF tools</summary><div>${[['review','View and search'],['pages','Organize pages'],['ocr','Make scans searchable'],['redact','Redact content'],['clean','Clean and inspect'],['forms','Fill PDF forms'],['export','Export PDF']].map(([key,label])=>`<button type="button" data-linear-pdf="${key}">${label}<small data-extra-status="pdf-${key}">Not opened</small></button>`).join('')}</div></details>
      <details class="linear-other-tools"><summary>Other document tools</summary><div>${[['clean-word','Create a clean Word copy'],['binder','Build a PDF binder'],['convert','Convert files'],['batch','Batch processing'],['inspect','Inspect files']].map(([key,label])=>`<button type="button" data-linear-tool="${key}">${label}<small data-extra-status="${key}">Not opened</small></button>`).join('')}<button id="linear-extra-exports" type="button" data-linear-action="expert-exports">Spreadsheet and clipboard exports<small data-extra-status="expert-exports">Not opened</small></button><button type="button" data-wb-action="open-files">Open multiple files</button></div></details>
      <div class="linear-sidebar-footer"><button type="button" data-wb-action="privacy">Privacy and offline use</button><button type="button" data-linear-action="clear">Clear local workspace</button></div></div>
    </aside>
    <div class="linear-content">
      <header class="linear-heading"><div><p class="linear-eyebrow">DOCUMENT WORKSPACE</p><h2>Work on your document.</h2><p>Open a Word file, use the sections you need, and download your results.</p></div><span class="linear-local"><span aria-hidden="true"></span>Processed on this device</span></header>
      <div id="linear-document-bar" class="linear-document-bar" hidden><div><strong id="linear-filename"></strong><span id="linear-document-counts"></span></div><div class="linear-document-controls"><span id="linear-save-status" role="status" aria-live="polite"></span><button type="button" id="linear-undo" class="btn btn-light" data-linear-action="undo" disabled>Undo last edit</button></div></div>
      ${section('file', `<div id="linear-file-drop" class="linear-file-drop"><div class="linear-file-symbol" aria-hidden="true">W</div><div><h3>Choose a Word document</h3><p>Use a .docx file or drop it here. Your original file will not be overwritten.</p></div><button id="linear-upload" class="btn btn-primary" type="button" data-wb-action="choose-home-word">Choose Word document</button></div><p id="linear-file-ready" hidden></p>${feedback('file')}<div id="linear-multiple-files" hidden><p>Multiple files selected. Choose a tool below.</p><div id="linear-file-chips"></div><div id="linear-file-suggestions"></div></div>`)}
      ${section('names', `<div class="linear-form-grid"><label>Current name<select id="linear-name-from"></select></label><label>New name<input id="linear-name-to" maxlength="255" autocomplete="off" placeholder="Enter the replacement name"></label>${scope('linear-name-scope')}</div><p id="linear-name-count" class="linear-help"></p><button class="btn btn-primary" type="button" data-linear-action="names">Apply name change</button>${feedback('names')}`)}
      ${section('review', `<p class="linear-help">Click a name, date, comment, or redlined text to edit it. Changes apply when you leave that field. Formatting-only revisions are read-only.</p><div class="linear-review-filters"><label>Find a review item<input id="linear-review-search" type="search" placeholder="Search text or reviewer names"></label><label>Show<select id="linear-review-type"><option value="all">Comments and redlines</option><option value="comments">Comments only</option><option value="redlines">Redlines only</option></select></label></div>${mount('review')}${feedback('review')}`)}
      ${section('times', `<div class="linear-form-grid">${scope('linear-time-scope')}<label>Reviewer<select id="linear-time-author"></select></label><label>What to do<select id="linear-time-mode"><option value="set">Set a date and time</option><option value="clear">Remove dates and times</option><option value="shift">Shift existing times</option><option value="sequence">Set times in document order</option><option value="random">Randomize within a range</option></select></label><label id="linear-time-date-wrap">Date and time<input id="linear-time-date" type="datetime-local" step="1"></label><label id="linear-time-minutes-wrap" hidden>Minutes (negative moves earlier)<input id="linear-time-minutes" type="number" value="5" step="0.1"></label><label id="linear-time-end-wrap" hidden>End of range<input id="linear-time-end" type="datetime-local" step="1"></label></div><label class="linear-check" id="linear-time-ordered-wrap" hidden><input id="linear-time-ordered" type="checkbox" checked>Keep generated times in document order</label><p class="linear-help">Dates entered here use your device’s time zone. Comments and redlines remain in the document.</p><button class="btn btn-primary" type="button" data-linear-action="times">Apply date changes</button>${feedback('times')}`)}
      ${section('metadata', `<p>Remove the document creator, last editor, created/modified dates, revision number, and total editing time.</p><p class="linear-help">Reviewer names, comment dates, tracked changes, and document text are kept. Custom properties and embedded content can be reviewed under Create a clean Word copy.</p><button class="btn btn-primary" type="button" data-linear-action="metadata">Remove common metadata</button>${feedback('metadata')}<details class="linear-subsection" data-linear-mount="metadata"><summary>View or edit individual properties</summary>${mount('metadata')}</details>`)}
      ${section('find', mount('find'))}
      ${section('redlines', mount('redlines'))}
      ${section('inspect', `<p class="linear-help">Inspection does not change your document or visit its links.</p>${[['links','Website links'],['structure','Document checks'],['parts','Word package parts (advanced)']].map(([key,label])=>`<details class="linear-subsection" data-linear-mount="${key}"><summary>${label}</summary>${mount(key)}</details>`).join('')}`)}
      ${section('compare', `<p>Use this working document, including your edits, when comparing or combining copies.</p><div class="linear-button-row"><button class="btn" type="button" data-linear-action="compare">Compare Word documents</button><button class="btn btn-light" type="button" data-linear-action="compare-text">Compare pasted text</button><button class="btn btn-light" type="button" data-linear-action="combine">Combine reviewers’ copies</button></div><p class="linear-help">These create a separate result. They do not replace or reset your working document.</p>`)}
      <section id="linear-section-download" class="linear-download" aria-labelledby="linear-download-title"><div><p class="linear-eyebrow">WHEN YOU ARE READY</p><h3 id="linear-download-title">Download your results</h3><p>Both downloads use the document as it is now. You can keep editing afterward.</p></div><div class="linear-download-grid"><button id="linear-download-document" type="button" data-linear-action="document" disabled><span class="linear-download-number">1</span><span><strong>Download updated document</strong><small>Your Word file with all applied edits</small><small class="linear-download-state" data-export-status="document">Not downloaded</small></span><span aria-hidden="true">↓</span></button><button id="linear-download-summary" type="button" data-linear-action="summary" disabled><span class="linear-download-number">2</span><span><strong>Download comment/redline summary</strong><small>Choose review types, columns, and document appendix</small><small class="linear-download-state" data-export-status="summary">Not downloaded</small></span><span aria-hidden="true">↓</span></button></div>${feedback('download')}<p class="linear-help">Keep this tab open while working. Edits are held here, not saved to your computer until you download.</p></section>
    </div>
  </div>`;
}
function dialogTemplate() {
  return `<dialog id="linear-summary-dialog" class="linear-summary-dialog" aria-labelledby="linear-summary-title"><div class="linear-dialog-heading"><div><h2 id="linear-summary-title">Customize your summary</h2><p>A Word report of the current document’s review activity.</p></div><button type="button" class="linear-dialog-close" data-summary-close aria-label="Close summary options">×</button></div><form id="linear-summary-form"><div class="linear-summary-options"><fieldset><legend>Include review activity</legend><div class="linear-check-grid"><label class="linear-check"><input id="summary-comments" name="comments" type="checkbox" checked>Comments <span id="summary-comments-count"></span></label><label class="linear-check"><input id="summary-redlines" name="redlines" type="checkbox" checked>Redlines <span id="summary-redlines-count"></span></label></div></fieldset><fieldset><legend>Columns to include</legend><div class="linear-check-grid">${SUMMARY_COLUMNS.map((c)=>`<label class="linear-check"><input type="checkbox" name="column" value="${c.key}" checked>${c.label}</label>`).join('')}</div><p class="linear-help">Original text means the commented-on language or the paragraph before tracked additions/deletions. Page references use Word’s saved page markers.</p></fieldset><fieldset><legend>Document appendix</legend><label class="linear-check"><input id="summary-original" name="includeOriginal" type="checkbox">Include original document after the summary</label><p class="linear-help">Appends the current working document, including edits applied here. The summary comes first, followed by the preserved document content and its existing package parts. Adding pages changes overall pagination.</p></fieldset><p id="summary-validation" class="linear-validation" role="alert" hidden></p></div><div class="linear-dialog-footer"><span id="summary-selection-count" role="status" aria-live="polite"></span><button type="button" class="btn btn-light" data-summary-close>Cancel</button><button id="summary-download" class="btn btn-primary" type="submit">Download summary</button></div></form></dialog>`;
}

export function initLinearWorkspace(api) {
  const home = $('home'); if (!home || $('linear-section-file')) return;
  window.CMReviewSummary = Object.freeze({ build: buildReviewSummary });
  const legacy = document.createElement('div'); legacy.id = 'linear-legacy-home'; legacy.hidden = true; legacy.inert = true;
  while (home.firstChild) legacy.append(home.firstChild);
  home.append(legacy); home.classList.add('linear-home'); home.insertAdjacentHTML('beforeend', template());
  document.body.insertAdjacentHTML('beforeend', dialogTemplate());
  const back = document.createElement('button'); back.className='btn btn-light linear-back-button'; back.type='button'; back.dataset.routeTarget='home'; back.textContent='Back to document';
  document.querySelector('.header-actions')?.prepend(back);
  // Keep the file queue controls working for multi-file and non-Word operations.
  $('linear-file-chips').append($('selected-files')); $('linear-file-suggestions').append($('suggestion-actions'));
  const panelHomes = new Map(Object.entries(EMBEDDED).map(([key,[id]])=>{const node=$(id);const marker=document.createComment(`Home of ${id}`);node.before(marker);return [key,{node,marker}];}));
  let token = null, lastVersion = null, localBusy = false, scheduled = false;
  let auxiliary = {}, extra = {}, summaryError = '';
  const info = () => window.CommentMasterWord?.workflowInfo?.();
  const word = () => window.CommentMasterWord;
  const status = (key,message,error=false) => {const node=$(`linear-${key}-feedback`);if(node){node.hidden=!message;node.textContent=message||'';node.classList.toggle('error',error);}};
  const currentRoute = () => window.CommentMasterWorkbench?.currentRoute?.() || 'home';
  function markExtra(key,value='Opened'){extra[key]=value;refresh();}
  function choose(key, scroll=true) {
    if (currentRoute() !== 'home') api.switchRoute('home',false);
    const target=$(`linear-section-${key}`); if(!target)return;
    if(target.tagName==='DETAILS')target.open=true;
    document.querySelectorAll('[data-linear-jump]').forEach((b)=>b.setAttribute('aria-current',b.dataset.linearJump===key?'step':'false'));
    $('linear-sidebar-toggle').setAttribute('aria-expanded','false');
    home.classList.remove('linear-nav-open');
    if(scroll)target.scrollIntoView({behavior:'auto',block:'start'});
    const heading=target.querySelector('summary,h3');heading?.focus({preventScroll:true});
  }
  function embed(key) {
    const entry=panelHomes.get(key), destination=$(`linear-mount-${key}`);if(!entry||!destination||!info())return;
    const [,tab]=EMBEDDED[key];
    word().selectTab(tab);
    destination.append(entry.node); entry.node.classList.remove('view-section');entry.node.classList.add('linear-embedded');entry.node.removeAttribute('role');entry.node.hidden=false;
    // A second open panel must not disappear when the legacy engine switches its tab.
    for(const {node} of panelHomes.values()) if(node.closest('.linear-mount'))node.hidden=false;
    if(['links','structure','parts'].includes(key)){auxiliary.inspect='Viewed';refresh();}
  }
  function restorePanels() {
    for(const {node,marker} of panelHomes.values()) {marker.after(node);node.classList.add('view-section');node.classList.remove('linear-embedded');}
  }
  function mountOpenPanels() {
    if(!info())return;
    for(const key of ['review','find','redlines'])if($(`linear-section-${key}`).open)embed(key);
    document.querySelectorAll('[data-linear-mount]').forEach((d)=>{if(d.open)embed(d.dataset.linearMount);});
  }
  function resetForDocument(next) {
    token=next?.token??null; lastVersion=null; auxiliary={}; extra={};
    $('linear-name-to').value='';$('linear-name-from').replaceChildren();$('linear-time-author').replaceChildren();$('linear-name-from').dataset.options='';$('linear-time-author').dataset.options='';summaryError='';
    $('linear-name-scope').value='all';$('linear-time-scope').value='all';$('linear-time-mode').value='set';
    $('linear-time-date').value='';$('linear-time-end').value='';$('linear-time-minutes').value='5';
    $('linear-review-search').value='';$('linear-review-type').value='all';$('linear-summary-form').reset();
    document.querySelectorAll('.linear-feedback').forEach((p)=>{p.textContent='';p.hidden=true;});
    document.querySelectorAll('[data-linear-section]').forEach((d)=>{d.open=d.dataset.linearSection===(next?'names':'file');});
    document.querySelectorAll('[data-linear-mount]').forEach((d)=>{d.open=false;});
    if($('linear-summary-dialog').open)$('linear-summary-dialog').close();
    updateTimeFields();
  }
  function fillAuthors(select, authors, names=false) {
    const previous=select.value;
    const entries=(names?[['__pick__','Choose a reviewer']]:[]).concat([['__all__',names?'All reviewer names':'All reviewers']],authors.map((a)=>[a.key,`${a.name} (${a.count})`]));
    const signature=JSON.stringify(entries);
    if(select.dataset.options===signature)return;
    select.dataset.options=signature;
    select.replaceChildren(...entries.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));
    select.value=entries.some(([v])=>v===previous)?previous:names&&authors.length===1?authors[0].key:names?'__pick__':'__all__';
  }
  function refresh() {
    const data=info();
    if((data?.token??null)!==token)resetForDocument(data);
    const active=Boolean(data),busy=localBusy||data?.busy;
    $('linear-document-bar').hidden=!active;
    if(active){
      $('linear-filename').textContent=data.fileName;
      $('linear-document-counts').textContent=`${data.comments} comment${data.comments===1?'':'s'} · ${data.redlines} redline${data.redlines===1?'':'s'} · ${data.authors.length} reviewer${data.authors.length===1?'':'s'}`;
      $('linear-save-status').textContent=data.dirty?'Edits not yet downloaded':'Working copy ready';
      $('linear-save-status').classList.toggle('unsaved',data.dirty);
      $('linear-file-ready').textContent=`Loaded: ${data.fileName}. You can replace it here at any time.`;
      fillAuthors($('linear-name-from'),data.authors,true);fillAuthors($('linear-time-author'),data.authors);
    } else {$('linear-filename').textContent='';$('linear-document-counts').textContent='';$('linear-file-ready').textContent='';}
    $('linear-file-ready').hidden=!active;
    document.querySelectorAll('[data-load-first]').forEach((n)=>{n.hidden=active;});
    document.querySelectorAll('[data-needs-document]').forEach((n)=>{n.disabled=!active||busy;});
    $('linear-undo').disabled=!active||busy||!data.canUndo;
    $('linear-download-document').disabled=$('linear-download-summary').disabled=!active||busy;
    $('linear-upload').disabled=Boolean(busy);$('linear-extra-exports').disabled=!active||busy;
    for(const [key]of SECTIONS){
      const used=data?.activity[key];const text=key==='file'?active?'Loaded':'Not loaded':used?'Applied':auxiliary[key]||'Not used';
      document.querySelectorAll(`[data-status-for="${key}"],[data-nav-status="${key}"]`).forEach((n)=>{n.textContent=text;n.dataset.done=String(Boolean(used)||(key==='file'&&active)||auxiliary[key]==='Created');});
    }
    for(const type of ['document','summary']){
      const version=data?.downloads[type];const text=version===undefined?'Not downloaded':version===data?.version?'Downloaded':'Changed since download';
      document.querySelector(`[data-export-status="${type}"]`).textContent=text;
    }
    const downloads=data?.downloads||{};
    const exportState=Object.keys(downloads).length?Object.values(downloads).some((v)=>v!==data.version)?'Changed since download':'Downloaded':'Not downloaded';
    document.querySelector('[data-nav-status="download"]').textContent=exportState;
    document.querySelectorAll('[data-extra-status]').forEach((n)=>{n.textContent=extra[n.dataset.extraStatus]||'Not opened';});
    const selected=api.selectedFiles();$('linear-multiple-files').hidden=!(selected.length>1||(selected.length===1&&!/\.docx$/i.test(selected[0].name)));
    nameCount();
    if($('linear-summary-dialog').open)validateSummary();
    lastVersion=data?.version;
  }
  function queueRefresh(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;refresh();});}
  function nameCount(){const data=info();const key=$('linear-name-from').value;const entry=data?.authors.find((a)=>a.key===key);$('linear-name-count').textContent=key==='__all__'&&data?`All ${data.authors.length} reviewer names will be replaced.`:entry?`${entry.count} review item${entry.count===1?'':'s'} use this name. The selected activity scope is applied below.`:'Select the existing name you want to replace.';}
  function updateTimeFields(){const mode=$('linear-time-mode').value;$('linear-time-date-wrap').hidden=['clear','shift'].includes(mode);$('linear-time-minutes-wrap').hidden=!['shift','sequence'].includes(mode);$('linear-time-end-wrap').hidden=$('linear-time-ordered-wrap').hidden=mode!=='random';}
  function summaryOptions(){return{comments:$('summary-comments').checked,redlines:$('summary-redlines').checked,columns:[...document.querySelectorAll('#linear-summary-form input[name="column"]:checked')].map((n)=>n.value),includeOriginal:$('summary-original').checked};}
  function validateSummary(){const data=info(),o=summaryOptions();const count=(o.comments?data?.comments||0:0)+(o.redlines?data?.redlines||0:0);const message=!o.comments&&!o.redlines?'Include comments, redlines, or both.':!o.columns.length?'Select at least one column.':!count?'No matching review items in this document.':'';$('summary-validation').textContent=message||summaryError;$('summary-validation').hidden=!(message||summaryError);$('summary-download').disabled=Boolean(message)||localBusy||data?.busy;$('summary-selection-count').textContent=`${count} review items · ${o.columns.length} columns`;$('summary-comments-count').textContent=`(${data?.comments||0})`;$('summary-redlines-count').textContent=`(${data?.redlines||0})`;return!message;}
  async function execute(action){
    if(localBusy)return;
    const target=['names','times','metadata'].includes(action)?action:'download';
    status(target,'');localBusy=true;refresh();
    try{
      if(action==='names'){
        const from=$('linear-name-from').value;if(from==='__pick__')throw new Error('Choose an existing reviewer name.');
        const n=word().workflowRename({from,name:$('linear-name-to').value,scope:$('linear-name-scope').value});
        status('names',n?`Updated ${n} review item${n===1?'':'s'}. You can keep editing in any section.`:'Those names already match. Nothing changed.');
        if(n){$('linear-name-to').value='';$('linear-name-from').dataset.options='';}
      }else if(action==='times'){
        const n=word().workflowDates({scope:$('linear-time-scope').value,author:$('linear-time-author').value,mode:$('linear-time-mode').value,date:$('linear-time-date').value,end:$('linear-time-end').value,minutes:$('linear-time-minutes').value,ordered:$('linear-time-ordered').checked});
        status('times',n?`Updated ${n} review timestamp${n===1?'':'s'}.`:'No timestamps needed a change.');
      }else if(action==='metadata'){
        const changed=word().workflowRemoveMetadata();status('metadata',changed?'Common document metadata removed. Comments, redlines, and review names are kept.':'No metadata changes were applied.');
      }else if(action==='undo'){word().workflowUndo();status('download','Last edit undone. Section status now reflects the current document.');}
      else if(action==='document'){await word().saveCurrent();status('download','Updated Word document downloaded. You can continue editing.');}
      else if(action==='summary'){summaryError='';word().workflowCommit();validateSummary();$('linear-summary-dialog').showModal();$('summary-comments').focus();}
      else if(action==='clear'){await api.clearWorkspace();}
      else if(action==='expert-exports'){word().workflowCommit();markExtra('expert-exports');api.switchRoute('word');word().selectTab('export');}
      else if(action==='compare'){word().workflowCommit();word().openCompareUsingCurrent();auxiliary.compare='Opened';}
      else if(action==='compare-text'){word().openCompare('text');auxiliary.compare='Opened';}
      else if(action==='combine'){word().openCompare('combine');$('combine-base-source').value='current';$('combine-base-source').dispatchEvent(new Event('change',{bubbles:true}));auxiliary.compare='Opened';}
    }catch(error){status(target,error.message||String(error),true);if(action==='summary')$('linear-summary-dialog').close();}
    finally{localBusy=false;refresh();}
  }
  home.addEventListener('click',(event)=>{
    const jump=event.target.closest('[data-linear-jump]');if(jump){choose(jump.dataset.linearJump);return;}
    const action=event.target.closest('[data-linear-action]');if(action){void execute(action.dataset.linearAction);return;}
    const pdf=event.target.closest('[data-linear-pdf]');if(pdf){markExtra(`pdf-${pdf.dataset.linearPdf}`);api.switchRoute('pdf');api.switchPdfTab(pdf.dataset.linearPdf);return;}
    const tool=event.target.closest('[data-linear-tool]');if(tool){markExtra(tool.dataset.linearTool);void api.chooseTask(tool.dataset.linearTool).catch((error)=>status('file',error.message,true));}
  });
  home.addEventListener('toggle',(event)=>{
    if(event.target.matches('[data-linear-section]')&&event.target.open){const key=event.target.dataset.linearSection;if(['review','find','redlines'].includes(key))embed(key);document.querySelectorAll('[data-linear-jump]').forEach((b)=>b.setAttribute('aria-current',b.dataset.linearJump===key?'step':'false'));}
    if(event.target.matches('[data-linear-mount]')&&event.target.open)embed(event.target.dataset.linearMount);
  },true);
  $('linear-sidebar-toggle').addEventListener('click',()=>{const open=home.classList.toggle('linear-nav-open');$('linear-sidebar-toggle').setAttribute('aria-expanded',String(open));});
  $('linear-name-from').addEventListener('change',nameCount);
  $('linear-time-mode').addEventListener('change',updateTimeFields);
  $('linear-review-search').addEventListener('input',()=>{$('filter-search').value=$('linear-review-search').value;$('filter-search').dispatchEvent(new Event('input',{bubbles:true}));});
  $('linear-review-type').addEventListener('change',()=>{const mode=$('linear-review-type').value;for(const option of $('filter-types').options)option.selected=mode==='all'?false:mode==='comments'?option.value==='com':option.value!=='com';$('filter-types').dispatchEvent(new Event('change',{bubbles:true}));});
  $('linear-summary-form').addEventListener('change',()=>{summaryError='';validateSummary();});
  document.querySelectorAll('[data-summary-close]').forEach((b)=>b.addEventListener('click',()=>{if(!localBusy)$('linear-summary-dialog').close();}));
  $('linear-summary-dialog').addEventListener('cancel',(event)=>{if(localBusy)event.preventDefault();});
  $('linear-summary-form').addEventListener('submit',async(event)=>{
    event.preventDefault();if(localBusy||!validateSummary())return;
    localBusy=true;summaryError='';refresh();
    try{const result=await word().workflowExportSummary(summaryOptions());$('linear-summary-dialog').close();status('download',`Downloaded a summary of ${result.count} review items${result.includesDocument?', followed by your working document':''}. Your working copy is unchanged.`);}
    catch(error){summaryError=error.message||String(error);$('summary-validation').textContent=summaryError;$('summary-validation').hidden=false;}
    finally{localBusy=false;refresh();}
  });
  const zone=$('linear-file-drop');
  ['dragenter','dragover'].forEach((type)=>zone.addEventListener(type,(e)=>{e.preventDefault();zone.classList.add('dragover');}));
  ['dragleave','drop'].forEach((type)=>zone.addEventListener(type,(e)=>{e.preventDefault();zone.classList.remove('dragover');}));
  zone.addEventListener('drop',async(e)=>{try{const files=[...e.dataTransfer.files];if(files.length!==1||!/\.docx$/i.test(files[0].name))throw new Error('Drop one Word .docx file here. Other file types are available in the sidebar.');await api.stageFiles(files,{stayOnHome:true});}catch(error){status('file',error.message,true);}});
  window.addEventListener('commentmaster:word-state',queueRefresh);
  window.addEventListener('commentmaster:word-opened',queueRefresh);
  window.addEventListener('commentmaster:word-closed',()=>{restorePanels();queueRefresh();});
  window.addEventListener('commentmaster:home-staged',()=>{queueRefresh();});
  window.addEventListener('commentmaster:route',(event)=>{
    if(event.detail.route!=='home'){restorePanels();if(event.detail.route==='word')word().selectTab('overview');}
    else{queueRefresh();queueMicrotask(mountOpenPanels);}
  });
  window.addEventListener('commentmaster:tool-result',(event)=>{const {type,sourceToken}=event.detail;if(!sourceToken||sourceToken!==info()?.token)return;if(['comparison','combined-commentary'].includes(type))auxiliary.compare='Created';else if(type==='clean-word')extra['clean-word']='Created';refresh();});
  // Existing error handling remains authoritative. Surface its message near the file picker.
  new MutationObserver(()=>{if(!$('error-log').hidden&&currentRoute()==='home'){const key=document.activeElement?.closest('[data-linear-section]')?.dataset.linearSection||'file';status(key,$('error-log').textContent,true);$(`linear-section-${key}`).open=true;}}).observe($('error-log'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  new MutationObserver(()=>{const message=$('status').textContent;if(currentRoute()==='home'&&message&&info()){const key=document.activeElement?.closest('[data-linear-section]')?.dataset.linearSection;if(key)status(key,message,$('status').classList.contains('bad'));}}).observe($('status'),{childList:true,subtree:true});
  window.CommentMasterLinear=Object.freeze({refresh,choose,summaryOptions,version:'7.3.1'});
  refresh();updateTimeFields();
}
