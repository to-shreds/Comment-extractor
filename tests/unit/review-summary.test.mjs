import assert from 'node:assert/strict';
import test from 'node:test';
import { SUMMARY_COLUMNS, normalizeSummaryOptions, summaryRows } from '../../src/review-summary.mjs';

const items = [
  { type: 'com', author: 'Reviewer', date: '2026-11-09T12:00:00Z', text: 'Comment text', on: 'Quoted language', part: 'word/comments.xml', pg: 2 },
  { type: 'ins', author: 'Editor', date: '', original: 'Before insertion.', text: 'Added text', partLabel: 'document', pg: 3 },
  { type: 'del', author: 'Editor', original: 'Before deletion.', text: 'Deleted text', part: 'word/document.xml' },
  { type: 'format', author: 'Formatter', label: 'Paragraph formatting', text: 'Context' }
];

test('summary defaults include both activity types and all eight columns, but no appendix', () => {
  const result = normalizeSummaryOptions();
  assert.equal(result.comments, true);
  assert.equal(result.redlines, true);
  assert.equal(result.includeOriginal, false);
  assert.deepEqual(result.columns.map((c) => c.key), ['name', 'date', 'original', 'action', 'redline', 'comment', 'page', 'part']);
});
test('column selection retains stable order and ignores unknown values', () => {
  assert.deepEqual(normalizeSummaryOptions({ columns: ['comment', 'name', 'name', 'bad'] }).columns.map((c) => c.key), ['name', 'comment']);
});
test('no activity types fails clearly', () => {
  assert.throws(() => normalizeSummaryOptions({ comments: false, redlines: false }), /comments, redlines/);
});
test('no columns and malformed columns fail clearly', () => {
  assert.throws(() => normalizeSummaryOptions({ columns: [] }), /at least one/);
  assert.throws(() => normalizeSummaryOptions({ columns: 'name' }), /Choose the columns/);
});
test('comments-only and redlines-only scopes filter without losing data', () => {
  const comments = summaryRows(items, { redlines: false }).rows;
  const redlines = summaryRows(items, { comments: false }).rows;
  assert.equal(comments.length, 1);
  assert.equal(comments[0].comment, 'Comment text');
  assert.equal(comments[0].redline, '');
  assert.equal(redlines.length, 3);
  assert.equal(redlines[0].action, 'Addition');
  assert.equal(redlines[1].action, 'Deletion');
  assert.equal(redlines[2].action, 'Formatting change');
  assert.equal(redlines[0].comment, '');
});
test('original paragraph and changed text remain separate', () => {
  const rows = summaryRows(items).rows;
  assert.equal(rows[0].original, 'Quoted language');
  assert.equal(rows[1].original, 'Before insertion.');
  assert.equal(rows[1].redline, 'Added text');
  assert.equal(rows[2].original, 'Before deletion.');
  assert.equal(rows[2].redline, 'Deleted text');
});
test('timestamps remain explicitly UTC when the stored value is UTC', () => {
  assert.equal(summaryRows(items).rows[0].date, '2026-11-09\n12:00:00 UTC');
  assert.equal(summaryRows(items).rows[1].date, '');
});
test('reply and moved-text action labels are retained', () => {
  const rows = summaryRows([{ type: 'com', replyToId: '12' }, { type: 'moveFrom', text: 'old' }, { type: 'moveTo', text: 'new' }]).rows;
  assert.equal(rows[0].action, 'Comment (reply to 12)');
  assert.equal(rows[1].action, 'Moved from');
  assert.equal(rows[2].action, 'Moved to');
});
test('empty reports are not silently exported', () => {
  assert.throws(() => summaryRows([]), /no matching/);
  assert.throws(() => summaryRows(items.slice(1), { redlines: false }), /no matching/);
});
test('report row safety limit is enforced', () => {
  assert.throws(() => summaryRows(Array(100001).fill({ type: 'com' })), /100,000-row/);
});
test('input data and column configuration are not mutated', () => {
  const before = JSON.stringify(items);
  summaryRows(items, { comments: true, columns: ['name', 'comment'], includeOriginal: true });
  assert.equal(JSON.stringify(items), before);
  assert.equal(SUMMARY_COLUMNS.length, 8);
});
