import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { createReviewDocx } from '../fixtures/generate-word-fixtures.mjs';

let fixture;
test.beforeAll(async () => { fixture = await createReviewDocx(); });
async function shell(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.CommentMasterLinear?.version === '7.3.1');
}
async function jump(page, key) {
  const toggle = page.locator('#linear-sidebar-toggle');
  if (await toggle.isVisible() && !await page.locator(`[data-linear-jump="${key}"]`).isVisible()) await toggle.click();
  await page.locator(`[data-linear-jump="${key}"]`).click();
}
async function upload(page, file = fixture) {
  await jump(page, 'file');
  const pending = page.waitForEvent('filechooser');
  await page.locator('#linear-upload').click();
  const picker = await pending;
  expect(picker.isMultiple()).toBe(false);
  await picker.setFiles(file);
  await expect(page.locator('#linear-filename')).toHaveText(file.name);
}
async function rename(page, name, scope = 'all') {
  await jump(page, 'names');
  await page.locator('#linear-name-from').selectOption('__all__');
  await page.locator('#linear-name-scope').selectOption(scope);
  await page.locator('#linear-name-to').fill(name);
  await page.locator('[data-linear-action="names"]').click();
  await expect(page.locator('[data-nav-status="names"]')).toHaveText('Applied');
}
async function download(page, locator) {
  const pending = page.waitForEvent('download');
  await page.locator(locator).click();
  const result = await pending;
  return { name: result.suggestedFilename(), bytes: await readFile(await result.path()) };
}
async function openSummary(page) {
  await jump(page, 'download');
  await page.locator('#linear-download-summary').click();
  await expect(page.locator('#linear-summary-dialog')).toBeVisible();
}

test('linear landing contains nine optional sections, a left tool index, and exactly two final actions', async ({ page }) => {
  await shell(page);
  await expect(page.locator('[data-linear-section]')).toHaveCount(9);
  await expect(page.locator('.linear-sidebar nav [data-linear-jump]')).toHaveCount(10);
  await expect(page.locator('#linear-download-document')).toBeDisabled();
  await expect(page.locator('#linear-download-summary')).toBeDisabled();
  await expect(page.locator('#linear-section-file')).toHaveAttribute('open', '');
  await expect(page.locator('#linear-section-names')).not.toHaveAttribute('open');
  await expect(page.locator('#linear-legacy-home')).toBeHidden();
});

test('real visible upload stays on Home without phantom edits or completed sections', async ({ page }) => {
  await shell(page);
  await upload(page);
  await expect(page.locator('body')).toHaveAttribute('data-route', 'home');
  const state = await page.evaluate(() => window.CommentMasterWord.workflowInfo());
  expect(state.dirty).toBe(false);
  expect(state.version).toBe(0);
  expect(state.activity).toEqual({});
  await expect(page.locator('[data-nav-status="file"]')).toHaveText('Loaded');
  await expect(page.locator('[data-nav-status="names"]')).toHaveText('Not used');
  await expect(page.locator('#linear-name-from option')).toHaveCount(4);
});

test('opening a section is not a completed edit, and Undo restores accurate status', async ({ page }) => {
  await shell(page); await upload(page); await jump(page, 'times');
  await expect(page.locator('[data-nav-status="times"]')).toHaveText('Not used');
  await rename(page, 'New Reviewer');
  await page.locator('#linear-undo').click();
  await expect(page.locator('[data-nav-status="names"]')).toHaveText('Not used');
  expect(await page.evaluate(() => window.CommentMasterWord.workflowInfo().activity)).toEqual({});
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().items.map((i) => i.author))).toContain('Alex');
});

test('individual comment/name edits and multiple open sections keep the original editing behavior', async ({ page }) => {
  await shell(page); await upload(page); await jump(page, 'review');
  await expect(page.locator('#data-table')).toBeVisible();
  const row = page.locator('#data-body tr').filter({ has: page.locator('[aria-label="Comment text for 0"]') });
  await row.locator('[data-field="author"]').fill('Manual Reviewer');
  await page.locator('#linear-review-search').click();
  await row.locator('[data-field="text"]').fill('Revised comment.');
  await page.locator('#linear-review-search').click();
  await expect(page.locator('[data-nav-status="review"]')).toHaveText('Applied');
  const comment = await page.evaluate(() => window.CommentMasterWord.snapshot().items.find((i) => i.type === 'com'));
  expect(comment.author).toBe('Manual Reviewer'); expect(comment.text).toBe('Revised comment.');
  await jump(page, 'find');
  await expect(page.locator('#view-regex')).toBeVisible();
  await expect(page.locator('#data-table')).toBeVisible();
});

test('dates and metadata operate independently without removing review data', async ({ page }) => {
  await shell(page); await upload(page); await jump(page, 'times');
  await page.locator('#linear-time-mode').selectOption('clear');
  await page.locator('#linear-time-scope').selectOption('comments');
  await page.locator('[data-linear-action="times"]').click();
  await expect(page.locator('[data-nav-status="times"]')).toHaveText('Applied');
  const rows = await page.evaluate(() => window.CommentMasterWord.snapshot().items);
  expect(rows.find((i) => i.type === 'com').date).toBe('');
  expect(rows.find((i) => i.type === 'ins').date).not.toBe('');
  await jump(page, 'metadata');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-linear-action="metadata"]').click();
  await expect(page.locator('[data-nav-status="metadata"]')).toHaveText('Applied');
  const state = await page.evaluate(() => window.CommentMasterWord.workflowInfo());
  expect(state.metadata.creator).toBe(''); expect(state.count).toBe(3);
});

test('summary defaults are comments plus redlines and all columns, with no appendix', async ({ page }) => {
  await shell(page); await upload(page); await openSummary(page);
  expect(await page.evaluate(() => window.CommentMasterLinear.summaryOptions())).toEqual({ comments: true, redlines: true, includeOriginal: false, columns: ['name','date','original','action','redline','comment','page','part'] });
  await page.locator('#summary-comments').uncheck();
  await page.locator('#summary-redlines').uncheck();
  await expect(page.locator('#summary-download')).toBeDisabled();
  await page.locator('#summary-comments').check();
  for (const column of await page.locator('input[name="column"]').all()) await column.uncheck();
  await expect(page.locator('#summary-download')).toBeDisabled();
  await page.locator('input[name="column"][value="comment"]').check();
  const result = await download(page, '#summary-download');
  const zip = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
  const xml = await zip.file('word/document.xml').async('string');
  expect(xml).toContain('Please confirm this provision.'); expect(xml).not.toContain('forty-five');
  expect(xml).not.toContain('>Name<'); expect(xml).not.toContain('>Action<');
});

test('rename then summary then more edits works without a forced Word download', async ({ page }) => {
  await shell(page); await upload(page);
  const downloads = []; page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await rename(page, 'First Reviewer'); expect(downloads).toEqual([]);
  await openSummary(page);
  const report = await download(page, '#summary-download');
  const archive = await JSZip.loadAsync(report.bytes, { checkCRC32: true });
  const text = await archive.file('word/document.xml').async('string');
  expect(text).toContain('First Reviewer'); expect(text).toContain('Payment in thirty days.');
  expect(await page.evaluate(() => window.CommentMasterWord.workflowInfo().dirty)).toBe(true);
  await rename(page, 'Second Reviewer'); expect(downloads).toHaveLength(1);
  await expect(page.locator('[data-nav-status="download"]')).toHaveText('Changed since download');
  await jump(page, 'download'); const edited = await download(page, '#linear-download-document');
  const zip = await JSZip.loadAsync(edited.bytes, { checkCRC32: true });
  expect(await zip.file('word/comments.xml').async('string')).toContain('w:author="Second Reviewer"');
  expect(await zip.file('word/document.xml').async('string')).toContain('w:author="Second Reviewer"');
  await rename(page, 'Third Reviewer'); expect(downloads).toHaveLength(2);
});

test('summary appendix preserves every source part and the exact original body XML', async ({ page }) => {
  await shell(page); await upload(page); await rename(page, 'Preserved Reviewer');
  await openSummary(page); await page.locator('#summary-original').check();
  const combined = await download(page, '#summary-download');
  const edited = await download(page, '#linear-download-document');
  const a = await JSZip.loadAsync(combined.bytes, { checkCRC32: true });
  const b = await JSZip.loadAsync(edited.bytes, { checkCRC32: true });
  const files = Object.keys(b.files).filter((n) => !b.files[n].dir);
  expect(Object.keys(a.files).filter((n) => !a.files[n].dir).sort()).toEqual(files.sort());
  for (const name of files) {
    if (name === 'word/document.xml') continue;
    expect(await a.file(name).async('nodebuffer'), name).toEqual(await b.file(name).async('nodebuffer'));
  }
  const current = await b.file('word/document.xml').async('string');
  const composite = await a.file('word/document.xml').async('string');
  expect(composite.replace(/<!-- Comment Master summary begins -->[\s\S]*?<!-- Comment Master summary ends -->/, '')).toBe(current);
  expect(composite.indexOf('review summary')).toBeLessThan(composite.indexOf('Original commented language.'));
});

test('unsupported first section appendix fails visibly and leaves the working copy intact', async ({ page }) => {
  await shell(page); await upload(page, await createReviewDocx({ specialSection: true }));
  const before = await page.evaluate(() => window.CommentMasterWord.snapshot());
  await openSummary(page); await page.locator('#summary-original').check();
  await page.locator('#summary-download').click();
  await expect(page.locator('#summary-validation')).toContainText('special section break');
  await expect(page.locator('#linear-summary-dialog')).toBeVisible();
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot())).toEqual(before);
  await page.locator('#summary-original').uncheck();
  await download(page, '#summary-download');
});

test('replacing a file resets progress and reviewer options only after confirmation', async ({ page }) => {
  await shell(page); await upload(page); await rename(page, 'Keep My Work');
  const replacement = await createReviewDocx({ name: 'Another document.docx' });
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#home-word-file-input').setInputFiles(replacement);
  await expect(page.locator('#linear-filename')).toHaveText(fixture.name);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#home-word-file-input').setInputFiles(replacement);
  await expect(page.locator('#linear-filename')).toHaveText(replacement.name);
  await expect(page.locator('[data-nav-status="names"]')).toHaveText('Not used');
  await expect(page.locator('#linear-name-from option')).toHaveCount(4);
});

for (const width of [390, 320]) {
  test(`mobile ${width}px keeps editing, sidebar and download options accessible without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await shell(page); await upload(page); await rename(page, 'Mobile Reviewer');
    await jump(page, 'review'); await expect(page.locator('#data-table')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await openSummary(page); await expect(page.locator('#summary-download')).toBeVisible();
    await page.locator('#summary-download').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
