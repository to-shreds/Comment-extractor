import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_BATCH_FILES,
  MAX_AGGREGATE_BYTES,
  MAX_INPUT_BYTES,
  WORKBENCH_VERSION,
  assertSafeFiles,
  contextualSuggestions,
  detectFormat,
  editDateStamp,
  editedFilename,
  escapeHtml,
  extensionOf,
  formatLabel,
  humanBytes,
  normalizeRotation,
  parsePageRanges,
  productFilename,
  safeFilename,
  yieldToMain
} from '../../src/workbench-core.mjs';

const FILE_DATE = new Date(2026, 8, 1, 12, 0, 0);

function localFile(name, size = 1, type = '') {
  return { name, size, type, async arrayBuffer() { return new ArrayBuffer(size); } };
}

test('workbench version and format detection remain stable', () => {
  assert.equal(WORKBENCH_VERSION, '7.1.0');
  assert.equal(extensionOf('Case Notes.DOCX'), 'docx');
  assert.equal(extensionOf('archive'), '');
  assert.equal(detectFormat('brief.DOCX'), 'docx');
  assert.equal(detectFormat(localFile('no-extension', 1, 'application/pdf')), 'pdf');
  assert.equal(detectFormat(localFile('photo.jpeg', 1, 'image/jpeg')), 'jpg');
  assert.equal(detectFormat(localFile('notes.markdown', 1, '')), 'md');
  assert.equal(detectFormat(localFile('binary.dat', 1, 'application/octet-stream')), 'unknown');
  assert.equal(formatLabel('pdf'), 'PDF');
  assert.equal(formatLabel('not-real'), 'Unsupported file');
});

test('filenames are safe, readable, and compatible with the v6 edit convention', () => {
  assert.equal(editDateStamp(FILE_DATE), '1.9.26');
  assert.equal(editedFilename('My Original File.docx', FILE_DATE), 'My Original File (Edit 1.9.26).docx');
  assert.equal(editedFilename('Case Notes.DOCX', FILE_DATE), 'Case Notes (Edit 1.9.26).DOCX');
  assert.equal(
    productFilename('A report.final.docx', 'Clean/Share', 'pdf', FILE_DATE),
    'A report.final (Clean_Share 1.9.26).pdf'
  );
  const cleaned = safeFilename('  Case<>:"/\\|?*\u0001   Notes  .docx  ');
  assert.doesNotMatch(cleaned, /[<>:"/\\|?*\u0000-\u001f]/);
  assert.doesNotMatch(cleaned, /\s{2,}/);
  assert.ok(cleaned.length <= 180);
  const longName = `${'Very Long Name '.repeat(20)}.docx`;
  assert.ok(safeFilename(longName).endsWith('.docx'));
  assert.ok(editedFilename(longName, FILE_DATE).endsWith(' (Edit 1.9.26).docx'));
  assert.ok(editedFilename(longName, FILE_DATE).length <= 180);
  assert.ok(!editedFilename('My File.docx', FILE_DATE).includes('%20'));
  assert.throws(() => editDateStamp('not-a-date'), /valid date/i);
});

test('long product filenames reserve the complete suffix and target extension', () => {
  const source = `${'Long Legal Matter Name '.repeat(40)}.DOCX`;
  const output = productFilename(source, 'Clean Copy', 'DOCX', FILE_DATE);
  assert.ok(output.length <= 180);
  assert.ok(output.endsWith(' (Clean Copy 1.9.26).DOCX'));
  assert.equal(extensionOf(output), 'docx');
  assert.match(output, /^Long Legal Matter Name/);
  assert.equal((output.match(/\.DOCX/g) || []).length, 1);
});

test('page range parsing preserves requested order and removes duplicates', () => {
  assert.deepEqual(parsePageRanges('', 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(parsePageRanges('1, 3-5, 5, 2', 5), [0, 2, 3, 4, 1]);
  assert.deepEqual(parsePageRanges('5-3, 1', 5), [4, 3, 2, 0]);
  assert.deepEqual(parsePageRanges('2,2,2-3', 3), [1, 2]);
  assert.throws(() => parsePageRanges('0', 5), /outside/i);
  assert.throws(() => parsePageRanges('6', 5), /outside/i);
  assert.throws(() => parsePageRanges('2-', 5), /not a valid page/i);
  assert.throws(() => parsePageRanges('', 0), /valid page count/i);
});

test('context suggestions select the most relevant three workflows', () => {
  assert.deepEqual(contextualSuggestions([localFile('draft.docx')]), ['review-word', 'clean-word', 'inspect']);
  assert.deepEqual(contextualSuggestions([localFile('base.docx'), localFile('changed.docx')]), ['compare-documents', 'review-word', 'clean-word']);
  assert.deepEqual(contextualSuggestions([localFile('a.docx'), localFile('b.docx'), localFile('c.docx')]), ['combine-commentary', 'batch', 'inspect']);
  assert.deepEqual(contextualSuggestions([localFile('one.pdf')]), ['open-pdf', 'ocr', 'redact']);
  assert.deepEqual(contextualSuggestions([localFile('one.pdf'), localFile('two.pdf')]), ['combine-pdfs', 'binder', 'batch']);
  assert.deepEqual(contextualSuggestions([localFile('one.pdf'), localFile('notes.txt')]), ['binder', 'batch', 'convert']);
  assert.deepEqual(contextualSuggestions([localFile('notes.txt')]), ['convert', 'inspect']);
});

test('file admission checks batch, size, readability, and path safety', () => {
  const good = localFile('good.pdf');
  assert.deepEqual(assertSafeFiles([good]), [good]);
  assert.throws(() => assertSafeFiles([]), /at least one/i);
  assert.throws(() => assertSafeFiles(Array.from({ length: MAX_BATCH_FILES + 1 }, (_, index) => localFile(`${index}.pdf`))), /no more than 100/i);
  assert.throws(() => assertSafeFiles([localFile('large.pdf', MAX_INPUT_BYTES + 1)]), /larger than the 250 MB/i);
  assert.throws(() => assertSafeFiles([localFile('one.pdf', MAX_AGGREGATE_BYTES / 3 + 1), localFile('two.pdf', MAX_AGGREGATE_BYTES / 3 + 1), localFile('three.pdf', MAX_AGGREGATE_BYTES / 3 + 1)]), /combined safety limit/i);
  assert.throws(() => assertSafeFiles([{ name: 'broken.pdf', size: 4 }]), /not a readable local file/i);
  assert.throws(() => assertSafeFiles([localFile('../escape.pdf')]), /unsafe path/i);
  assert.throws(() => assertSafeFiles([localFile('folder\\escape.pdf')]), /unsafe path/i);
});

test('small display and escaping helpers cover boundary values', () => {
  assert.equal(humanBytes(0), '0 B');
  assert.equal(humanBytes(1024), '1.0 KB');
  assert.equal(humanBytes(1024 ** 2), '1.0 MB');
  assert.equal(humanBytes(1024 ** 3), '1.00 GB');
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(449), 90);
  assert.equal(normalizeRotation(44), 0);
  assert.equal(escapeHtml('<a title="x">Tom & Jerry\'s</a>'), '&lt;a title=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

test('yieldToMain honors cancellation before and after yielding', async () => {
  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await assert.rejects(yieldToMain(alreadyCancelled.signal), (error) => error && error.name === 'AbortError');

  const controller = new AbortController();
  const pending = yieldToMain(controller.signal);
  controller.abort();
  await assert.rejects(pending, (error) => error && error.name === 'AbortError');
});
