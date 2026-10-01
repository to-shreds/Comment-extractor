'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let xmlDom;
try {
  xmlDom = require('@xmldom/xmldom');
} catch (error) {
  if (!process.env.CM_XMLDOM_PATH) {
    throw new Error('Install test dependencies with `npm install`, or set CM_XMLDOM_PATH to an @xmldom/xmldom checkout.', { cause: error });
  }
  xmlDom = require(process.env.CM_XMLDOM_PATH);
}
const { DOMParser, XMLSerializer, Element, Document, Node } = xmlDom;

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W_STRICT = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function scriptContaining(text) {
  const script = scripts.find((candidate) => candidate.includes(text));
  assert.ok(script, `Missing script containing ${text}`);
  return script;
}

function installDomCompatibility() {
  if (!Object.getOwnPropertyDescriptor(Element.prototype, 'children')) {
    Object.defineProperty(Element.prototype, 'children', { get() { return Array.from(this.childNodes || []).filter((node) => node.nodeType === 1); } });
  }
  if (!Object.getOwnPropertyDescriptor(Element.prototype, 'parentElement')) {
    Object.defineProperty(Element.prototype, 'parentElement', { get() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; } });
  }
  if (!Document.prototype.createTreeWalker) {
    Document.prototype.createTreeWalker = function createTreeWalker(rootNode) {
      const nodes = [];
      (function visit(node) {
        Array.from(node.childNodes || []).forEach((child) => {
          if (child.nodeType === 1) { nodes.push(child); visit(child); }
        });
      })(rootNode);
      let index = 0;
      return { nextNode() { return nodes[index++] || null; } };
    };
  }
}

function testStaticContract() {
  scripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `Script ${index + 1} has invalid JavaScript`));
  assert.match(html, /<title>Comment Master v7\.1\.1<\/title>/);
  assert.match(html, /data-action="openCompare"/);
  assert.match(html, /data-action="compareDocuments"/);
  assert.match(html, /data-action="compareText"/);
  assert.match(html, /data-action="combineCommentary"/);
  assert.match(html, /id="compare-text-original"[^>]*contenteditable="true"/);
  assert.match(html, /id="combine-review-files"[^>]*multiple/);
  assert.match(html, /Existing tracked changes are treated as accepted text/);

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  assert.deepEqual(duplicateIds, []);
  const collected = [...html.matchAll(/\bid\('([^']+)'\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(collected.filter((id) => !ids.includes(id)))], []);

  const actionMap = scriptContaining('async function runAction').match(/const actions = \{([\s\S]*?)\n    \};/)[1];
  const actions = [...new Set([...html.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]))];
  const missing = actions.filter((action) => !new RegExp(`(?:^|[,{\\s])${action}(?:\\s*[:,}]|\\s*$)`, 'm').test(actionMap));
  assert.deepEqual(missing, [], `Unmapped UI actions: ${missing.join(', ')}`);
}

function loadHelpers() {
  installDomCompatibility();
  const zipContext = { window: {}, setImmediate, clearImmediate, setTimeout, clearTimeout, Promise, Uint8Array, ArrayBuffer, Blob };
  vm.runInNewContext(scripts[0], zipContext);
  const JSZip = zipContext.window.JSZip;
  assert.ok(JSZip);

  let application = scriptContaining("const VERSION = '7.1.1'");
  const marker = "window.addEventListener('DOMContentLoaded', init, { once: true });";
  application = application.replace(marker, `
    window.__CM_V63_HELPERS__ = Object.freeze({
      sequenceOpcodes, tokenizeCompareText, tokenDiffScript, alignParagraphs,
      buildComparisonOutput, comparisonFilename, editDateStamp
    });
    ${marker}`);
  const windowObject = { JSZip, addEventListener() {} };
  const context = {
    window: windowObject, JSZip, location: { hash: '' }, URL, AbortController,
    setTimeout, clearTimeout, console, DOMParser, XMLSerializer, Blob, Node
  };
  vm.runInNewContext(application, context);
  return { helpers: windowObject.__CM_V63_HELPERS__, JSZip };
}

function paragraph(text, options = {}) {
  const rPr = options.bold ? '<w:rPr><w:b/></w:rPr>' : '';
  const content = `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  if (options.comment) {
    return `<w:p><w:commentRangeStart w:id="0"/>${content}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`;
  }
  if (options.complex) {
    return `<w:p><w:hyperlink r:id="rId9">${content}</w:hyperlink></w:p>`;
  }
  return `<w:p>${content}</w:p>`;
}

function documentXml(paragraphs, namespace = W) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${namespace}" xmlns:r="${R}"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`;
}

function commentsXml(text, author = 'Reviewer') {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="${escapeXml(author)}" w:date="2026-09-01T14:00:00Z"><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:comment></w:comments>`;
}

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function preserveOutput(name, blob) {
  if (!process.env.CM_COMPARE_OUTPUT_DIR) return;
  fs.mkdirSync(process.env.CM_COMPARE_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.CM_COMPARE_OUTPUT_DIR, name), Buffer.from(await blob.arrayBuffer()));
}

async function makeCandidate(JSZip, name, docXml, options = {}) {
  const namespace = options.namespace || W;
  const commentsOverride = options.comments ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>' : '';
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${commentsOverride}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`;
  const commentsRelationship = options.comments ? `<Relationship Id="rIdComments" Type="${R}/comments" Target="comments.xml"/>` : '';
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${commentsRelationship}</Relationships>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', documentRels);
  zip.file('customXml/item1.xml', '<root><preserve>unchanged</preserve></root>');
  zip.file('word/media/preserve.bin', new Uint8Array([0, 1, 2, 3, 254, 255]));
  if (options.comments) zip.file('word/comments.xml', options.comments);
  const originalBytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
  const xmlDocs = new Map([
    ['[Content_Types].xml', parse(contentTypes)],
    ['_rels/.rels', parse(rootRels)],
    ['word/document.xml', parse(docXml)],
    ['word/_rels/document.xml.rels', parse(documentRels)],
    ['customXml/item1.xml', parse('<root><preserve>unchanged</preserve></root>')]
  ]);
  const xmlText = new Map([...xmlDocs].map(([part, doc]) => [part, new XMLSerializer().serializeToString(doc)]));
  const entryNames = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'customXml/item1.xml', 'word/media/preserve.bin'];
  const candidate = {
    originalBytes, fileName: name, baseName: name.replace(/\.docx$/i, ''), xmlDocs, xmlText,
    modifiedParts: new Set(), parts: ['word/document.xml'], storyParts: ['word/document.xml'],
    commentParts: [], items: [], itemByUid: new Map(), metadata: {}, stats: {}, relationships: [], externalLinks: [], findings: [],
    wNs: namespace, strict: namespace === W_STRICT, mainPart: 'word/document.xml', entryNames, entryNameSet: new Set(entryNames)
  };
  if (options.comments) {
    const commentDoc = parse(options.comments);
    candidate.xmlDocs.set('word/comments.xml', commentDoc);
    candidate.xmlText.set('word/comments.xml', options.comments);
    candidate.commentParts.push('word/comments.xml');
    candidate.parts.push('word/comments.xml');
    candidate.storyParts.push('word/comments.xml');
    candidate.entryNames.push('word/comments.xml');
    candidate.entryNameSet.add('word/comments.xml');
    const commentNode = commentDoc.getElementsByTagNameNS(W, 'comment')[0];
    candidate.items.push({
      type: 'com', id: '0', author: options.commentAuthor || 'Reviewer', date: '2026-09-01T14:00:00Z',
      text: options.commentText || 'Review comment', on: options.commentOn || '', part: 'word/document.xml',
      node: commentNode, replyToId: ''
    });
  }
  return candidate;
}

function testPureDiff(helpers) {
  const tokens = (text, style = '') => helpers.tokenizeCompareText(text).map((value) => ({ text: value, styleKey: style }));
  const base = tokens('The quick brown fox jumps.');
  const revised = tokens('The quick agile brown fox jumped.');
  const script = helpers.tokenDiffScript(base, revised);
  const deletedText = script.deleted.flatMap((range) => base.slice(range.start, range.end)).map((token) => token.text).join('');
  const insertedText = script.insertions.flatMap((entry) => entry.tokens).map((token) => token.text).join('');
  assert.equal(deletedText, 'jumps');
  assert.match(insertedText, /agile/);
  assert.match(insertedText, /jumped/);

  const date = new Date(2026, 8, 1, 12, 0, 0);
  assert.equal(helpers.editDateStamp(date), '1.9.26');
  assert.equal(helpers.comparisonFilename('Original Name.docx', 'Compare', date), 'Original Name (Compare 1.9.26).docx');
}

async function testDocumentComparison(helpers, JSZip) {
  const original = await makeCandidate(JSZip, 'Agreement.docx', documentXml([
    paragraph('The quick brown fox jumps over the lazy dog.'),
    paragraph('A linked clause remains here.', { complex: true }),
    paragraph('Delete this paragraph.')
  ]));
  const revised = await makeCandidate(JSZip, 'Agreement revised.docx', documentXml([
    paragraph('The quick agile brown fox jumped over the lazy dog.', { comment: true }),
    paragraph('A linked clause remains here.', { complex: true }),
    paragraph('Insert this paragraph.', { bold: true })
  ]), { comments: commentsXml('Please confirm this wording.', 'Jane'), commentAuthor: 'Jane', commentText: 'Please confirm this wording.', commentOn: 'The quick agile brown fox' });

  const result = await helpers.buildComparisonOutput(original, [{ candidate: revised, author: 'Jane', sourceName: revised.fileName }]);
  await preserveOutput('document-comparison.docx', result.blob);
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const xml = await output.file('word/document.xml').async('string');
  assert.match(xml, /<w:del[^>]*w:author="Jane"/);
  assert.match(xml, /<w:ins[^>]*w:author="Jane"/);
  assert.match(xml, /<w:delText[^>]*>jumps<\/w:delText>/);
  assert.match(xml, /<w:t[^>]*>jumped<\/w:t>/);
  assert.match(xml, /<w:t[^>]*>agile<\/w:t>/);
  assert.doesNotMatch(xml, /<w:delText[^>]*>The quick brown fox jumps over the lazy dog\.<\/w:delText>/);
  assert.match(xml, /<w:hyperlink[^>]*>[\s\S]*?A linked clause remains here\./);
  assert.doesNotMatch(xml, /<w:hyperlink[^>]*><w:del\b/);
  assert.match(xml, /<w:commentRangeStart w:id="0"/);
  const comments = await output.file('word/comments.xml').async('string');
  assert.match(comments, /Please confirm this wording\./);
  assert.match(comments, /w:author="Jane"/);
  assert.equal(Buffer.from(await output.file('word/media/preserve.bin').async('uint8array')).toString('hex'), '00010203feff');
  assert.equal(await output.file('customXml/item1.xml').async('string'), '<root><preserve>unchanged</preserve></root>');
  assert.equal(result.stats.importedComments, 1);
}

async function testCombinedReviews(helpers, JSZip) {
  const baseText = 'The policy covers all eligible services.';
  const base = await makeCandidate(JSZip, 'Policy.docx', documentXml([paragraph(baseText)]));
  const alice = await makeCandidate(JSZip, 'Alice.docx', documentXml([paragraph('The policy covers all medically necessary eligible services.', { comment: true })]), {
    comments: commentsXml('Add the medical-necessity qualifier.', 'Alice'), commentAuthor: 'Alice', commentText: 'Add the medical-necessity qualifier.', commentOn: baseText
  });
  const bob = await makeCandidate(JSZip, 'Bob.docx', documentXml([paragraph('The policy excludes all eligible services.')]));
  const carol = await makeCandidate(JSZip, 'Carol.docx', documentXml([paragraph('The policy covers all medically necessary eligible services.')]));
  const result = await helpers.buildComparisonOutput(base, [
    { candidate: alice, author: 'Alice', sourceName: alice.fileName },
    { candidate: bob, author: 'Bob', sourceName: bob.fileName },
    { candidate: carol, author: 'Carol', sourceName: carol.fileName }
  ]);
  await preserveOutput('combined-commentary.docx', result.blob);
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const xml = await output.file('word/document.xml').async('string');
  assert.match(xml, /w:author="Alice; Carol"/);
  assert.match(xml, /medically/);
  assert.match(xml, /necessary/);
  assert.match(xml, /w:author="Bob"/);
  assert.match(xml, /<w:delText[^>]*>covers<\/w:delText>/);
  assert.match(xml, /<w:t[^>]*>excludes<\/w:t>/);
  assert.doesNotMatch(xml, /<w:delText[^>]*>The policy covers all eligible services\.<\/w:delText>/);
  assert.equal(result.stats.changedParagraphs, 1);
  assert.equal(result.stats.importedComments, 1);
}

async function testFormattingAndAcceptedRevisions(helpers, JSZip) {
  const base = await makeCandidate(JSZip, 'Formatting.docx', documentXml([
    '<w:p><w:r><w:t xml:space="preserve">Payment is due promptly.</w:t></w:r></w:p>',
    '<w:p><w:r><w:t xml:space="preserve">The clause is </w:t></w:r><w:del w:id="41" w:author="Old Reviewer" w:date="2024-01-01T00:00:00Z"><w:r><w:delText xml:space="preserve">obsolete </w:delText></w:r></w:del><w:ins w:id="42" w:author="Old Reviewer" w:date="2024-01-01T00:00:01Z"><w:r><w:t>operative</w:t></w:r></w:ins><w:r><w:t>.</w:t></w:r></w:p>'
  ]));
  const revised = await makeCandidate(JSZip, 'Formatting revised.docx', documentXml([
    '<w:p><w:r><w:t xml:space="preserve">Payment is </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>due</w:t></w:r><w:r><w:t xml:space="preserve"> promptly.</w:t></w:r></w:p>',
    paragraph('The clause is effective.')
  ]));
  const result = await helpers.buildComparisonOutput(base, [{ candidate: revised, author: 'New Reviewer', sourceName: revised.fileName }]);
  await preserveOutput('formatting-and-existing-revisions.docx', result.blob);
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const xml = await output.file('word/document.xml').async('string');
  assert.doesNotMatch(xml, /Old Reviewer|obsolete/);
  assert.match(xml, /<w:delText[^>]*>due<\/w:delText>/);
  assert.match(xml, /<w:ins[^>]*w:author="New Reviewer"[^>]*>[\s\S]*?<w:rPr>[\s\S]*?<w:b\/>[\s\S]*?<w:t[^>]*>due<\/w:t>/);
  assert.match(xml, /<w:delText[^>]*>operative<\/w:delText>/);
  assert.match(xml, /<w:t[^>]*>effective<\/w:t>/);
  assert.doesNotMatch(xml, /<w:delText[^>]*>Payment is due promptly\.<\/w:delText>/);
}

async function testParagraphInsertionAndDeletion(helpers, JSZip) {
  const base = await makeCandidate(JSZip, 'Paragraphs.docx', documentXml([
    paragraph('Keep the opening.'), paragraph('Remove this whole paragraph.'), paragraph('Keep the ending.')
  ]));
  const revised = await makeCandidate(JSZip, 'Paragraphs revised.docx', documentXml([
    paragraph('Keep the opening.'), paragraph('Keep the ending.'), paragraph('Add this whole paragraph.', { bold: true })
  ]));
  const result = await helpers.buildComparisonOutput(base, [{ candidate: revised, author: 'Paragraph Reviewer', sourceName: revised.fileName }]);
  await preserveOutput('paragraph-insert-delete.docx', result.blob);
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const xml = await output.file('word/document.xml').async('string');
  assert.match(xml, /<w:pPr>[\s\S]*?<w:rPr>[\s\S]*?<w:del[^>]*w:author="Paragraph Reviewer"/);
  assert.match(xml, /<w:delText[^>]*>Remove this whole paragraph\.<\/w:delText>/);
  assert.match(xml, /<w:pPr>[\s\S]*?<w:rPr>[\s\S]*?<w:ins[^>]*w:author="Paragraph Reviewer"/);
  assert.match(xml, /<w:t[^>]*>Add<\/w:t>[\s\S]*?<w:t[^>]*>paragraph<\/w:t><w:t[^>]*>\.<\/w:t>/);
  assert.equal(result.stats.deletedParagraphs, 1);
  assert.equal(result.stats.insertedParagraphs, 1);
}

async function testStrictWordprocessingMl(helpers, JSZip) {
  const base = await makeCandidate(JSZip, 'Strict.docx', documentXml([paragraph('Strict text remains precise.')], W_STRICT), { namespace: W_STRICT });
  const revised = await makeCandidate(JSZip, 'Strict revised.docx', documentXml([paragraph('Strict revised text remains precise.')], W_STRICT), { namespace: W_STRICT });
  const result = await helpers.buildComparisonOutput(base, [{ candidate: revised, author: 'Strict Reviewer', sourceName: revised.fileName }]);
  await preserveOutput('strict-wordprocessingml.docx', result.blob);
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const xml = await output.file('word/document.xml').async('string');
  assert.match(xml, new RegExp(`xmlns:w="${W_STRICT}"`));
  assert.match(xml, /<w:ins[^>]*w:author="Strict Reviewer"/);
  assert.match(xml, /<w:t[^>]*>revised<\/w:t>/);
}

async function testExistingCommentDeduplication(helpers, JSZip) {
  const comment = commentsXml('Keep this existing comment once.', 'Same Reviewer');
  const options = { comments: comment, commentAuthor: 'Same Reviewer', commentText: 'Keep this existing comment once.', commentOn: 'The anchored wording.' };
  const base = await makeCandidate(JSZip, 'Commented base.docx', documentXml([paragraph('The anchored wording.', { comment: true })]), options);
  const reviewed = await makeCandidate(JSZip, 'Commented copy.docx', documentXml([paragraph('The anchored wording.', { comment: true })]), options);
  const result = await helpers.buildComparisonOutput(base, [{ candidate: reviewed, author: 'Same Reviewer', sourceName: reviewed.fileName }]);
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
  const comments = await output.file('word/comments.xml').async('string');
  assert.equal((comments.match(/<w:comment\b/g) || []).length, 1);
  assert.equal(result.stats.importedComments, 0);
}

(async () => {
  testStaticContract();
  const { helpers, JSZip } = loadHelpers();
  testPureDiff(helpers);
  await testDocumentComparison(helpers, JSZip);
  await testCombinedReviews(helpers, JSZip);
  await testFormattingAndAcceptedRevisions(helpers, JSZip);
  await testParagraphInsertionAndDeletion(helpers, JSZip);
  await testStrictWordprocessingMl(helpers, JSZip);
  await testExistingCommentDeduplication(helpers, JSZip);
  console.log('Comment Master v7.1.1 comparison regression tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
