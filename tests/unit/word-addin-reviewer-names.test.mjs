import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectDocxReviewAuthors,
  renameDocxReviewAuthors,
  _test
} from '../../word-addin/reviewer-names.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function crc32(bytes) {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  let crc = 0xffffffff;
  for (const value of bytes) crc = table[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function buildStoredZip(files) {
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = content instanceof Uint8Array ? content : encoder.encode(content);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      nameBytes, data
    ]);
    localChunks.push(local);
    centralChunks.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(localOffset), nameBytes
    ]));
    localOffset += local.length;
  }

  const central = concat(centralChunks);
  const local = concat(localChunks);
  const count = centralChunks.length;
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0), u16(count), u16(count),
    u32(central.length), u32(local.length), u16(0)
  ]);
  return concat([local, central, eocd]);
}

function fixture() {
  return buildStoredZip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    'word/document.xml': '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="urn:w"><w:body><w:ins w:id="1" w:author="Claude"/><w:del w:id="2" w:author="Claude"/><w:rPrChange w:id="3" w:author="Other"/></w:body></w:document>',
    'word/comments.xml': '<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="urn:w"><w:comment w:id="1" w:author="Claude"/><w:comment w:id="2" w:author="Jon &amp; Co"/></w:comments>',
    'word/header1.xml': '<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="urn:w"><w:moveTo w:id="4" w:author="Claude"/></w:hdr>',
    'word/media/blob.bin': Uint8Array.from([0, 1, 2, 3, 254, 255])
  });
}

test('inspects and renames one reviewer across comments and changes', async () => {
  const input = fixture();
  const before = await inspectDocxReviewAuthors(input);
  assert.equal(before.total, 6);
  assert.deepEqual(before.authors.map((row) => [row.author, row.total]), [
    ['Claude', 4], ['Jon & Co', 1], ['Other', 1]
  ]);

  const result = await renameDocxReviewAuthors(input, 'Claude', 'Jon');
  assert.equal(result.changed, 4);
  assert.equal(result.comments, 1);
  assert.equal(result.changes, 3);
  assert.equal(result.verification.authors.some((row) => row.author === 'Claude'), false);
  assert.equal(result.verification.authors.find((row) => row.author === 'Jon').total, 4);

  const parsed = _test.parseZip(result.bytes);
  const binary = parsed.entries.find((entry) => entry.name === 'word/media/blob.bin');
  assert.deepEqual(Array.from(await _test.decompressEntry(binary)), [0, 1, 2, 3, 254, 255]);
});

test('renames all reviewers and safely escapes XML attributes', async () => {
  const result = await renameDocxReviewAuthors(fixture(), '__all__', 'Jane "Q" & Sons');
  assert.equal(result.changed, 6);
  assert.deepEqual(result.verification.authors.map((row) => [row.author, row.total]), [['Jane "Q" & Sons', 6]]);
});

test('does not treat review-like text inside XML comments as markup', () => {
  const xml = '<!-- <w:ins w:author="Claude">not markup</w:ins> --><w:ins xmlns:w="urn:w" w:author="Claude"/>';
  const result = _test.rewriteReviewXml(xml, 'Claude', 'Jon');
  assert.equal(result.changed, 1);
  assert.match(result.xml, /<!-- <w:ins w:author="Claude">not markup<\/w:ins> -->/);
  assert.equal(decoder.decode(encoder.encode(result.xml)), result.xml);
});
