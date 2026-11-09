/** Browser-local Word review summary writer. Never flattens the source DOCX. */
export const SUMMARY_COLUMNS = Object.freeze([
  { key: 'name', label: 'Name', weight: 16 },
  { key: 'date', label: 'Date and time', weight: 18 },
  { key: 'original', label: 'Original text', weight: 34 },
  { key: 'action', label: 'Action', weight: 13 },
  { key: 'redline', label: 'Redlined language', weight: 32 },
  { key: 'comment', label: 'Comment text', weight: 36 },
  { key: 'page', label: 'Page', weight: 10 },
  { key: 'part', label: 'Document part', weight: 14 }
]);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const clean = (value) => Array.from(String(value ?? '')).map((c) => {
  const n = c.codePointAt(0);
  return n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || n >= 0x10000 ? c : '\ufffd';
}).join('');
const xml = (value) => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function normalizeSummaryOptions(options = {}) {
  const comments = options.comments !== false, redlines = options.redlines !== false;
  const selected = options.columns === undefined ? SUMMARY_COLUMNS.map((c) => c.key) : options.columns;
  if (!Array.isArray(selected)) throw new Error('Choose the columns to include.');
  const columns = SUMMARY_COLUMNS.filter((c) => selected.includes(c.key));
  if (!comments && !redlines) throw new Error('Include comments, redlines, or both.');
  if (!columns.length) throw new Error('Select at least one summary column.');
  return { comments, redlines, columns, includeOriginal: options.includeOriginal === true };
}

export function summaryRows(items, options = {}) {
  const opts = normalizeSummaryOptions(options);
  const rows = (items || []).filter((item) => item.type === 'com' ? opts.comments : opts.redlines);
  if (!rows.length) throw new Error('There are no matching comments or redlines to include.');
  if (rows.length > 100000) throw new Error('This summary exceeds the 100,000-row safety limit.');
  return { options: opts, rows: rows.map((item) => ({
    name: item.author || '', date: String(item.date || '').replace(/^(\d{4}-\d{2}-\d{2})T/, '$1\n').replace(/Z$/, ' UTC'), original: item.original ?? item.on ?? '',
    action: item.type === 'com' ? (item.replyToId ? `Comment (reply to ${item.replyToId})` : 'Comment') :
      ({ ins: 'Addition', del: 'Deletion', moveFrom: 'Moved from', moveTo: 'Moved to', format: 'Formatting change' }[item.type] || item.label || 'Tracked change'),
    redline: item.type === 'com' ? '' : item.text || '', comment: item.type === 'com' ? item.text || '' : '',
    page: item.pg || '', part: item.partLabel || item.part || '', type: item.type
  })) };
}

function run(text, { bold = false, color = '172033', size = 18, strike = false, underline = false } = {}) {
  const rPr = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b w:val="${bold ? 1 : 0}"/><w:i w:val="0"/><w:strike w:val="${strike ? 1 : 0}"/><w:dstrike w:val="0"/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:u w:val="${underline ? 'single' : 'none'}"/><w:vanish w:val="0"/></w:rPr>`;
  return clean(text).split(/(\r\n|\n|\r|\t)/).map((part) => `<w:r>${rPr}${part === '\t' ? '<w:tab/>' : /^(\r\n|\n|\r)$/.test(part) ? '<w:br/>' : `<w:t xml:space="preserve">${xml(part)}</w:t>`}</w:r>`).join('');
}
function paragraph(text, ns = W, options = {}) {
  return `<w:p xmlns:w="${ns}"><w:pPr><w:keepNext w:val="${options.keep ? 1 : 0}"/><w:keepLines w:val="0"/><w:pageBreakBefore w:val="0"/><w:widowControl w:val="1"/><w:numPr><w:numId w:val="0"/></w:numPr><w:suppressLineNumbers/><w:spacing w:before="0" w:after="${options.after ?? 80}" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="9"/></w:pPr>${run(text, options)}</w:p>`;
}
function section(ns, landscape) {
  return `<w:sectPr xmlns:w="${ns}"><w:type w:val="nextPage"/><w:pgSz w:w="${landscape ? 15840 : 12240}" w:h="${landscape ? 12240 : 15840}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/><w:cols w:num="1" w:space="720"/><w:titlePg w:val="0"/><w:docGrid w:type="default"/></w:sectPr>`;
}
function blocks(title, rows, columns, ns) {
  const landscape = columns.length > 4, width = landscape ? 14400 : 10800;
  const weight = columns.reduce((sum, c) => sum + c.weight, 0);
  const widths = columns.map((c) => Math.floor(width * c.weight / weight));
  widths[widths.length - 1] += width - widths.reduce((s, n) => s + n, 0);
  const cell = (value, index, header, row) => `<w:tc><w:tcPr><w:tcW w:w="${widths[index]}" w:type="dxa"/><w:shd w:val="clear" w:fill="${header ? '233653' : 'FFFFFF'}"/><w:vAlign w:val="top"/></w:tcPr>${paragraph(value, ns, {
    bold: header, color: header ? 'FFFFFF' : columns[index].key === 'redline' && ['del', 'moveFrom'].includes(row?.type) ? 'A32626' : columns[index].key === 'redline' && ['ins', 'moveTo'].includes(row?.type) ? '175A34' : '172033',
    strike: !header && columns[index].key === 'redline' && ['del', 'moveFrom'].includes(row?.type),
    underline: !header && columns[index].key === 'redline' && ['ins', 'moveTo'].includes(row?.type), after: 0
  })}</w:tc>`;
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="D4DAE3"/>`).join('');
  const table = `<w:tbl xmlns:w="${ns}"><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:jc w:val="left"/><w:tblInd w:w="0" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:shd w:fill="FFFFFF"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="95" w:type="dxa"/><w:left w:w="95" w:type="dxa"/><w:bottom w:w="95" w:type="dxa"/><w:right w:w="95" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((n) => `<w:gridCol w:w="${n}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${columns.map((c, i) => cell(c.label, i, true)).join('')}</w:tr>${rows.map((row) => `<w:tr>${columns.map((c, i) => cell(row[c.key], i, false, row)).join('')}</w:tr>`).join('')}</w:tbl>`;
  const intro = paragraph(title, ns, { bold: true, size: 30, after: 160, keep: true }) +
    paragraph(`${rows.length} review item${rows.length === 1 ? '' : 's'} | Current working document`, ns, { color: '536078', size: 20, after: 120, keep: true }) +
    paragraph('Dates are shown as stored in Word. Page references use saved Word page markers, not recalculated pagination.', ns, { color: '536078', size: 18, after: 180, keep: true });
  return { content: intro + table, landscape };
}

function parse(text, label) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement?.localName === 'parsererror') throw new Error(`${label} could not be read safely.`);
  return doc;
}

export async function buildReviewSummary(source, options = {}) {
  if (!globalThis.JSZip) throw new Error('The Word package reader is unavailable.');
  const { options: opts, rows } = summaryRows(source.items, options);
  if (rows.some((row) => Object.values(row).some((v) => String(v).length > 1000000))) throw new Error('One summary field is too large to export safely.');
  const ns = source.wNs || W;
  const title = `${String(source.fileName || 'Document').replace(/\.docx$/i, '')} review summary`;
  const { content, landscape } = blocks(title, rows, opts.columns, ns);
  let zip;
  let main = source.mainPart || 'word/document.xml';
  if (opts.includeOriginal) {
    if (!source.blob) throw new Error('The current Word document is unavailable.');
    zip = await JSZip.loadAsync(await source.blob.arrayBuffer(), { checkCRC32: true, createFolders: false });
    if (Object.keys(zip.files).some((path) => /^_xmlsignatures\//i.test(path))) {
      throw new Error('This document is digitally signed. Adding summary pages would invalidate its signature. Download the summary separately.');
    }
    const entry = zip.file(main);
    if (!entry) throw new Error('The main Word document part is missing.');
    const originalXml = await entry.async('string');
    const doc = parse(originalXml, 'The current document');
    const body = Array.from(doc.documentElement.childNodes).find((node) => node.nodeType === 1 && node.localName === 'body' && node.namespaceURI === ns);
    if (!body) throw new Error('The Word document has no body.');
    // A first continuous/odd/even/column section cannot safely follow a new summary
    // section without changing the source's own section instructions. Fail closed.
    const firstSection = Array.from(body.getElementsByTagNameNS(ns, 'sectPr')).find((s) => {
      let p = s.parentNode;
      while (p && p !== body) { if (p.localName === 'sectPrChange') return false; p = p.parentNode; }
      return true;
    });
    const type = firstSection && Array.from(firstSection.childNodes).find((n) => n.localName === 'type' && n.namespaceURI === ns);
    const sectionType = type?.getAttributeNS(ns, 'val') || 'nextPage';
    if (sectionType !== 'nextPage') throw new Error('This document begins with a special section break. To keep that layout unchanged, download the summary separately and leave Include original document unchecked.');
    const qname = body.nodeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const opening = new RegExp(`<${qname}(?:\\s[^<>]*?)?>`).exec(originalXml);
    if (!opening) throw new Error('The original document boundary could not be preserved.');
    const prefix = '<!-- Comment Master summary begins -->' + content +
      `<w:p xmlns:w="${ns}"><w:pPr><w:spacing w:before="0" w:after="0"/>${section(ns, landscape)}</w:pPr></w:p>` +
      '<!-- Comment Master summary ends -->';
    const offset = opening.index + opening[0].length;
    const combined = originalXml.slice(0, offset) + prefix + originalXml.slice(offset);
    parse(combined, 'The combined Word document');
    // The source XML is not reserialized: every original byte after the inserted
    // prefix, plus all other OPC parts, remains exactly as in the working copy.
    if (combined.slice(0, offset) + combined.slice(offset + prefix.length) !== originalXml) throw new Error('Source document preservation check failed.');
    zip.file(main, combined);
  } else {
    zip = new JSZip(); main = 'word/document.xml';
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${R}"><Relationship Id="rId1" Type="${ns.includes('purl.oclc.org') ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file(main, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${ns}"><w:body>${content}${section(ns, landscape)}</w:body></w:document>`);
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'DOS' });
  const checked = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
  parse(await checked.file(main).async('string'), 'The exported summary');
  return { blob, count: rows.length, columns: opts.columns.map((c) => c.key), includesDocument: opts.includeOriginal };
}
