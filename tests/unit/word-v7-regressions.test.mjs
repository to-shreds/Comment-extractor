import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { DOMParser, XMLSerializer, Element, Document, Node } = require('@xmldom/xmldom');

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function scriptContaining(text) {
  const script = scripts.find((candidate) => candidate.includes(text));
  assert.ok(script, `Missing inline script containing ${text}`);
  return script;
}

function installDomCompatibility() {
  if (!Object.getOwnPropertyDescriptor(Element.prototype, 'children')) {
    Object.defineProperty(Element.prototype, 'children', {
      get() {
        return Array.from(this.childNodes || []).filter((node) => node.nodeType === 1);
      }
    });
  }
  if (!Object.getOwnPropertyDescriptor(Element.prototype, 'parentElement')) {
    Object.defineProperty(Element.prototype, 'parentElement', {
      get() {
        return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
      }
    });
  }
  if (!Document.prototype.createTreeWalker) {
    Document.prototype.createTreeWalker = function createTreeWalker(rootNode) {
      const nodes = [];
      (function visit(node) {
        Array.from(node.childNodes || []).forEach((child) => {
          if (child.nodeType === 1) {
            nodes.push(child);
            visit(child);
          }
        });
      })(rootNode);
      let index = 0;
      return { nextNode: () => nodes[index++] || null };
    };
  }
}

function loadApplicationHelpers() {
  installDomCompatibility();

  const zipContext = {
    window: {}, setImmediate, clearImmediate, setTimeout, clearTimeout,
    Promise, Uint8Array, ArrayBuffer, Blob
  };
  vm.runInNewContext(scripts[0], zipContext);
  const JSZip = zipContext.window.JSZip;
  assert.ok(JSZip, 'Embedded JSZip did not load');

  let application = scriptContaining("const VERSION = '7.1.0'");
  const marker = "window.addEventListener('DOMContentLoaded', init, { once: true });";
  assert.ok(application.includes(marker), 'Application test-hook marker is missing');
  application = application.replace(marker, `
    window.__CM_WORD_V7_REGRESSION_HELPERS__ = Object.freeze({
      acceptTrackedChanges,
      buildComparisonOutput,
      comparisonFilename,
      editedDocumentFilename,
      probeExternalUrl,
      stageComparisonStateForTest: () => {
        comparisonState.preparedOriginal = { name: 'Original.docx' };
        comparisonState.preparedChanged = { name: 'Changed.docx' };
        comparisonState.preparedBase = { name: 'Base.docx' };
        comparisonState.reviews = [{ id: '1', type: 'file', name: 'Review.docx' }];
      },
      comparisonStateSnapshot: () => ({
        preparedOriginal: comparisonState.preparedOriginal,
        preparedChanged: comparisonState.preparedChanged,
        preparedBase: comparisonState.preparedBase,
        reviews: comparisonState.reviews.slice(),
        nextReviewId: comparisonState.nextReviewId
      })
    });
    ${marker}`);

  let fetchCalls = 0;
  const windowObject = { JSZip, addEventListener() {} };
  const context = {
    window: windowObject,
    JSZip,
    location: { hash: '' },
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    DOMParser,
    XMLSerializer,
    Blob,
    Node,
    fetch() {
      fetchCalls += 1;
      throw new Error('Production link checking attempted a network request');
    }
  };
  vm.runInNewContext(application, context);
  return {
    helpers: windowObject.__CM_WORD_V7_REGRESSION_HELPERS__,
    wordApi: windowObject.CommentMasterWord,
    JSZip,
    fetchCallCount: () => fetchCalls,
    application
  };
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

function headerXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${W}" xmlns:r="${R}">${body}</w:hdr>`;
}

function paragraph(text, paragraphProperties = '') {
  const properties = paragraphProperties ? `<w:pPr>${paragraphProperties}</w:pPr>` : '';
  return `<w:p>${properties}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function hyperlinkParagraph(text, relationshipId = 'rId9') {
  return `<w:p><w:hyperlink r:id="${relationshipId}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink></w:p>`;
}

function drawingParagraph() {
  return `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="urn:test:drawing"/></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function makeCandidate(JSZip, name, storyXml) {
  assert.ok(storyXml['word/document.xml'], 'A candidate requires word/document.xml');
  const overrides = Object.keys(storyXml).map((part) => {
    const contentType = part === 'word/document.xml'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
    return `<Override PartName="/${part}" ContentType="${contentType}"/>`;
  }).join('');
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`;
  const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_REL}"/>`;
  const packageParts = {
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rootRelationships,
    'word/_rels/document.xml.rels': documentRelationships,
    ...storyXml
  };

  const zip = new JSZip();
  Object.entries(packageParts).forEach(([part, xml]) => zip.file(part, xml));
  const originalBytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  const xmlDocs = new Map(Object.entries(packageParts).map(([part, xml]) => [part, parseXml(xml)]));
  const entryNames = Object.keys(packageParts);

  return {
    originalBytes,
    fileName: name,
    baseName: name.replace(/\.docx$/i, ''),
    xmlDocs,
    xmlText: new Map(Object.entries(packageParts)),
    modifiedParts: new Set(),
    parts: Object.keys(storyXml),
    storyParts: Object.keys(storyXml),
    commentParts: [],
    items: [],
    itemByUid: new Map(),
    metadata: {},
    stats: {},
    relationships: [],
    externalLinks: [],
    findings: [],
    wNs: W,
    strict: false,
    mainPart: 'word/document.xml',
    entryNames,
    entryNameSet: new Set(entryNames)
  };
}

function directWordChild(element, localName) {
  return Array.from(element.children || []).find((child) => child.namespaceURI === W && child.localName === localName) || null;
}

const runtime = loadApplicationHelpers();

test('paragraph-formatting-only changes produce w:pPrChange', async () => {
  const base = await makeCandidate(runtime.JSZip, 'Formatting.docx', {
    'word/document.xml': documentXml(paragraph('Same wording', '<w:jc w:val="left"/>'))
  });
  const reviewed = await makeCandidate(runtime.JSZip, 'Formatting reviewed.docx', {
    'word/document.xml': documentXml(paragraph('Same wording', '<w:jc w:val="right"/>'))
  });

  const result = await runtime.helpers.buildComparisonOutput(base, [
    { candidate: reviewed, author: 'Format Reviewer', sourceName: reviewed.fileName }
  ]);
  const output = await runtime.JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const outputDocument = parseXml(await output.file('word/document.xml').async('string'));
  const changes = Array.from(outputDocument.getElementsByTagNameNS(W, 'pPrChange'));

  assert.equal(result.stats.changedParagraphs, 1);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].getAttributeNS(W, 'author'), 'Format Reviewer');
  const paragraphNode = outputDocument.getElementsByTagNameNS(W, 'p')[0];
  const currentProperties = directWordChild(paragraphNode, 'pPr');
  const currentJustification = directWordChild(currentProperties, 'jc');
  const priorProperties = changes[0].getElementsByTagNameNS(W, 'pPr')[0];
  const priorJustification = directWordChild(priorProperties, 'jc');
  assert.equal(currentJustification.getAttributeNS(W, 'val'), 'right');
  assert.equal(priorJustification.getAttributeNS(W, 'val'), 'left');
});

test('identical formatting proposals share one minimal pPrChange', async () => {
  const base = await makeCandidate(runtime.JSZip, 'Formatting base.docx', {
    'word/document.xml': documentXml(paragraph('Same wording', '<w:jc w:val="left"/>'))
  });
  const first = await makeCandidate(runtime.JSZip, 'Formatting first.docx', {
    'word/document.xml': documentXml(paragraph('Same wording', '<w:jc w:val="right"/>'))
  });
  const second = await makeCandidate(runtime.JSZip, 'Formatting second.docx', {
    'word/document.xml': documentXml(paragraph('Same wording', '<w:jc w:val="right"/>'))
  });

  const result = await runtime.helpers.buildComparisonOutput(base, [
    { candidate: first, author: 'Alpha Reviewer', sourceName: first.fileName },
    { candidate: second, author: 'Beta Reviewer', sourceName: second.fileName }
  ]);
  const output = await runtime.JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const outputDocument = parseXml(await output.file('word/document.xml').async('string'));
  const changes = Array.from(outputDocument.getElementsByTagNameNS(W, 'pPrChange'));

  assert.equal(changes.length, 1);
  assert.equal(changes[0].getAttributeNS(W, 'author'), 'Alpha Reviewer; Beta Reviewer');
  assert.equal(outputDocument.getElementsByTagNameNS(W, 'ins').length, 0);
  assert.equal(outputDocument.getElementsByTagNameNS(W, 'del').length, 0);
  assert.equal(result.stats.changedParagraphs, 1);
  assert.equal(result.stats.formatChangedParagraphs, 1);
});

test('changed or inserted complex paragraphs fail closed instead of flattening content', async () => {
  const linkedBase = await makeCandidate(runtime.JSZip, 'Linked base.docx', {
    'word/document.xml': documentXml(hyperlinkParagraph('Keep this linked clause'))
  });
  const linkedReview = await makeCandidate(runtime.JSZip, 'Linked review.docx', {
    'word/document.xml': documentXml(hyperlinkParagraph('Change this linked clause'))
  });
  await assert.rejects(
    runtime.helpers.buildComparisonOutput(linkedBase, [{ candidate: linkedReview, author: 'Reviewer', sourceName: linkedReview.fileName }]),
    /structurally complex paragraph.*cannot be redlined safely/i
  );

  const drawingBase = await makeCandidate(runtime.JSZip, 'Drawing base.docx', {
    'word/document.xml': documentXml(paragraph('Existing text'))
  });
  const drawingReview = await makeCandidate(runtime.JSZip, 'Drawing review.docx', {
    'word/document.xml': documentXml(`${paragraph('Existing text')}${drawingParagraph()}`)
  });
  await assert.rejects(
    runtime.helpers.buildComparisonOutput(drawingBase, [{ candidate: drawingReview, author: 'Reviewer', sourceName: drawingReview.fileName }]),
    /structurally complex paragraph was inserted.*cannot be redlined safely/i
  );
});

test('comparison output returns paragraph-aligned preview rows', async () => {
  const base = await makeCandidate(runtime.JSZip, 'Preview base.docx', {
    'word/document.xml': documentXml(`${paragraph('Opening')}${paragraph('Closing')}`)
  });
  const reviewed = await makeCandidate(runtime.JSZip, 'Preview reviewed.docx', {
    'word/document.xml': documentXml(`${paragraph('Opening')}${paragraph('Inserted')}${paragraph('Closing')}`)
  });
  const result = await runtime.helpers.buildComparisonOutput(base, [
    { candidate: reviewed, author: 'Reviewer', sourceName: reviewed.fileName }
  ]);

  assert.deepEqual(Array.from(result.preview.original), ['Opening', '', 'Closing']);
  assert.deepEqual(Array.from(result.preview.revised), ['Opening', 'Inserted', 'Closing']);
  assert.deepEqual(Array.from(result.preview.rows, (row) => row.type), ['equal', 'insert', 'equal']);
  assert.equal(result.stats.insertedParagraphs, 1);
});

test('an absent reviewed story part does not delete the base story', async () => {
  const baseHeader = headerXml(paragraph('Keep the base header'));
  const base = await makeCandidate(runtime.JSZip, 'Base.docx', {
    'word/document.xml': documentXml(paragraph('Main body')),
    'word/header1.xml': baseHeader
  });
  const reviewed = await makeCandidate(runtime.JSZip, 'Reviewed.docx', {
    'word/document.xml': documentXml(paragraph('Main body'))
  });

  const result = await runtime.helpers.buildComparisonOutput(base, [
    { candidate: reviewed, author: 'Reviewer', sourceName: reviewed.fileName }
  ]);
  const output = await runtime.JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const header = await output.file('word/header1.xml').async('string');

  assert.equal(result.stats.deletedParagraphs, 0);
  assert.equal(result.stats.changedParagraphs, 0);
  assert.equal(header, baseHeader);
  assert.doesNotMatch(header, /<w:del\b/);
  assert.ok(!base.modifiedParts.has('word/header1.xml'));
});

test('tracked-change acceptance removes cell revisions and range markers', () => {
  const rangeMarkers = [
    'moveFromRangeStart', 'moveFromRangeEnd', 'moveToRangeStart', 'moveToRangeEnd',
    'customXmlInsRangeStart', 'customXmlInsRangeEnd', 'customXmlDelRangeStart', 'customXmlDelRangeEnd',
    'customXmlMoveFromRangeStart', 'customXmlMoveFromRangeEnd',
    'customXmlMoveToRangeStart', 'customXmlMoveToRangeEnd'
  ];
  const markers = rangeMarkers.map((local, index) => `<w:${local} w:id="${index + 10}"/>`).join('');
  const xml = documentXml(`
    <w:tbl><w:tr>
      <w:tc><w:tcPr><w:cellDel w:id="1" w:author="Old"/></w:tcPr><w:p><w:r><w:t>Delete cell</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:cellIns w:id="2" w:author="Old"/><w:cellMerge w:id="3" w:author="Old"/></w:tcPr><w:p>${markers}<w:r><w:t>Keep cell</w:t></w:r></w:p></w:tc>
    </w:tr></w:tbl>`);
  const document = parseXml(xml);

  assert.equal(runtime.helpers.acceptTrackedChanges(document, { wNs: W }), true);
  assert.equal(document.getElementsByTagNameNS(W, 'tc').length, 1);
  assert.equal(document.getElementsByTagNameNS(W, 'cellDel').length, 0);
  assert.equal(document.getElementsByTagNameNS(W, 'cellIns').length, 0);
  assert.equal(document.getElementsByTagNameNS(W, 'cellMerge').length, 0);
  rangeMarkers.forEach((local) => assert.equal(document.getElementsByTagNameNS(W, local).length, 0, `${local} was not accepted`));
  assert.match(new XMLSerializer().serializeToString(document), /Keep cell/);
  assert.doesNotMatch(new XMLSerializer().serializeToString(document), /Delete cell/);
});

test('link privacy code performs no production network fetch', async () => {
  const start = runtime.application.indexOf('function cancelExternalLinkChecks');
  const end = runtime.application.indexOf('let linkRenderQueued', start);
  assert.ok(start >= 0 && end > start, 'Could not isolate the link-checking implementation');
  const linkCheckingSource = runtime.application.slice(start, end);

  assert.doesNotMatch(linkCheckingSource, /\bfetch\s*\(/);
  assert.doesNotMatch(linkCheckingSource, /\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b/);
  const result = await runtime.helpers.probeExternalUrl('https://example.com/document-link');
  assert.equal(result.status, 'listed');
  assert.equal(result.detail, 'Valid web address; not contacted');
  assert.equal(result.httpStatus, null);
  assert.equal(runtime.fetchCallCount(), 0);
});

test('Word output filenames retain the exact local-date convention', () => {
  const date = new Date(2026, 8, 1, 12, 0, 0);
  assert.equal(runtime.helpers.editedDocumentFilename('My Original File.docx', date), 'My Original File (Edit 1.9.26).docx');
  assert.equal(runtime.helpers.editedDocumentFilename('Case Notes.DOCX', date), 'Case Notes (Edit 1.9.26).DOCX');
  assert.equal(runtime.helpers.comparisonFilename('Agreement.docx', 'Compare', date), 'Agreement (Compare 1.9.26).docx');
  assert.equal(runtime.helpers.comparisonFilename('Policy.DOCX', 'Combined Commentary', date), 'Policy (Combined Commentary 1.9.26).DOCX');

  const longName = `${'A'.repeat(175)}.docx`;
  const bounded = runtime.helpers.comparisonFilename(longName, 'Compare', date);
  assert.ok(bounded.length <= 180);
  assert.match(bounded, / \(Compare 1\.9\.26\)\.docx$/);
});

test('CommentMasterWord clears all prepared comparison state', () => {
  runtime.helpers.stageComparisonStateForTest();
  assert.equal(runtime.wordApi.hasComparisonState(), true);

  runtime.wordApi.clearComparisonState();
  const snapshot = runtime.helpers.comparisonStateSnapshot();
  assert.equal(runtime.wordApi.hasComparisonState(), false);
  assert.equal(snapshot.preparedOriginal, null);
  assert.equal(snapshot.preparedChanged, null);
  assert.equal(snapshot.preparedBase, null);
  assert.equal(snapshot.reviews.length, 0);
  assert.equal(snapshot.nextReviewId, 1);
});
