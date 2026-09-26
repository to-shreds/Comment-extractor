import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';

import {
  CANARY_URL,
  JPX_SCAN_TEXT,
  createActiveFormPdf,
  createJpxScanPdf,
  createOrderedPdf
} from '../fixtures/generate-fixtures.mjs';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

let fixtures;

test.beforeAll(async () => {
  const [originalDocx, revisedDocx, privacyDocx, orderedPdf, activePdf, jpxScanPdf] = await Promise.all([
    createDocx('The original browser QA paragraph.'),
    createDocx('The revised browser QA paragraph.'),
    createDocx('A private document link is listed without being contacted.', { externalUrl: CANARY_URL }),
    createOrderedPdf(),
    createActiveFormPdf(),
    createJpxScanPdf()
  ]);

  fixtures = {
    originalDocx: upload('Browser QA Original.docx', DOCX_MIME, originalDocx),
    revisedDocx: upload('Browser QA Revised.docx', DOCX_MIME, revisedDocx),
    privacyDocx: upload('Browser QA Private Link.docx', DOCX_MIME, privacyDocx),
    orderedPdf: upload('Browser QA Pages.pdf', PDF_MIME, orderedPdf),
    activePdf: upload('Browser QA Active.pdf', PDF_MIME, activePdf),
    jpxScanPdf: upload('Browser QA JPEG 2000 Scan.pdf', PDF_MIME, jpxScanPdf)
  };
});

async function openShell(page) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    } catch (_) {
      window.showSaveFilePicker = undefined;
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => (
    window.CommentMasterWorkbench?.version === '7.1.0'
    && typeof window.CommentMasterWord?.openFile === 'function'
  ));
  await expect(page.locator('body')).toHaveAttribute('data-route', 'home');
  await expect(page.locator('#home')).toBeVisible();
}

async function downloadFrom(page, locator) {
  const pending = page.waitForEvent('download');
  await page.locator(locator).click();
  const download = await pending;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  return {
    bytes: await readFile(filePath),
    filename: download.suggestedFilename()
  };
}

async function downloadResult(page) {
  return downloadFrom(page, '#result-download');
}

function upload(name, mimeType, bytes) {
  return {
    name,
    mimeType,
    buffer: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  };
}

async function canvasColorSignature(page) {
  return page.locator('#pdf-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelCount = Math.max(1, pixels.length / 4);
    let blue = 0;
    let dark = 0;
    let nonWhite = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blueChannel = pixels[index + 2];
      if (blueChannel > 120 && blueChannel > red * 1.15 && blueChannel > green * 1.1) blue += 1;
      if (red < 80 && green < 80 && blueChannel < 80) dark += 1;
      if (red < 245 || green < 245 || blueChannel < 245) nonWhite += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      blueRatio: blue / pixelCount,
      darkRatio: dark / pixelCount,
      nonWhiteRatio: nonWhite / pixelCount
    };
  });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function createDocx(bodyText, options = {}) {
  const zip = new JSZip();
  const externalRelationship = options.externalUrl
    ? `<Relationship Id="rIdExternal" Type="${R_NS}/hyperlink" Target="${escapeXml(options.externalUrl)}" TargetMode="External"/>`
    : '';
  const externalParagraph = options.externalUrl
    ? '<w:p><w:hyperlink r:id="rIdExternal"><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Private source link</w:t></w:r></w:hyperlink></w:p>'
    : '';

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
      <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
      <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
    </Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="${PACKAGE_REL_NS}">
      <Relationship Id="rId1" Type="${R_NS}/officeDocument" Target="word/document.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
      <Relationship Id="rId3" Type="${R_NS}/extended-properties" Target="docProps/app.xml"/>
    </Relationships>`;
  const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="${PACKAGE_REL_NS}">
      <Relationship Id="rIdComments" Type="${R_NS}/comments" Target="comments.xml"/>
      ${externalRelationship}
    </Relationships>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>
      <w:p><w:r><w:t>${escapeXml(bodyText)}</w:t></w:r></w:p>
      <w:p>
        <w:commentRangeStart w:id="0"/>
        <w:r><w:t>Stable commented QA paragraph.</w:t></w:r>
        <w:commentRangeEnd w:id="0"/>
        <w:r><w:commentReference w:id="0"/></w:r>
      </w:p>
      <w:p><w:ins w:id="1" w:author="Browser QA" w:date="2024-01-02T03:04:05Z"><w:r><w:t>Tracked QA insertion.</w:t></w:r></w:ins></w:p>
      ${externalParagraph}
      <w:sectPr/>
    </w:body></w:document>`;
  const comments = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:comments xmlns:w="${W_NS}">
      <w:comment w:id="0" w:author="Browser QA" w:initials="BQ" w:date="2024-01-02T03:04:05Z">
        <w:p><w:r><w:t>Generated browser fixture comment.</w:t></w:r></w:p>
      </w:comment>
    </w:comments>`;
  const coreProperties = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <dc:title>Browser QA document</dc:title><dc:creator>Browser QA</dc:creator>
      <cp:lastModifiedBy>Browser QA</cp:lastModifiedBy>
      <dcterms:created xsi:type="dcterms:W3CDTF">2024-01-02T03:04:05Z</dcterms:created>
      <dcterms:modified xsi:type="dcterms:W3CDTF">2024-01-02T03:04:05Z</dcterms:modified>
    </cp:coreProperties>`;
  const appProperties = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
      <Application>Comment Master Browser QA</Application><Pages>1</Pages><Words>12</Words><Paragraphs>3</Paragraphs>
    </Properties>`;

  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRelationships);
  zip.file('word/document.xml', document);
  zip.file('word/comments.xml', comments);
  zip.file('word/_rels/document.xml.rels', documentRelationships);
  zip.file('docProps/core.xml', coreProperties);
  zip.file('docProps/app.xml', appProperties);

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

test.describe('home and navigation', () => {
  test('desktop home presents one obvious file-first workflow', async ({ page }) => {
    await openShell(page);

    await expect(page.getByRole('heading', { name: 'Open a document. We’ll take it from there.' })).toBeVisible();
    await expect(page.locator('#home-drop-zone')).toContainText('Drop files here');
    await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Files stay on this device' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compare / Combine' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More Tools' })).toBeVisible();
    await expect(page.locator('.home-card')).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the More menu keeps secondary destinations out of the main workflow', async ({ page }) => {
    await openShell(page);
    const toggle = page.locator('#nav-toggle');
    const navigation = page.locator('#global-navigation');

    await expect(navigation).toBeHidden();
    await toggle.click();
    await expect(navigation).toBeVisible();

    await navigation.getByRole('button', { name: 'More Tools', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-route', 'tools');
    await expect(page.locator('#tools-workspace')).toBeVisible();
    await expect(page.locator('[data-tool-pane="binder"]')).toBeVisible();

    await toggle.click();
    await navigation.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.locator('#home')).toBeVisible();

    await toggle.click();
    await navigation.getByRole('button', { name: 'Compare & Combine', exact: true }).click();
    await expect(page.locator('#compare-dialog')).toHaveAttribute('open', '');
  });

  test('file staging names every file and offers contextual next steps', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles([fixtures.originalDocx, fixtures.orderedPdf]);

    await expect(page.locator('#home-selection')).toBeVisible();
    await expect(page.locator('#selected-files .selected-file')).toHaveCount(2);
    await expect(page.locator('#selected-files')).toContainText(fixtures.originalDocx.name);
    await expect(page.locator('#selected-files')).toContainText(fixtures.orderedPdf.name);
    await expect(page.locator('#suggestion-actions')).toContainText('Create Binder');
    await expect(page.locator('#suggestion-actions')).toContainText('Batch Tools');
    await expect(page.locator('#suggestion-actions')).toContainText('Convert Files');

    await page.getByRole('button', { name: `Remove ${fixtures.orderedPdf.name}` }).click();
    await expect(page.locator('#home-selection-status')).toContainText('1 file selected');
    await expect(page.locator('#suggestion-actions')).toContainText('Open for Review');
  });
});

test.describe('mobile home', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile home stays focused and navigation opens on demand', async ({ page }) => {
    await openShell(page);

    const toggle = page.locator('#nav-toggle');
    const navigation = page.locator('#global-navigation');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(navigation).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(navigation).toBeVisible();
    await expect(page.locator('#home-drop-zone')).toBeVisible();
    await expect(page.locator('.home-shortcuts')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('document workspaces', () => {
  test('generated DOCX opens in the preserved Word overview and survives route changes', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles(fixtures.originalDocx);

    await expect(page.locator('#workspace')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('body')).toHaveAttribute('data-route', 'word');
    await expect(page.locator('#overview-filename')).toHaveText(fixtures.originalDocx.name);
    await expect(page.locator('[data-tab="overview"]')).toHaveClass(/active/);
    await expect(page.locator('#overview-comments')).toHaveText('1');
    await expect(page.locator('#overview-revisions')).toHaveText('1');
    await expect(page.locator('#file-pill')).toContainText(fixtures.originalDocx.name);

    const navigation = page.locator('#global-navigation');
    await navigation.getByRole('button', { name: 'PDF', exact: true }).click();
    await expect(page.locator('#pdf-empty')).toBeVisible();
    await navigation.getByRole('button', { name: 'Word', exact: true }).click();

    await expect(page.locator('#workspace')).toBeVisible();
    await expect(page.locator('#overview-filename')).toHaveText(fixtures.originalDocx.name);
    await expect(page.locator('[data-tab="overview"]')).toHaveClass(/active/);
  });

  test('generated PDF renders, searches, reorders pages, and summarizes export state', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles(fixtures.orderedPdf);

    await expect(page.locator('#pdf-loaded')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#pdf-title')).toHaveText(fixtures.orderedPdf.name);
    await expect(page.locator('#pdf-page-number')).toHaveText('Page 1 of 3');
    await expect(page.locator('#pdf-page-accessible-text')).toContainText('PAGE ALPHA');
    await expect.poll(() => page.locator('#pdf-canvas').evaluate((canvas) => canvas.width)).toBeGreaterThan(0);

    await page.locator('#pdf-search').fill('PAGE BRAVO');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const searchHit = page.locator('#pdf-search-results [data-search-page="1"]');
    await expect(searchHit).toContainText('Page 2');
    await searchHit.click();
    await expect(page.locator('#pdf-page-number')).toHaveText('Page 2 of 3');

    await page.locator('[data-pdf-tab="pages"]').click();
    await expect(page.locator('#pdf-page-list [data-page-row]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Reverse order' }).click();
    await expect(page.locator('#pdf-page-list [data-page-row]').first()).toContainText('Source page 3');
    await expect(page.locator('#pdf-page-list [data-page-row]').last()).toContainText('Source page 1');
    await expect(page.locator('#pdf-file-pill')).toContainText('unsaved');

    await page.locator('[data-pdf-tab="export"]').click();
    await expect(page.locator('[data-pdf-pane="export"]')).toBeVisible();
    await expect(page.locator('#pdf-export-pages')).toHaveText('3');
    await expect(page.locator('#pdf-export-changes')).toContainText('Page order');
    await expect(page.locator('[data-pdf-pane="export"] [data-wb-action="export-pdf"]')).toBeVisible();
  });

  test('two staged DOCX files prefill the comparison dialog', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles([fixtures.originalDocx, fixtures.revisedDocx]);
    await expect(page.locator('[data-suggestion="compare-documents"]')).toBeVisible();
    await page.locator('[data-suggestion="compare-documents"]').click();

    await expect(page.locator('#compare-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('#compare-panel-documents')).toBeVisible();
    await expect(page.locator('#compare-original-note')).toContainText(fixtures.originalDocx.name);
    await expect(page.locator('#compare-changed-note')).toContainText(fixtures.revisedDocx.name);
    await expect(page.locator('#compare-original-source')).toHaveValue('upload');
    await expect(page.locator('#compare-changed-source')).toHaveValue('upload');
  });

  test('DOCX comparison produces navigable minimal redline views and a valid download', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles([fixtures.originalDocx, fixtures.revisedDocx]);
    await page.locator('[data-suggestion="compare-documents"]').click();
    await page.getByRole('button', { name: 'Create Word redline' }).click();

    await expect(page.locator('#result-dialog')).toHaveAttribute('open', '', { timeout: 30_000 });
    await expect(page.locator('#result-navigation')).toBeVisible();
    await expect(page.locator('#result-change-position')).toContainText(/Change 1 of \d+/);
    await page.locator('#result-next-change').click();
    await expect(page.locator('#result-content .current-change')).toBeFocused();

    await page.locator('[data-result-tab="side-by-side"]').click();
    await expect(page.locator('#result-content .comparison-columns > section')).toHaveCount(2);
    await expect(page.locator('#result-navigation')).toBeHidden();
    await page.locator('[data-result-tab="redline"]').click();
    await expect(page.locator('#result-navigation')).toBeVisible();

    const result = await downloadResult(page);
    expect(result.filename).toMatch(/\(Compare \d+\.\d+\.\d+\)\.docx$/);
    const archive = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
    const documentXml = await archive.file('word/document.xml').async('text');
    expect(documentXml).toMatch(/<w:del\b/);
    expect(documentXml).toMatch(/<w:ins\b/);
    expect(documentXml).toContain('original');
    expect(documentXml).toContain('revised');
  });

  test('staged DOCX is handed directly to Create Clean Copy', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles(fixtures.originalDocx);
    await expect(page.locator('[data-suggestion="clean-word"]')).toBeVisible();
    await page.locator('[data-suggestion="clean-word"]').click();

    await expect(page.locator('body')).toHaveAttribute('data-route', 'tools');
    await expect(page.locator('[data-tool-pane="clean-word"]')).toBeVisible();
    await expect(page.locator('#clean-word-source')).toContainText(fixtures.originalDocx.name);
    await expect(page.locator('#clean-word-preview')).toContainText('Planned cleanup');
  });
});

test.describe('generated output smoke flows', () => {
  test('JPEG 2000 scan renders visibly and remains visible after local OCR', async ({ page }) => {
    test.setTimeout(180_000);
    await openShell(page);

    await page.locator('#workbench-file-input').setInputFiles(fixtures.jpxScanPdf);
    await expect(page.locator('#pdf-loaded')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#pdf-scan-suggestion')).toBeVisible();
    const beforeOcr = await canvasColorSignature(page);
    expect(beforeOcr.width).toBeGreaterThan(0);
    expect(beforeOcr.height).toBeGreaterThan(0);
    expect(beforeOcr.blueRatio).toBeGreaterThan(.05);
    expect(beforeOcr.darkRatio).toBeGreaterThan(.01);
    expect(beforeOcr.nonWhiteRatio).toBeGreaterThan(.1);
    await page.locator('[data-pdf-tab="ocr"]').click();
    await page.locator('[data-wb-action="pdf-ocr"]').click();

    await expect(page.locator('#pdf-action-status')).toContainText('OCR completed for 1 page', { timeout: 150_000 });
    await expect(page.locator('#pdf-page-accessible-text')).toContainText(/JPX\s+OCR\s+TEST\s+742/i);
    const recognizedText = (await page.locator('#pdf-page-accessible-text').textContent() || '').replace(/\s+/g, ' ').trim();
    expect(recognizedText).toContain(JPX_SCAN_TEXT);
    const afterOcr = await canvasColorSignature(page);
    expect(afterOcr.blueRatio).toBeGreaterThan(.05);
    expect(afterOcr.darkRatio).toBeGreaterThan(.01);
    expect(afterOcr.nonWhiteRatio).toBeGreaterThan(.1);
    expect(Math.abs(afterOcr.blueRatio - beforeOcr.blueRatio)).toBeLessThan(.02);
    await page.locator('#pdf-search').fill('OCR TEST');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.locator('#pdf-search-results')).toContainText('Page 1');
  });

  test('secure redaction downloads a fully rasterized PDF without the approved text', async ({ page }) => {
    test.setTimeout(120_000);
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles(fixtures.orderedPdf);
    await expect(page.locator('#pdf-loaded')).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-pdf-tab="redact"]').click();
    await page.locator('#redaction-search').fill('PAGE ALPHA');
    await page.locator('[data-wb-action="redaction-find"]').click();
    await expect(page.locator('#redaction-list')).toContainText('PAGE ALPHA');
    await page.locator('[data-wb-action="redaction-apply"]').click();

    await expect(page.locator('#result-dialog')).toHaveAttribute('open', '', { timeout: 90_000 });
    await expect(page.locator('#result-content')).toContainText('Automated text and raw-stream checks found none');
    const result = await downloadResult(page);
    expect(result.filename).toMatch(/\(Redacted \d+\.\d+\.\d+\)\.pdf$/);
    const document = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(document.getPageCount()).toBe(3);
    expect(document.getForm().getFields()).toHaveLength(0);
    for (const outputPage of document.getPages()) {
      const resources = outputPage.node.lookup(PDFName.of('Resources'), PDFDict);
      const xObjects = resources.lookup(PDFName.of('XObject'), PDFDict);
      expect(xObjects.keys().length).toBeGreaterThan(0);
    }
  });

  test('maximum PDF sanitization downloads a passive flattened artifact', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles(fixtures.activePdf);
    await expect(page.locator('#pdf-loaded')).toBeVisible({ timeout: 30_000 });

    await page.locator('#toggle-pdf-more').click();
    await page.locator('[data-pdf-tab="clean"]').click();
    await page.locator('#sanitize-preset').selectOption('maximum');
    await expect(page.locator('#sanitize-form-values')).toBeChecked();
    await page.locator('[data-wb-action="pdf-sanitize"]').click();
    await expect(page.locator('#result-dialog')).toHaveAttribute('open', '', { timeout: 60_000 });
    await expect(page.locator('#result-content')).toContainText('Sanitized copy ready');

    const result = await downloadResult(page);
    expect(result.filename).toMatch(/\(Sanitized \d+\.\d+\.\d+\)\.pdf$/);
    const document = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(document.getPageCount()).toBe(2);
    expect(document.getForm().getFields()).toHaveLength(0);
    expect(document.getTitle() || '').toBe('');
    expect(document.getAuthor() || '').toBe('');
    expect(document.catalog.has(PDFName.of('OpenAction'))).toBe(false);
    expect(document.catalog.has(PDFName.of('AA'))).toBe(false);
    const names = document.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    expect(Boolean(names?.has(PDFName.of('EmbeddedFiles')))).toBe(false);
    expect(Boolean(names?.has(PDFName.of('JavaScript')))).toBe(false);
    document.getPages().forEach((outputPage) => {
      expect(outputPage.node.has(PDFName.of('AA'))).toBe(false);
      expect(outputPage.node.has(PDFName.of('Annots'))).toBe(false);
    });
  });

  test('binder combines PDF and TXT sources into a parsed four-page PDF', async ({ page }) => {
    await openShell(page);
    const textSource = upload('Binder Note.txt', 'text/plain', Buffer.from('BINDER_TEXT_SENTINEL_742'));
    await page.locator('#workbench-file-input').setInputFiles([fixtures.orderedPdf, textSource]);
    await page.locator('[data-suggestion="binder"]').click();
    await expect(page.locator('#binder-queue [data-queue-row]')).toHaveCount(2);
    for (const option of ['#binder-dividers', '#binder-labels', '#binder-page-numbers', '#binder-toc']) {
      await page.locator(option).setChecked(false);
    }

    await page.locator('[data-wb-action="binder-build"]').click();
    await expect(page.locator('#result-dialog')).toHaveAttribute('open', '', { timeout: 60_000 });
    await expect(page.locator('#result-content')).toContainText('2 source files produced a 4-page binder');
    const result = await downloadResult(page);
    const document = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(document.getPageCount()).toBe(4);
    expect(document.catalog.has(PDFName.of('Outlines'))).toBe(true);
  });

  test('TXT conversion downloads a valid one-page PDF', async ({ page }) => {
    await openShell(page);
    const textSource = upload('Local Conversion.txt', 'text/plain', Buffer.from('LOCAL_CONVERSION_SENTINEL_742'));
    await page.locator('#workbench-file-input').setInputFiles(textSource);
    await page.locator('[data-suggestion="convert"]').click();
    await expect(page.locator('#convert-queue [data-queue-row]')).toHaveCount(1);
    await page.locator('#convert-output').selectOption('pdf');
    await page.locator('[data-wb-action="convert-run"]').click();
    await expect(page.locator('#result-dialog')).toHaveAttribute('open', '', { timeout: 30_000 });

    const result = await downloadResult(page);
    expect(result.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(result.filename).toMatch(/\(Converted \d+\.\d+\.\d+\)\.pdf$/);
    const document = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(document.getPageCount()).toBe(1);
  });

  test('batch inspect packages parsed PDF and DOCX health reports', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles([fixtures.orderedPdf, fixtures.originalDocx]);
    await page.locator('[data-suggestion="batch"]').click();
    await expect(page.locator('#batch-queue [data-queue-row]')).toHaveCount(2);
    await page.locator('#batch-operation').selectOption('inspect');
    await page.locator('[data-wb-action="batch-run"]').click();

    await expect.poll(async () => page.locator('#batch-queue [data-queue-row]').evaluateAll((rows) => (
      rows.filter((row) => /Complete/.test(row.textContent || '')).length
    )), { timeout: 60_000 }).toBe(2);
    await expect(page.locator('#batch-download-zip')).toBeEnabled();
    await expect(page.locator('#status')).toContainText('2 of 2 batch items completed');
    const result = await downloadFrom(page, '#batch-download-zip');
    const archive = await JSZip.loadAsync(result.bytes);
    const reports = await Promise.all(Object.values(archive.files)
      .filter((entry) => !entry.dir && entry.name.endsWith('.json'))
      .map(async (entry) => JSON.parse(await entry.async('text'))));
    expect(reports).toHaveLength(2);
    const pdfReport = reports.find((report) => report.format === 'pdf');
    const docxReport = reports.find((report) => report.format === 'docx');
    expect(pdfReport.structure.pageCount).toBe(3);
    expect(docxReport.docx.comments).toBe(1);
    expect(docxReport.docx.revisions).toBe(1);
  });

  test('Clean Word downloads a package with accepted changes and removed review data', async ({ page }) => {
    await openShell(page);
    await page.locator('#workbench-file-input').setInputFiles(fixtures.originalDocx);
    await page.locator('[data-suggestion="clean-word"]').click();
    await expect(page.locator('#clean-word-preview')).toContainText('Planned cleanup');
    await page.locator('[data-wb-action="clean-word-run"]').click();
    await expect(page.locator('#result-dialog')).toHaveAttribute('open', '', { timeout: 30_000 });
    await expect(page.locator('#result-content')).toContainText('Clean Word copy ready');

    const result = await downloadResult(page);
    expect(result.filename).toMatch(/\(Clean \d+\.\d+\.\d+\)\.docx$/);
    const archive = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
    expect(archive.file('word/comments.xml')).toBeNull();
    const documentXml = await archive.file('word/document.xml').async('text');
    expect(documentXml).toContain('Tracked QA insertion.');
    expect(documentXml).not.toMatch(/<w:(?:ins|commentRangeStart|commentRangeEnd|commentReference)\b/);
    const coreXml = await archive.file('docProps/core.xml').async('text');
    expect(coreXml).toMatch(/<dc:creator(?:\s*\/|><\/dc:creator)>/);
  });
});

test.describe('privacy and offline behavior', () => {
  test('opening documents never turns embedded links into network egress', async ({ page, context }) => {
    await openShell(page);
    const shellOrigin = new URL(page.url()).origin;
    const externalRequests = [];

    await context.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.protocol.startsWith('http') && requestUrl.origin !== shellOrigin) {
        externalRequests.push(requestUrl.href);
        await route.abort('blockedbyclient');
      } else {
        await route.continue();
      }
    });

    await page.locator('#workbench-file-input').setInputFiles(fixtures.privacyDocx);
    await expect(page.locator('#workspace')).toBeVisible({ timeout: 30_000 });
    await page.locator('#toggle-advanced').click();
    await page.locator('[data-tab="relationships"]').click();
    await expect(page.locator('#rel-body')).toContainText(CANARY_URL);

    await page.locator('#workbench-file-input').setInputFiles(fixtures.activePdf);
    await expect(page.locator('#pdf-page-accessible-text')).toContainText('Synthetic form', { timeout: 30_000 });
    await page.waitForTimeout(300);

    expect(externalRequests).toEqual([]);
    const resourceOrigins = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => {
      try { return new URL(entry.name).origin; } catch { return ''; }
    }).filter(Boolean));
    expect(resourceOrigins.filter((origin) => origin !== shellOrigin)).toEqual([]);
  });

  test('hostile imported HTML never requests remote images, links, or styles', async ({ page, context }) => {
    await openShell(page);
    const shellOrigin = new URL(page.url()).origin;
    const remoteBase = 'https://hostile-html-canary.invalid';
    const externalRequests = [];
    await context.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.protocol.startsWith('http') && requestUrl.origin !== shellOrigin) {
        externalRequests.push(requestUrl.href);
        await route.abort('blockedbyclient');
      } else await route.continue();
    });

    const hostileHtml = `<!doctype html>
      <link rel="stylesheet" href="${remoteBase}/style.css">
      <style>@import url('${remoteBase}/import.css');</style>
      <img src="${remoteBase}/pixel.png" srcset="${remoteBase}/pixel-2x.png 2x">
      <a href="${remoteBase}/clicked">Visible local conversion text</a>`;
    await page.locator('#workbench-file-input').setInputFiles({
      name: 'Hostile Imported HTML.html',
      mimeType: 'text/html',
      buffer: Buffer.from(hostileHtml)
    });
    await page.locator('[data-suggestion="convert"]').click();
    await expect(page.locator('[data-tool-pane="convert"]')).toBeVisible();
    await page.locator('#convert-output').selectOption('txt');
    await page.locator('[data-wb-action="convert-run"]').click();
    await expect(page.locator('#result-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('#result-content')).toContainText('Conversion ready');
    await page.waitForTimeout(250);

    expect(externalRequests).toEqual([]);
    const remoteEntries = await page.evaluate((origin) => performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(origin)), remoteBase);
    expect(remoteEntries).toEqual([]);
  });

  test('service worker caches only its manifest allowlist and reloads the shell offline', async ({ page, context }) => {
    await openShell(page);
    const supported = await page.evaluate(() => 'serviceWorker' in navigator && 'caches' in window);
    test.skip(!supported, 'This browser context does not support service workers and Cache Storage.');

    await page.evaluate(async () => navigator.serviceWorker.ready);
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
      await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await page.waitForFunction(() => window.CommentMasterWorkbench?.version === '7.1.0');
    }

    const cacheReport = await page.evaluate(async () => {
      const manifestResponse = await fetch('./asset-manifest.json', { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error(`Asset manifest returned ${manifestResponse.status}.`);
      const manifest = await manifestResponse.json();
      const allowlist = new Set([
        ...(manifest.coreAssets || []),
        ...Object.values(manifest.optionalAssets || {}).flat()
      ].map((asset) => new URL(asset, document.baseURI).href));
      const cacheNames = (await caches.keys()).filter((name) => name.startsWith('comment-master-'));
      const cachedUrls = [];
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        cachedUrls.push(...(await cache.keys()).map((request) => request.url));
      }
      return {
        cacheNames,
        cachedUrls,
        unexpected: cachedUrls.filter((url) => !allowlist.has(url))
      };
    });

    expect(cacheReport.cacheNames.some((name) => name.startsWith('comment-master-core-'))).toBe(true);
    expect(cacheReport.cachedUrls.length).toBeGreaterThan(0);
    expect(cacheReport.unexpected).toEqual([]);

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.CommentMasterWorkbench?.version === '7.1.0');
      await expect(page.locator('#home')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Open a document. We’ll take it from there.' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
