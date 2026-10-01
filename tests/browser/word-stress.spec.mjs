import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function docx(body = 'Original stable paragraph', overrides = {}) {
  const zip = new JSZip();
  const parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p><w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Comment anchor</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p><w:sectPr/></w:body></w:document>`,
    'word/comments.xml': `<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Original Reviewer" w:date="2024-01-02T03:04:05Z"><w:p><w:r><w:t>Stable reviewer comment</w:t></w:r></w:p></w:comment></w:comments>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${PR}"><Relationship Id="rIdComments" Type="${R}/comments" Target="comments.xml"/></Relationships>`,
    ...overrides
  };
  for (const [part, xml] of Object.entries(parts)) if (xml !== null) zip.file(part, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function open(page, bytes, name = 'Original.docx') {
  await page.evaluate(async ({ bytes, name }) => {
    await window.CommentMasterWord.openFile(new File([Uint8Array.from(bytes)], name));
  }, { bytes: Array.from(bytes), name });
}

async function slowOpen(page, bytes, name) {
  await page.evaluate(({ bytes, name }) => {
    const data = Uint8Array.from(bytes);
    const slow = new File([data], name);
    slow.arrayBuffer = () => new Promise((resolve) => { window.__releaseWordRead = () => resolve(data.buffer); });
    window.__pendingWordRead = window.CommentMasterWord.openFile(slow);
  }, { bytes: Array.from(bytes), name });
  await expect(page.locator('#busy-overlay')).toBeVisible();
}

async function stageWord(page, bytes, name = 'Staged original.docx') {
  await page.evaluate(async ({ bytes, name }) => {
    window.__stagedWordFile = new File([Uint8Array.from(bytes)], name);
    await window.CommentMasterWorkbench.openFiles([window.__stagedWordFile]);
  }, { bytes: Array.from(bytes), name });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }); } catch (_) {}
  });
  await page.goto('/#test');
  await page.waitForFunction(() => typeof window.__CM_TEST__?.state === 'function');
});

test('malformed DOCX failures preserve the existing document and release busy controls', async ({ page }) => {
  const original = await docx();
  await open(page, original);
  const before = await page.evaluate(() => window.CommentMasterWord.snapshot());
  const failures = [
    { name: 'Wrong extension.pdf', bytes: original, message: /ends in .docx/ },
    { name: 'Not zip.docx', bytes: Buffer.from('arbitrary invalid file'), message: /ZIP-based DOCX/ },
    { name: 'Missing content types.docx', bytes: await docx('Body', { '[Content_Types].xml': null }), message: /missing required DOCX part/ },
    { name: 'Malformed XML.docx', bytes: await docx('Body', { 'word/document.xml': `<w:document xmlns:w="${W}"><w:body></w:document>` }), message: /Malformed XML/ },
    { name: 'Unsafe.docx', bytes: await docx('Body', { '../private.xml': '<private/>' }), message: /unsafe part name/ },
    { name: 'Wrong document.docx', bytes: await docx('Body', { 'word/document.xml': '<root/>' }), message: /not WordprocessingML/ }
  ];
  for (const fixture of failures) {
    await open(page, fixture.bytes, fixture.name);
    await expect(page.locator('#error-log')).toContainText(fixture.message);
    expect(await page.evaluate(() => window.CommentMasterWord.snapshot())).toEqual(before);
    expect(await page.evaluate(() => window.__CM_TEST__.state().busy)).toBe(false);
    await expect(page.locator('#home-author')).toBeEnabled();
  }
});

test('overlapping Word opens retain the newest successful load', async ({ page }) => {
  const bytes = await docx();
  await slowOpen(page, bytes, 'Slow first.docx');
  await open(page, bytes, 'Newest.docx');
  await page.evaluate(async () => { window.__releaseWordRead(); await window.__pendingWordRead; });
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().fileName)).toBe('Newest.docx');
  expect(await page.evaluate(() => window.__CM_TEST__.state().busy)).toBe(false);
  await expect(page.locator('#error-log')).toBeHidden();
});

test('clear during the first Word open cancels the load and releases controls', async ({ page }) => {
  await slowOpen(page, await docx(), 'Cancelled.docx');
  await page.evaluate(async () => {
    window.CommentMasterWord.clearLocalDocument();
    window.__releaseWordRead();
    await window.__pendingWordRead;
  });
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot())).toBeNull();
  expect(await page.evaluate(() => window.__CM_TEST__.state().busy)).toBe(false);
  await expect(page.locator('#busy-overlay')).toBeHidden();
});

test('Clear Local Workspace cancels an initial pending Word load', async ({ page }) => {
  await slowOpen(page, await docx(), 'Cancelled workspace.docx');
  await page.evaluate(() => {
    document.querySelector('[data-wb-action="clear-workspace"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#status')).toContainText('Local workspace cleared');
  await page.evaluate(async () => { window.__releaseWordRead(); await window.__pendingWordRead; });
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot())).toBeNull();
  await expect(page.locator('#busy-overlay')).toBeHidden();
});

test('clear during a replacement Word open preserves the cleared state and releases controls', async ({ page }) => {
  const bytes = await docx();
  await open(page, bytes);
  await slowOpen(page, bytes, 'Cancelled replacement.docx');
  await page.evaluate(async () => {
    window.CommentMasterWord.clearLocalDocument();
    window.__releaseWordRead();
    await window.__pendingWordRead;
  });
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot())).toBeNull();
  expect(await page.evaluate(() => window.__CM_TEST__.state().busy)).toBe(false);
  await expect(page.locator('#busy-overlay')).toBeHidden();
});

test('reviewer edits undo and survive an exported DOCX round trip', async ({ page }) => {
  await open(page, await docx(), 'My original file.docx');
  await page.locator('#home-author').fill('Round Trip Reviewer');
  await page.locator('[data-action="homeRename"]').click();
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().items[0].author)).toBe('Round Trip Reviewer');
  await page.locator('[data-action="undo"]').click();
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().items[0].author)).toBe('Original Reviewer');
  await page.locator('#home-author').fill('Round Trip Reviewer');
  await page.locator('[data-action="homeRename"]').click();
  const pending = page.waitForEvent('download');
  await page.evaluate(() => window.CommentMasterWord.saveCurrent());
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^My original file \(Edit \d+\.\d+\.\d+\)\.docx$/);
  const bytes = await readFile(await download.path());
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  expect(await archive.file('word/comments.xml').async('string')).toContain('Round Trip Reviewer');
  await open(page, bytes, download.suggestedFilename());
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().items[0].author)).toBe('Round Trip Reviewer');
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().items[0].text)).toBe('Stable reviewer comment');
});

test('reopening the same staged File retains current reviewer edits without a discard prompt', async ({ page }) => {
  await stageWord(page, await docx());
  await page.locator('#home-author').fill('Current Edited Reviewer');
  await page.locator('[data-action="homeRename"]').click();
  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.evaluate(() => window.CommentMasterWorkbench.openFiles([window.__stagedWordFile]));
  expect(dialogs).toEqual([]);
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().items[0].author)).toBe('Current Edited Reviewer');
  expect(await page.evaluate(() => window.CommentMasterWord.isCurrentFile(window.__stagedWordFile))).toBe(true);
  expect(await page.evaluate(() => window.CommentMasterWord.isCurrentFile(new File([], window.__stagedWordFile.name)))).toBe(false);
});

test('returning to the current File cancels a pending replacement load', async ({ page }) => {
  const bytes = await docx();
  await stageWord(page, bytes);
  await slowOpen(page, bytes, 'Superseded replacement.docx');
  await page.evaluate(async () => {
    await window.CommentMasterWord.openFile(window.__stagedWordFile);
    window.__releaseWordRead();
    await window.__pendingWordRead;
  });
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().fileName)).toBe('Staged original.docx');
  expect(await page.evaluate(() => window.__CM_TEST__.state().busy)).toBe(false);
});

test('Clean Copy for the staged current File includes in-memory reviewer edits', async ({ page }) => {
  await stageWord(page, await docx());
  await page.locator('#home-author').fill('Current Edited Reviewer');
  await page.locator('[data-action="homeRename"]').click();
  await page.locator('#nav-toggle').click();
  await page.locator('#global-navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('[data-suggestion="clean-word"]').click();
  await expect(page.locator('#clean-word-source')).toContainText('Staged original.docx');
  await page.locator('#clean-remove-comments').uncheck();
  await page.locator('#clean-review-metadata').uncheck();
  await page.locator('[data-wb-action="clean-word-run"]').click();
  await expect(page.locator('#result-dialog')).toHaveAttribute('open', '');
  const pending = page.waitForEvent('download');
  await page.locator('#result-download').click();
  const bytes = await readFile(await (await pending).path());
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  expect(await archive.file('word/comments.xml').async('string')).toContain('Current Edited Reviewer');
  expect(await page.evaluate(() => window.CommentMasterWord.snapshot().items[0].author)).toBe('Current Edited Reviewer');
});

test('closing Word removes document text, reviewer names, and previews from the DOM', async ({ page }) => {
  await open(page, await docx(), 'Private Filename.docx');
  for (const tab of ['all', 'parts', 'ghost', 'meta']) {
    await page.evaluate((tab) => window.CommentMasterWord.selectTab(tab), tab);
  }
  await page.evaluate(() => window.CommentMasterWord.clearLocalDocument());
  const retained = await page.evaluate(() => ({
    text: document.querySelector('#workspace').textContent,
    values: Array.from(document.querySelectorAll('#workspace input, #workspace textarea, #workspace select'), (element) => element.value).join('\n')
  }));
  for (const value of ['Private Filename.docx', 'Original stable paragraph', 'Original Reviewer', 'Stable reviewer comment']) {
    expect(retained.text).not.toContain(value);
    expect(retained.values).not.toContain(value);
  }
});
