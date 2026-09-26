'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

function scriptContaining(text) {
  const script = scripts.find((candidate) => candidate.includes(text));
  assert.ok(script, `Missing script containing ${text}`);
  return script;
}

function testSyntaxAndUiContract() {
  scripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `Script ${index + 1} has invalid JavaScript`));
  assert.match(html, /<title>Comment Master v7\.1\.0<\/title>/);
  assert.match(html, /class="tab-btn tab-export" data-tab="export"/);
  assert.match(html, /data-action="homeStripMetadata"/);
  assert.match(html, /data-action="homeExportComments"/);
  assert.match(html, /data-action="exportCommentsWord"/);
  assert.match(html, /id="overview-authors"/);
  assert.match(html, /id="overview-link-health"/);
  assert.doesNotMatch(html, /id="home-scope"/);
  assert.doesNotMatch(html, /id="home-export-scope"/);

  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const collectedIds = [...html.matchAll(/\bid\('([^']+)'\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(collectedIds.filter((id) => !ids.has(id)))], [], 'A collected UI element is missing from the HTML');
}

function loadApplicationHelpers() {
  let application = scriptContaining("const VERSION = '7.1.0'");
  const marker = "window.addEventListener('DOMContentLoaded', init, { once: true });";
  assert.ok(application.includes(marker), 'Application test hook marker is missing');
  application = application.replace(marker, `
    window.__CM_EXPORT_HELPERS__ = Object.freeze({
      editDateStamp,
      editedDocumentFilename,
      commentReportFilename,
      truncateCommentContext,
      normalizeParagraphId,
      linkCommentReplies
    });
    ${marker}`);
  const windowObject = { addEventListener() {} };
  vm.runInNewContext(application, {
    window: windowObject,
    location: { hash: '' },
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    console
  });
  return windowObject.__CM_EXPORT_HELPERS__;
}

function testFilenamesAndContext() {
  const helpers = loadApplicationHelpers();
  const date = new Date(2026, 8, 1, 12, 0, 0);
  assert.equal(helpers.editDateStamp(date), '1.9.26');
  assert.equal(helpers.editedDocumentFilename('My Original File.docx', date), 'My Original File (Edit 1.9.26).docx');
  assert.equal(helpers.editedDocumentFilename('Case Notes.DOCX', date), 'Case Notes (Edit 1.9.26).DOCX');
  assert.equal(helpers.commentReportFilename('My Original File.docx', date), 'My Original File (Comments 1.9.26).docx');
  assert.ok(!helpers.editedDocumentFilename('My Original File.docx', date).includes('%20'));

  const longContext = `${'A useful identifying phrase '.repeat(12)}🙂 ending`;
  const shortened = helpers.truncateCommentContext(longContext);
  assert.ok(shortened.endsWith('…'));
  assert.ok(Array.from(shortened).length <= 141);
  assert.equal(helpers.truncateCommentContext('short context'), 'short context');
}

function testReplyAssociation() {
  const helpers = loadApplicationHelpers();
  const attribute = (localName, value) => ({ localName, value });
  const paragraph = (id) => ({ attributes: [attribute('paraId', id)] });
  const commentNode = (paragraphs) => ({
    getElementsByTagNameNS(namespace, localName) {
      return localName === 'p' ? paragraphs : [];
    }
  });
  const commentEx = (id, parentId) => ({
    attributes: [attribute('paraId', id), ...(parentId ? [attribute('paraIdParent', parentId)] : [])]
  });
  const extended = {
    documentElement: { localName: 'commentsEx' },
    getElementsByTagNameNS(namespace, localName) {
      return localName === 'commentEx' ? [commentEx('BBBB2222', 'AAAA1111'), commentEx('AAAA1111', '')] : [];
    }
  };
  const items = [
    { type: 'com', uid: 'parent', id: '7', node: commentNode([paragraph('{AAAA-1111}')]) },
    { type: 'com', uid: 'reply', id: '8', node: commentNode([paragraph('bbbb2222')]) }
  ];
  helpers.linkCommentReplies(items, { wNs: 'urn:test-word', xmlDocs: new Map([['word/commentsExtended.xml', extended]]) });
  assert.equal(items[0].replyToUid, '');
  assert.equal(items[1].replyToUid, 'parent');
  assert.equal(items[1].replyToId, '7');
}

async function loadWordWriter() {
  const zipContext = { window: {}, setImmediate, clearImmediate, setTimeout, clearTimeout, Promise, Uint8Array, ArrayBuffer, Blob };
  vm.runInNewContext(scripts[0], zipContext);
  const JSZip = zipContext.window.JSZip;
  assert.ok(JSZip, 'Embedded JSZip did not load');
  const writerContext = { window: { JSZip }, JSZip, Blob, saveAs() {} };
  vm.runInNewContext(scriptContaining('window.WFSWord'), writerContext);
  return { JSZip, writer: writerContext.window.WFSWord };
}

async function testWordPackages() {
  const { JSZip, writer } = await loadWordWriter();
  assert.equal(writer.version, '2.0.0');

  const fullComment = `Full comment line one\nFull comment line two with <XML> & Unicode 🙂 ${'Z'.repeat(25000)} END-OF-COMMENT`;
  const portraitBlob = await writer.build({
    title: 'Comments report',
    headers: ['Comment #', 'Author', 'Date/time', 'Page', 'Commented on', 'Comment'],
    rows: [
      [1, 'Alice', '9/1/2026, 9:30 AM', 2, 'Identifying text', 'I agree'],
      [2, 'Bob', '9/1/2026, 9:31 AM', 2, '[Comment #1]', fullComment]
    ],
    orientation: 'portrait',
    widths: [650, 1350, 1650, 600, 2800, 3750],
    itemLabel: 'comment'
  });
  if (process.env.CM_TEST_OUTPUT) fs.writeFileSync(process.env.CM_TEST_OUTPUT, Buffer.from(await portraitBlob.arrayBuffer()));
  const portraitZip = await JSZip.loadAsync(await portraitBlob.arrayBuffer(), { checkCRC32: true });
  const portraitXml = await portraitZip.file('word/document.xml').async('string');
  assert.match(portraitXml, /<w:pgSz w:w="12240" w:h="15840"\/>/);
  assert.equal((portraitXml.match(/<w:gridCol /g) || []).length, 6);
  assert.match(portraitXml, /\[Comment #1\]/);
  assert.match(portraitXml, /Full comment line two with &lt;XML&gt; &amp; Unicode/);
  assert.match(portraitXml, /END-OF-COMMENT/);
  assert.match(portraitXml, /<w:br\/>/);

  const landscapeBlob = await writer.build({
    title: 'Review activity',
    headers: ['Page number', 'Language', 'Type', 'Reviewer', 'Date/time'],
    rows: [[1, 'Text', 'Comment', 'Alice', '2026-09-01T13:30:00Z']]
  });
  const landscapeZip = await JSZip.loadAsync(await landscapeBlob.arrayBuffer(), { checkCRC32: true });
  const landscapeXml = await landscapeZip.file('word/document.xml').async('string');
  assert.match(landscapeXml, /w:orient="landscape"/);
  assert.equal((landscapeXml.match(/<w:gridCol /g) || []).length, 5);
}

(async () => {
  testSyntaxAndUiContract();
  testFilenamesAndContext();
  testReplyAssociation();
  await testWordPackages();
  console.log('Comment Master export regression tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
