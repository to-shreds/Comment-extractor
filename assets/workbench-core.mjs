export const WORKBENCH_VERSION = '7.1.1';

export const FORMAT_LABELS = Object.freeze({
  docx: 'Word document', pdf: 'PDF', xlsx: 'Excel workbook', csv: 'CSV', pptx: 'PowerPoint presentation',
  odt: 'OpenDocument text', rtf: 'Rich text', txt: 'Text', md: 'Markdown', html: 'HTML',
  png: 'PNG image', jpg: 'JPEG image', jpeg: 'JPEG image', webp: 'WebP image', gif: 'GIF image',
  unknown: 'Unsupported file'
});

export const MAX_INPUT_BYTES = 250 * 1024 * 1024;
export const MAX_AGGREGATE_BYTES = 500 * 1024 * 1024;
export const MAX_BATCH_FILES = 100;

export function extensionOf(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match ? match[1] : '';
}

export function detectFormat(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName && fileOrName.name || '';
  const type = typeof fileOrName === 'string' ? '' : String(fileOrName && fileOrName.type || '').toLowerCase();
  const extension = extensionOf(name);
  if (extension === 'docx' || /wordprocessingml/.test(type)) return 'docx';
  if (extension === 'pdf' || type === 'application/pdf') return 'pdf';
  if (extension === 'xlsx' || /spreadsheetml/.test(type)) return 'xlsx';
  if (extension === 'csv' || type === 'text/csv') return 'csv';
  if (extension === 'pptx' || /presentationml/.test(type)) return 'pptx';
  if (extension === 'odt' || /opendocument\.text/.test(type)) return 'odt';
  if (extension === 'rtf' || /application\/rtf|text\/rtf/.test(type)) return 'rtf';
  if (extension === 'md' || extension === 'markdown' || type === 'text/markdown') return 'md';
  if (extension === 'html' || extension === 'htm' || type === 'text/html') return 'html';
  if (extension === 'txt' || type === 'text/plain') return 'txt';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension) || /^image\/(png|jpeg|webp|gif)$/.test(type)) return extension === 'jpeg' ? 'jpg' : extension;
  return 'unknown';
}

export function formatLabel(format) {
  return FORMAT_LABELS[format] || FORMAT_LABELS.unknown;
}

export function assertSafeFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) throw new Error('Choose at least one file.');
  if (list.length > MAX_BATCH_FILES) throw new Error(`Choose no more than ${MAX_BATCH_FILES} files at a time.`);
  let aggregate = 0;
  list.forEach((file) => {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('One selected item is not a readable local file.');
    if (file.size > MAX_INPUT_BYTES) throw new Error(`${file.name || 'A file'} is larger than the 250 MB safety limit.`);
    aggregate += Math.max(0, Number(file.size) || 0);
    if (/[/\\\0]/.test(file.name || '')) throw new Error('A selected filename contains unsafe path characters.');
  });
  if (aggregate > MAX_AGGREGATE_BYTES) throw new Error('The selected files exceed the 500 MB combined safety limit. Process them in smaller groups.');
  return list;
}

export function editDateStamp(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) throw new Error('A valid date is required.');
  return `${value.getDate()}.${value.getMonth() + 1}.${String(value.getFullYear()).slice(-2)}`;
}

export function safeFilename(name = 'document') {
  const cleaned = String(name || 'document').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim() || 'document';
  if (cleaned.length <= 180) return cleaned;
  const extension = (cleaned.match(/\.[a-z0-9]{1,12}$/i) || [''])[0];
  return `${cleaned.slice(0, Math.max(1, 180 - extension.length)).trimEnd()}${extension}`;
}

export function productFilename(originalName, label, extension, date = new Date()) {
  const original = safeFilename(originalName || 'document');
  const originalExtension = extensionOf(original);
  const targetExtension = String(extension || originalExtension || 'bin').replace(/^\./, '');
  const base = originalExtension ? original.slice(0, -(originalExtension.length + 1)) : original;
  const suffix = ` (${safeFilename(label)} ${editDateStamp(date)}).${targetExtension}`;
  return `${base.slice(0, Math.max(1, 180 - suffix.length)).trimEnd()}${suffix}`;
}

export function editedFilename(originalName, date = new Date()) {
  const originalExtension = String(originalName || '').match(/\.([a-z0-9]{1,12})$/i);
  return productFilename(originalName, 'Edit', originalExtension ? originalExtension[1] : 'docx', date);
}

export function humanBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export function parsePageRanges(input, pageCount) {
  const total = Number(pageCount);
  if (!Number.isInteger(total) || total < 1) throw new Error('A valid page count is required.');
  const value = String(input || '').trim();
  if (!value) return Array.from({ length: total }, (_, index) => index);
  const output = [];
  const seen = new Set();
  for (const rawPart of value.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const single = part.match(/^\d+$/);
    if (!range && !single) throw new Error(`“${part}” is not a valid page or page range.`);
    const start = Number(range ? range[1] : part);
    const end = Number(range ? range[2] : part);
    if (start < 1 || end < 1 || start > total || end > total) throw new Error(`Page ${Math.max(start, end)} is outside this ${total}-page document.`);
    const direction = start <= end ? 1 : -1;
    for (let page = start; direction > 0 ? page <= end : page >= end; page += direction) {
      const index = page - 1;
      if (!seen.has(index)) { output.push(index); seen.add(index); }
    }
  }
  if (!output.length) throw new Error('Choose at least one page.');
  return output;
}

export function contextualSuggestions(files) {
  const list = Array.from(files || []);
  const formats = list.map(detectFormat);
  const docxCount = formats.filter((format) => format === 'docx').length;
  const pdfCount = formats.filter((format) => format === 'pdf').length;
  const suggestions = [];
  if (list.length === 1 && docxCount === 1) suggestions.push('review-word', 'clean-word', 'inspect');
  else if (list.length === 2 && docxCount === 2) suggestions.push('compare-documents', 'review-word', 'clean-word');
  else if (list.length >= 3 && docxCount === list.length) suggestions.push('combine-commentary', 'batch', 'inspect');
  else if (list.length === 1 && pdfCount === 1) suggestions.push('open-pdf', 'ocr', 'redact');
  else if (list.length > 1 && pdfCount === list.length) suggestions.push('combine-pdfs', 'binder', 'batch');
  else if (list.length > 1) suggestions.push('binder', 'batch', 'convert');
  else suggestions.push('convert', 'inspect');
  return suggestions.slice(0, 3);
}

export function normalizeRotation(value) {
  const number = Number(value) || 0;
  return ((Math.round(number / 90) * 90) % 360 + 360) % 360;
}

export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function yieldToMain(signal) {
  if (signal && signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (signal && signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}
