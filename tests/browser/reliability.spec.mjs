import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createOrderedPdf } from '../fixtures/generate-fixtures.mjs';

let pdfFixture;
let replacementPdfFixture;

test.beforeAll(async () => {
  pdfFixture = { name: 'Reliability Pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await createOrderedPdf()) };
  const replacement = await PDFDocument.create();
  const font = await replacement.embedFont(StandardFonts.Helvetica);
  replacement.addPage().drawText('Replacement search fixture.', { x: 40, y: 700, font, size: 16 });
  replacementPdfFixture = { name: 'Replacement Search.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await replacement.save()) };
});

async function openShell(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.CommentMasterWorkbench?.openFiles === 'function');
}

async function openTools(page, tab = 'binder') {
  await page.locator('#nav-toggle').click();
  await page.locator('#global-navigation').getByRole('button', { name: 'More Tools', exact: true }).click();
  if (tab !== 'binder') await page.locator(`[data-tool-tab="${tab}"]`).click();
}

async function openPdf(page) {
  await page.locator('#workbench-file-input').setInputFiles(pdfFixture);
  await expect(page.locator('#pdf-title')).toHaveText(pdfFixture.name);
  await expect(page.locator('#pdf-page-accessible-text')).toContainText('PAGE ALPHA');
}

function textUploads(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({ name: `${prefix}-${index}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Synthetic queue fixture.') }));
}

test('cancelling the fallback file picker releases its pending state', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { document.getElementById('workbench-file-input').click = () => {}; });
  await page.locator('#home-drop-zone').getByRole('button', { name: 'Choose files', exact: true }).click();
  await expect(page.locator('#workbench-file-input')).toHaveAttribute('data-pending-picker', 'true');
  await page.locator('#workbench-file-input').dispatchEvent('cancel');
  await expect(page.locator('#workbench-file-input')).not.toHaveAttribute('data-pending-picker', 'true');
  await expect(page.locator('#home-selection')).toBeHidden();
});

test('repeated cancelled picker attempts open a selected document only once', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => {
    document.getElementById('workbench-file-input').click = () => {};
    window.__reliabilityOpenCount = 0;
    window.CommentMasterWord = {
      openFile: async () => { window.__reliabilityOpenCount += 1; },
      hasDocument: () => false
    };
  });
  const choose = page.locator('#home-drop-zone').getByRole('button', { name: 'Choose files', exact: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await choose.click();
    await page.locator('#workbench-file-input').dispatchEvent('cancel');
  }
  await choose.click();
  await page.locator('#workbench-file-input').setInputFiles({ name: 'Picker.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('Picker control fixture; the engine is replaced in this test.') });
  await expect.poll(() => page.evaluate(() => window.__reliabilityOpenCount)).toBe(1);
});

test('repeated queue additions enforce the cumulative 100-file limit', async ({ page }) => {
  await openShell(page);
  await openTools(page, 'batch');
  await page.locator('#batch-files').setInputFiles(textUploads('first', 60));
  await expect(page.locator('#batch-queue .queue-row')).toHaveCount(60);
  await page.locator('#batch-files').setInputFiles(textUploads('second', 60));
  await expect(page.locator('#error-log')).toContainText('100');
  await expect(page.locator('#batch-queue .queue-row')).toHaveCount(60);
  await expect(page.locator('#batch-queue')).toContainText('first-0.txt');
  await expect(page.locator('#batch-queue')).not.toContainText('second-0.txt');
});

test('repeated queue additions enforce the cumulative 500 MB limit', async ({ page }) => {
  await openShell(page);
  await openTools(page, 'binder');
  for (const prefix of ['first', 'second']) {
    await page.evaluate((namePrefix) => {
      const transfer = new DataTransfer();
      for (let index = 0; index < 30; index += 1) {
        const file = new File(['Small synthetic payload.'], `${namePrefix}-${index}.txt`, { type: 'text/plain' });
        Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 });
        transfer.items.add(file);
      }
      const zone = document.querySelector('[data-tool-pane="binder"] .tool-source-zone');
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, prefix);
  }
  await expect(page.locator('#error-log')).toContainText('500 MB');
  await expect(page.locator('#binder-queue .queue-row')).toHaveCount(30);
  await expect(page.locator('#binder-queue')).not.toContainText('second-0.txt');
});

test('invalid binder drag payloads cannot reorder or corrupt the source queue', async ({ page }) => {
  await openShell(page);
  await openTools(page);
  await page.locator('#binder-files').setInputFiles(textUploads('binder', 3));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const payload of ['9999', '-1', '', 'not a source row']) {
    await page.evaluate((value) => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', value);
      const row = document.querySelector('#binder-queue [data-queue-row="2"]');
      row.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, payload);
    await expect(page.locator('#binder-queue .queue-file > strong')).toHaveText(['binder-0.txt', 'binder-1.txt', 'binder-2.txt']);
  }
  expect(errors).toEqual([]);
});

test('cancelling a native PDF save preserves the unsaved working state', async ({ page }) => {
  await openShell(page);
  await openPdf(page);
  await page.locator('[data-pdf-tab="pages"]').click();
  await page.locator('[data-wb-action="pdf-rotate-right"]').click();
  await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');
  await page.evaluate(() => {
    window.showSaveFilePicker = async () => { throw new DOMException('Synthetic user cancellation', 'AbortError'); };
  });
  await page.locator('[data-pdf-tab="export"]').click();
  await page.locator('[data-pdf-pane="export"] [data-wb-action="export-pdf"]').click();
  await expect(page.locator('#progress-dialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');
  await expect(page.locator('#pdf-export-changes')).not.toHaveText('None');
});

test('a failed PDF replacement retains the active document and pending page edits', async ({ page }) => {
  await openShell(page);
  await openPdf(page);
  await page.locator('[data-pdf-tab="pages"]').click();
  await page.locator('[data-wb-action="pdf-rotate-right"]').click();
  await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#workbench-file-input').setInputFiles({ name: 'Unreadable Replacement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('This is not a PDF.') });
  await expect(page.locator('#error-log')).toBeVisible();
  await expect(page.locator('#pdf-title')).toHaveText(pdfFixture.name);
  await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');
  await expect(page.locator('#pdf-export-changes')).toContainText('rotation');
  expect(await page.evaluate(() => window.CommentMasterWorkbench.resources().pdfLoaded)).toBe(true);
  await page.locator('[data-pdf-tab="review"]').click();
  await page.locator('[data-wb-action="pdf-next"]').click();
  await expect(page.locator('#pdf-page-accessible-text')).toContainText('PAGE BRAVO');
});

async function beginDelayedPdfOpen(page) {
  await page.evaluate((bytes) => {
    const source = new File([new Uint8Array(bytes)], 'Delayed First.pdf', { type: 'application/pdf' });
    window.__firstOpenSettled = false;
    window.__firstReadStarted = false;
    source.arrayBuffer = () => {
      window.__firstReadStarted = true;
      return new Promise((resolve) => { window.__releaseFirstRead = () => resolve(new Uint8Array(bytes).buffer); });
    };
    window.__firstOpenPromise = Promise.resolve(window.CommentMasterWorkbench.openFiles([source])).finally(() => { window.__firstOpenSettled = true; });
  }, Array.from(pdfFixture.buffer));
  await page.waitForFunction(() => window.__firstReadStarted);
  // The public open operation must settle after its source has been read and admitted.
  expect(await page.evaluate(() => window.__firstOpenSettled)).toBe(false);
}

test('the latest PDF selection wins when an earlier file read finishes later', async ({ page }) => {
  await openShell(page);
  await beginDelayedPdfOpen(page);
  await page.evaluate(async (bytes) => {
    const latest = new File([new Uint8Array(bytes)], 'Latest PDF.pdf', { type: 'application/pdf' });
    await window.CommentMasterWorkbench.openFiles([latest]);
  }, Array.from(replacementPdfFixture.buffer));
  await expect(page.locator('#pdf-title')).toHaveText('Latest PDF.pdf');
  await page.evaluate(async () => { window.__releaseFirstRead(); await window.__firstOpenPromise; });
  await expect(page.locator('#pdf-title')).toHaveText('Latest PDF.pdf');
  await expect(page.locator('#pdf-page-accessible-text')).toContainText('Replacement search fixture.');
  await expect(page.locator('#pdf-page-number')).toHaveText('Page 1 of 1');
});

test('clearing the workspace invalidates a PDF read that is still pending', async ({ page }) => {
  await openShell(page);
  await beginDelayedPdfOpen(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#nav-toggle').click();
  await page.locator('#global-navigation').getByRole('button', { name: 'More Tools', exact: true }).click();
  await page.locator('[data-wb-action="clear-workspace"]').click();
  await expect(page.locator('#status')).toContainText('workspace cleared');
  await page.evaluate(async () => { window.__releaseFirstRead(); await window.__firstOpenPromise; });
  expect(await page.evaluate(() => window.CommentMasterWorkbench.resources().pdfLoaded)).toBe(false);
  await expect(page.locator('#pdf-loaded')).toBeHidden();
  await expect(page.locator('#home-selection')).toBeHidden();
});

test('reopening the same staged PDF preserves unsaved rotations', async ({ page }) => {
  await openShell(page);
  await page.evaluate(async (bytes) => {
    window.__samePdf = new File([new Uint8Array(bytes)], 'Reusable PDF.pdf', { type: 'application/pdf' });
    await window.CommentMasterWorkbench.openFiles([window.__samePdf]);
  }, Array.from(pdfFixture.buffer));
  await expect(page.locator('#pdf-title')).toHaveText('Reusable PDF.pdf');
  await page.locator('[data-pdf-tab="pages"]').click();
  await page.locator('[data-wb-action="pdf-rotate-right"]').click();
  await expect(page.locator('#pdf-export-changes')).toContainText('rotation');
  const awaitable = await page.evaluate(async () => {
    const operation = window.CommentMasterWorkbench.openFiles([window.__samePdf]);
    const waitsForOpen = Boolean(operation && typeof operation.then === 'function');
    await operation;
    return waitsForOpen;
  });
  expect(awaitable).toBe(true);
  await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');
  await expect(page.locator('#pdf-export-changes')).toContainText('rotation');
});

test('opening another PDF clears search results belonging to the previous document', async ({ page }) => {
  await openShell(page);
  await openPdf(page);
  await page.locator('#pdf-search').fill('PAGE BRAVO');
  await page.locator('[data-wb-action="pdf-search"]').click();
  await expect(page.locator('#pdf-search-results [data-search-page]')).toHaveCount(1);
  await page.locator('#workbench-file-input').setInputFiles(replacementPdfFixture);
  await expect(page.locator('#pdf-title')).toHaveText(replacementPdfFixture.name);
  await expect(page.locator('#pdf-page-accessible-text')).toContainText('Replacement search fixture.');
  await expect(page.locator('#pdf-search-results [data-search-page]')).toHaveCount(0);
});

test('clearing PDF work releases dirty state and removes rendered document and result content', async ({ page }) => {
  await openShell(page);
  await openPdf(page);
  await page.locator('#pdf-search').fill('PAGE BRAVO');
  await page.locator('[data-wb-action="pdf-search"]').click();
  await expect(page.locator('#pdf-search-results [data-search-page]')).toHaveCount(1);
  await page.locator('[data-pdf-tab="pages"]').click();
  await page.locator('[data-wb-action="pdf-rotate-right"]').click();
  await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');
  await page.evaluate(() => {
    window.CommentMasterWorkbench.showResult('conversion', {
      blob: new Blob(['Synthetic result canary.'], { type: 'text/plain' }),
      filename: 'Clear Workspace Fixture.txt',
      message: 'Result content canary to remove from the DOM.'
    });
  });
  await expect(page.locator('#result-content')).toContainText('Result content canary');
  await page.locator('#result-dialog [data-wb-action="close-dialog"]').click();
  await openTools(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('[data-wb-action="clear-workspace"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-route', 'home');
  await expect(page.locator('#status')).toContainText('workspace cleared');
  await expect(page.locator('#result-content')).toBeEmpty();
  await expect(page.locator('#pdf-page-accessible-text')).toBeEmpty();
  await expect(page.locator('#pdf-search-results')).toBeEmpty();
  await expect(page.locator('#pdf-file-pill')).not.toContainText('unsaved');
  const resources = await page.evaluate(() => ({ ...window.CommentMasterWorkbench.resources(), canvasWidth: document.getElementById('pdf-canvas').width }));
  expect(resources.pdfLoaded).toBe(false);
  expect(resources.objectUrls).toBe(0);
  expect(resources.canvasWidth).toBe(0);
});

test('a malformed PDF dropped into the PDF surface produces a visible error without an unhandled rejection', async ({ page }) => {
  await openShell(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['Synthetic malformed PDF.'], 'Malformed Drop.pdf', { type: 'application/pdf' }));
    document.getElementById('pdf-empty').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.locator('#error-log')).toBeVisible();
  await expect(page.locator('#error-log')).not.toBeEmpty();
  expect(await page.evaluate(() => window.CommentMasterWorkbench.resources().pdfLoaded)).toBe(false);
  expect(errors).toEqual([]);
});

test('PDF Open another opens a picker after the initial file was staged on Home', async ({ page }) => {
  await openShell(page);
  await openPdf(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#pdf-loaded [data-wb-action="open-pdf-file"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(replacementPdfFixture);
  await expect(page.locator('#pdf-title')).toHaveText(replacementPdfFixture.name);
  await expect(page.locator('#pdf-page-number')).toHaveText('Page 1 of 1');
});

test('the More menu closes when the user clicks outside it', async ({ page }) => {
  await openShell(page);
  await page.locator('#nav-toggle').click();
  await expect(page.locator('#global-navigation')).toBeVisible();
  await page.locator('#home h2').first().click();
  await expect(page.locator('#global-navigation')).toBeHidden();
  await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded', 'false');
});

test('the phone header keeps the application name and More control on one row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openShell(page);
  const brand = await page.locator('.brand-block').boundingBox();
  const more = await page.locator('#nav-toggle').boundingBox();
  expect(brand).toBeTruthy();
  expect(more).toBeTruthy();
  expect(Math.abs((brand.y + brand.height / 2) - (more.y + more.height / 2))).toBeLessThanOrEqual(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

async function downloadedZip(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  return JSZip.loadAsync(await readFile(await download.path()));
}

test('conversion ZIPs retain both results when distinct source extensions share a base name', async ({ page }) => {
  await openShell(page);
  await openTools(page, 'convert');
  await page.locator('#convert-output').selectOption('txt');
  await page.locator('#convert-files').setInputFiles([
    { name: 'Contract.txt', mimeType: 'text/plain', buffer: Buffer.from('FIRST COPY CANARY') },
    { name: 'Contract.md', mimeType: 'text/markdown', buffer: Buffer.from('SECOND COPY CANARY') }
  ]);
  await page.locator('[data-wb-action="convert-run"]').click();
  await expect(page.locator('#result-dialog')).toHaveAttribute('open', '');
  const zip = await downloadedZip(page, '#result-download');
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  expect(entries).toHaveLength(2);
  const contents = await Promise.all(entries.map((entry) => entry.async('string')));
  expect(contents).toContain('FIRST COPY CANARY');
  expect(contents).toContain('SECOND COPY CANARY');
});

test('batch ZIPs retain both health reports when source extensions share a base name', async ({ page }) => {
  await openShell(page);
  await openTools(page, 'batch');
  await page.locator('#batch-operation').selectOption('inspect');
  await page.locator('#batch-files').setInputFiles([
    { name: 'Contract.txt', mimeType: 'text/plain', buffer: Buffer.from('First batch source.') },
    { name: 'Contract.md', mimeType: 'text/markdown', buffer: Buffer.from('Second batch source.') }
  ]);
  await page.locator('[data-wb-action="batch-run"]').click();
  await expect(page.locator('#batch-download-zip')).toBeEnabled();
  const zip = await downloadedZip(page, '#batch-download-zip');
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  expect(entries).toHaveLength(2);
  const reports = await Promise.all(entries.map(async (entry) => JSON.parse(await entry.async('string'))));
  expect(reports.map((report) => report.name).sort()).toEqual(['Contract.md', 'Contract.txt']);
});

test('returning to the current PDF invalidates a slower pending replacement and preserves edits', async ({ page }) => {
  await openShell(page);
  await page.evaluate(async (bytes) => {
    window.__currentPdf = new File([new Uint8Array(bytes)], 'Current Working PDF.pdf', { type: 'application/pdf' });
    await window.CommentMasterWorkbench.openFiles([window.__currentPdf]);
  }, Array.from(pdfFixture.buffer));
  await expect(page.locator('#pdf-title')).toHaveText('Current Working PDF.pdf');
  await page.locator('[data-pdf-tab="pages"]').click();
  await page.locator('[data-wb-action="pdf-rotate-right"]').click();
  await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');
  await beginDelayedPdfOpen(page);
  // Accept any unexpected discard prompt so the assertion cannot pass merely because
  // the browser automatically dismisses a stale replacement's confirmation.
  page.on('dialog', (dialog) => dialog.accept());
  await page.evaluate(async () => {
    await window.CommentMasterWorkbench.openFiles([window.__currentPdf]);
    window.__releaseFirstRead();
    await window.__firstOpenPromise;
  });
  await expect(page.locator('#pdf-title')).toHaveText('Current Working PDF.pdf');
  await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');
  await expect(page.locator('#pdf-export-changes')).toContainText('rotation');
  await expect(page.locator('#pdf-page-number')).toHaveText('Page 1 of 3');
});

test('the PDF Export panel fits a 320-pixel phone viewport without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openShell(page);
  await openPdf(page);
  await page.locator('[data-pdf-tab="export"]').click();
  await expect(page.locator('[data-pdf-pane="export"]')).toBeVisible();
  await expect(page.locator('[data-pdf-pane="export"] [data-wb-action="export-pdf"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const panel = await page.locator('[data-pdf-pane="export"]').boundingBox();
  expect(panel.y).toBeLessThan(650);
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(321);
});
