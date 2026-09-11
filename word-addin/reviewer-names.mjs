const MAX_FILE_BYTES = 250 * 1024 * 1024;
const MAX_ENTRY_COUNT = 20000;
const MAX_ESTIMATED_UNCOMPRESSED = 750 * 1024 * 1024;
const XML_DECLARATION_ENCODING = /<\?xml[^>]*encoding\s*=\s*['\"]([^'\"]+)['\"][^>]*\?>/i;
const STORY_PATH = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments\d*)\.xml$/i;
const REVIEW_LOCALS = new Set([
  'comment', 'ins', 'del', 'moveFrom', 'moveTo', 'pPrChange', 'rPrChange',
  'tblPrChange', 'trPrChange', 'tcPrChange', 'cellIns', 'cellDel', 'cellMerge'
]);
const XML_TOKEN_PATTERN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^>]+>/g;
const REVIEW_START_TAG_PATTERN = new RegExp(`^<((?:[A-Za-z_][\\w.-]*:)?(${Array.from(REVIEW_LOCALS).join('|')}))\\b`);
const AUTHOR_ATTR_PATTERN = /(\s(?:[A-Za-z_][\w.-]*:)?author\s*=\s*)(["'])(.*?)\2/i;
const XML_NAME_PREFIX_PATTERN = /^([A-Za-z_][\w.-]*):/;
const REQUIRED_PARTS = new Set(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
let crcTable = null;

function asUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Expected DOCX bytes as an ArrayBuffer or Uint8Array.');
}

function readU16(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error('DOCX package is truncated.');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('DOCX package is truncated.');
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function putU16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function putU32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function assertSignature(bytes, offset, signature, message) {
  if (readU32(bytes, offset) !== signature) throw new Error(message);
}

function findEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) return offset;
  }
  throw new Error('The file is not a supported ZIP-based DOCX package.');
}

function decodeEntryName(bytes, utf8) {
  if (!bytes.length) return '';
  if (!utf8 && bytes.some((value) => value > 0x7f)) {
    throw new Error('The DOCX contains a non-UTF-8 part name that this add-in cannot safely process.');
  }
  return decoder.decode(bytes);
}

function isUnsafePartName(name) {
  if (!name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return true;
  const pieces = name.split('/');
  return pieces.some((piece) => piece === '..' || piece === '.');
}

function parseZip(input) {
  const bytes = asUint8Array(input);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('This document exceeds the 250 MB safety limit.');
  if (bytes.length < 22 || readU32(bytes, 0) !== 0x04034b50) throw new Error('The current file is not a ZIP-based DOCX package.');

  const eocdOffset = findEndOfCentralDirectory(bytes);
  const diskNumber = readU16(bytes, eocdOffset + 4);
  const centralDisk = readU16(bytes, eocdOffset + 6);
  const entriesOnDisk = readU16(bytes, eocdOffset + 8);
  const entryCount = readU16(bytes, eocdOffset + 10);
  const centralSize = readU32(bytes, eocdOffset + 12);
  const centralOffset = readU32(bytes, eocdOffset + 16);
  const commentLength = readU16(bytes, eocdOffset + 20);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw new Error('Multi-volume ZIP packages are not supported.');
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 documents are not supported by this small Word add-in.');
  if (entryCount > MAX_ENTRY_COUNT) throw new Error(`This package exceeds the ${MAX_ENTRY_COUNT.toLocaleString()}-entry safety limit.`);
  if (eocdOffset + 22 + commentLength > bytes.length) throw new Error('The ZIP end record is truncated.');
  if (centralOffset + centralSize > eocdOffset) throw new Error('The ZIP central directory is malformed.');

  const archiveComment = bytes.slice(eocdOffset + 22, eocdOffset + 22 + commentLength);
  const entries = [];
  let offset = centralOffset;
  let estimatedUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    assertSignature(bytes, offset, 0x02014b50, 'The ZIP central directory is malformed.');
    const versionMadeBy = readU16(bytes, offset + 4);
    const versionNeeded = readU16(bytes, offset + 6);
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const modTime = readU16(bytes, offset + 12);
    const modDate = readU16(bytes, offset + 14);
    const crc = readU32(bytes, offset + 16);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const centralExtraLength = readU16(bytes, offset + 30);
    const commentEntryLength = readU16(bytes, offset + 32);
    const diskStart = readU16(bytes, offset + 34);
    const internalAttributes = readU16(bytes, offset + 36);
    const externalAttributes = readU32(bytes, offset + 38);
    const localOffset = readU32(bytes, offset + 42);

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff || diskStart === 0xffff) {
      throw new Error('ZIP64 entries are not supported by this small Word add-in.');
    }
    if (diskStart !== 0) throw new Error('Multi-volume ZIP packages are not supported.');
    if ((flags & 0x0001) !== 0) throw new Error('Encrypted ZIP entries are not supported.');
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method ${method}.`);

    const recordLength = 46 + nameLength + centralExtraLength + commentEntryLength;
    if (offset + recordLength > bytes.length) throw new Error('The ZIP central directory is truncated.');
    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
    const centralExtra = bytes.slice(offset + 46 + nameLength, offset + 46 + nameLength + centralExtraLength);
    const entryComment = bytes.slice(offset + 46 + nameLength + centralExtraLength, offset + recordLength);
    const name = decodeEntryName(nameBytes, Boolean(flags & 0x0800));
    if (isUnsafePartName(name)) throw new Error(`The package contains an unsafe part name: ${name || '(empty)'}.`);

    assertSignature(bytes, localOffset, 0x04034b50, `The local ZIP header for ${name} is malformed.`);
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) throw new Error(`The compressed data for ${name} is truncated.`);
    const localNameBytes = bytes.slice(localOffset + 30, localOffset + 30 + localNameLength);
    const localName = decodeEntryName(localNameBytes, Boolean(flags & 0x0800));
    if (localName !== name) throw new Error(`ZIP entry name mismatch for ${name}.`);
    const localExtra = bytes.slice(localOffset + 30 + localNameLength, dataStart);
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

    estimatedUncompressed += uncompressedSize;
    if (estimatedUncompressed > MAX_ESTIMATED_UNCOMPRESSED) throw new Error('The package expands beyond the safe in-memory processing limit.');

    entries.push({
      name, nameBytes, versionMadeBy, versionNeeded, flags, method, modTime, modDate,
      crc, compressedSize, uncompressedSize, centralExtra, entryComment, internalAttributes,
      externalAttributes, localExtra, compressedData
    });
    offset += recordLength;
  }

  if (offset !== centralOffset + centralSize) throw new Error('The ZIP central directory size does not match its entries.');
  for (const required of REQUIRED_PARTS) {
    if (!entries.some((entry) => entry.name === required)) throw new Error(`This package is missing required DOCX part ${required}.`);
  }
  return { entries, archiveComment };
}

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const value of bytes) crc = table[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function transformStreamBytes(bytes, StreamClass, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new StreamClass(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressEntry(entry) {
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) throw new Error(`Stored ZIP entry ${entry.name} has inconsistent sizes.`);
    const output = entry.compressedData.slice();
    if (crc32(output) !== entry.crc) throw new Error(`CRC validation failed for ${entry.name}.`);
    return output;
  }
  if (typeof DecompressionStream !== 'function') throw new Error('This Word runtime does not provide native DEFLATE support.');
  let output;
  try {
    output = await transformStreamBytes(entry.compressedData, DecompressionStream, 'deflate-raw');
  } catch (error) {
    throw new Error(`Could not decompress ${entry.name}: ${error.message}`);
  }
  if (output.length !== entry.uncompressedSize) throw new Error(`Uncompressed size validation failed for ${entry.name}.`);
  if (crc32(output) !== entry.crc) throw new Error(`CRC validation failed for ${entry.name}.`);
  return output;
}

async function compressBytes(bytes, method) {
  if (method === 0 || bytes.length === 0) return { method: 0, bytes: bytes.slice() };
  if (typeof CompressionStream !== 'function') throw new Error('This Word runtime does not provide native DEFLATE support.');
  try {
    return { method: 8, bytes: await transformStreamBytes(bytes, CompressionStream, 'deflate-raw') };
  } catch (error) {
    throw new Error(`Could not recompress the revised document: ${error.message}`);
  }
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function makeLocalHeader(entry, compressed, crc, uncompressedSize, offset) {
  const flags = entry.flags & ~0x0008;
  const header = new Uint8Array(30);
  putU32(header, 0, 0x04034b50);
  putU16(header, 4, entry.versionNeeded);
  putU16(header, 6, flags);
  putU16(header, 8, compressed.method);
  putU16(header, 10, entry.modTime);
  putU16(header, 12, entry.modDate);
  putU32(header, 14, crc);
  putU32(header, 18, compressed.bytes.length);
  putU32(header, 22, uncompressedSize);
  putU16(header, 26, entry.nameBytes.length);
  putU16(header, 28, entry.localExtra.length);
  return { bytes: concatBytes([header, entry.nameBytes, entry.localExtra, compressed.bytes]), offset };
}

function makeCentralHeader(entry, compressed, crc, uncompressedSize, localOffset) {
  const flags = entry.flags & ~0x0008;
  const header = new Uint8Array(46);
  putU32(header, 0, 0x02014b50);
  putU16(header, 4, entry.versionMadeBy);
  putU16(header, 6, entry.versionNeeded);
  putU16(header, 8, flags);
  putU16(header, 10, compressed.method);
  putU16(header, 12, entry.modTime);
  putU16(header, 14, entry.modDate);
  putU32(header, 16, crc);
  putU32(header, 20, compressed.bytes.length);
  putU32(header, 24, uncompressedSize);
  putU16(header, 28, entry.nameBytes.length);
  putU16(header, 30, entry.centralExtra.length);
  putU16(header, 32, entry.entryComment.length);
  putU16(header, 34, 0);
  putU16(header, 36, entry.internalAttributes);
  putU32(header, 38, entry.externalAttributes);
  putU32(header, 42, localOffset);
  return concatBytes([header, entry.nameBytes, entry.centralExtra, entry.entryComment]);
}

async function buildZip(pkg, replacements) {
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;

  for (const entry of pkg.entries) {
    const replacement = replacements.get(entry.name);
    let compressed;
    let crc = entry.crc;
    let uncompressedSize = entry.uncompressedSize;

    if (replacement) {
      crc = crc32(replacement);
      uncompressedSize = replacement.length;
      compressed = await compressBytes(replacement, entry.method === 0 ? 0 : 8);
    } else {
      compressed = { method: entry.method, bytes: entry.compressedData };
    }

    if (compressed.bytes.length > 0xffffffff || uncompressedSize > 0xffffffff || localOffset > 0xffffffff) {
      throw new Error('The revised package would require ZIP64 and cannot be opened by this small add-in.');
    }

    const local = makeLocalHeader(entry, compressed, crc, uncompressedSize, localOffset);
    localChunks.push(local.bytes);
    centralChunks.push(makeCentralHeader(entry, compressed, crc, uncompressedSize, localOffset));
    localOffset += local.bytes.length;
  }

  const central = concatBytes(centralChunks);
  if (localOffset > 0xffffffff || central.length > 0xffffffff) throw new Error('The revised package would require ZIP64.');
  if (pkg.entries.length > 0xffff) throw new Error('The revised package contains too many entries for classic ZIP.');
  const eocd = new Uint8Array(22);
  putU32(eocd, 0, 0x06054b50);
  putU16(eocd, 4, 0);
  putU16(eocd, 6, 0);
  putU16(eocd, 8, pkg.entries.length);
  putU16(eocd, 10, pkg.entries.length);
  putU32(eocd, 12, central.length);
  putU32(eocd, 16, localOffset);
  putU16(eocd, 20, pkg.archiveComment.length);
  return concatBytes([...localChunks, central, eocd, pkg.archiveComment]);
}

function decodeXmlAttribute(value) {
  return value.replace(/&(?:#x[0-9A-Fa-f]+|#\d+|amp|quot|apos|lt|gt);/g, (entity) => {
    if (entity === '&amp;') return '&';
    if (entity === '&quot;') return '"';
    if (entity === '&apos;') return "'";
    if (entity === '&lt;') return '<';
    if (entity === '&gt;') return '>';
    if (entity.startsWith('&#x')) return String.fromCodePoint(Number.parseInt(entity.slice(3, -1), 16));
    return String.fromCodePoint(Number.parseInt(entity.slice(2, -1), 10));
  });
}

function escapeXmlAttribute(value, quote) {
  let output = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  output = quote === "'" ? output.replace(/'/g, '&apos;') : output.replace(/"/g, '&quot;');
  return output;
}

function validateXmlText(xml, path) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(`${path} contains a DTD or entity declaration and was not processed.`);
  const declaration = xml.match(XML_DECLARATION_ENCODING);
  if (declaration && !/^utf-?8$/i.test(declaration[1])) throw new Error(`${path} uses unsupported XML encoding ${declaration[1]}.`);
  if (typeof DOMParser === 'function') {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error(`${path} contains malformed XML.`);
  }
}

function reviewKind(local) {
  return local === 'comment' ? 'comment' : 'change';
}

function inspectReviewXml(xml, path = 'Word XML') {
  validateXmlText(xml, path);
  const authors = new Map();
  let total = 0;
  XML_TOKEN_PATTERN.lastIndex = 0;
  for (let tokenMatch = XML_TOKEN_PATTERN.exec(xml); tokenMatch; tokenMatch = XML_TOKEN_PATTERN.exec(xml)) {
    const tag = tokenMatch[0];
    const match = tag.match(REVIEW_START_TAG_PATTERN);
    if (!match || tag.startsWith('</')) continue;
    const local = match[2];
    const authorMatch = tag.match(AUTHOR_ATTR_PATTERN);
    const author = authorMatch ? decodeXmlAttribute(authorMatch[3]) : '';
    const key = author;
    const row = authors.get(key) || { author, total: 0, comments: 0, changes: 0, missing: !authorMatch };
    row.total += 1;
    if (reviewKind(local) === 'comment') row.comments += 1;
    else row.changes += 1;
    row.missing = row.missing || !authorMatch;
    authors.set(key, row);
    total += 1;
  }
  return { total, authors };
}

function rewriteReviewXml(xml, fromAuthor, toAuthor, path = 'Word XML') {
  validateXmlText(xml, path);
  if (typeof toAuthor !== 'string' || !toAuthor.trim()) throw new Error('Enter the new reviewer name.');
  const allAuthors = fromAuthor === '__all__';
  if (!allAuthors && typeof fromAuthor !== 'string') throw new Error('Choose the reviewer name to replace.');
  let changed = 0;
  let comments = 0;
  let changes = 0;

  XML_TOKEN_PATTERN.lastIndex = 0;
  const revised = xml.replace(XML_TOKEN_PATTERN, (tag) => {
    const match = tag.match(REVIEW_START_TAG_PATTERN);
    if (!match || tag.startsWith('</')) return tag;
    const qname = match[1];
    const local = match[2];
    const authorMatch = tag.match(AUTHOR_ATTR_PATTERN);
    const current = authorMatch ? decodeXmlAttribute(authorMatch[3]) : '';
    if (!allAuthors && current !== fromAuthor) return tag;
    if (authorMatch && current === toAuthor) return tag;

    let updated;
    if (authorMatch) {
      const quote = authorMatch[2];
      const replacement = `${authorMatch[1]}${quote}${escapeXmlAttribute(toAuthor, quote)}${quote}`;
      updated = tag.slice(0, authorMatch.index) + replacement + tag.slice(authorMatch.index + authorMatch[0].length);
    } else {
      const prefixMatch = qname.match(XML_NAME_PREFIX_PATTERN);
      const prefix = prefixMatch ? `${prefixMatch[1]}:` : '';
      const insertion = ` ${prefix}author="${escapeXmlAttribute(toAuthor, '"')}"`;
      updated = tag.replace(/\s*\/>$/, `${insertion}/>`).replace(/\s*>$/, `${insertion}>`);
    }
    changed += 1;
    if (reviewKind(local) === 'comment') comments += 1;
    else changes += 1;
    return updated;
  });

  validateXmlText(revised, path);
  return { xml: revised, changed, comments, changes };
}

function summarizeRows(rows) {
  return rows.sort((left, right) => right.total - left.total || left.author.localeCompare(right.author));
}

export async function inspectDocxReviewAuthors(input) {
  const pkg = parseZip(input);
  const aggregate = new Map();
  let total = 0;

  for (const entry of pkg.entries) {
    if (!STORY_PATH.test(entry.name)) continue;
    const bytes = await decompressEntry(entry);
    let xml;
    try { xml = decoder.decode(bytes); }
    catch { throw new Error(`${entry.name} is not valid UTF-8 XML.`); }
    const inspected = inspectReviewXml(xml, entry.name);
    total += inspected.total;
    for (const row of inspected.authors.values()) {
      const current = aggregate.get(row.author) || { author: row.author, total: 0, comments: 0, changes: 0, missing: false };
      current.total += row.total;
      current.comments += row.comments;
      current.changes += row.changes;
      current.missing = current.missing || row.missing;
      aggregate.set(row.author, current);
    }
  }

  return { total, authors: summarizeRows(Array.from(aggregate.values())) };
}

export async function renameDocxReviewAuthors(input, fromAuthor, toAuthor) {
  const pkg = parseZip(input);
  const replacements = new Map();
  let changed = 0;
  let comments = 0;
  let changes = 0;

  for (const entry of pkg.entries) {
    if (!STORY_PATH.test(entry.name)) continue;
    const bytes = await decompressEntry(entry);
    let xml;
    try { xml = decoder.decode(bytes); }
    catch { throw new Error(`${entry.name} is not valid UTF-8 XML.`); }
    const rewritten = rewriteReviewXml(xml, fromAuthor, toAuthor, entry.name);
    if (!rewritten.changed) continue;
    replacements.set(entry.name, encoder.encode(rewritten.xml));
    changed += rewritten.changed;
    comments += rewritten.comments;
    changes += rewritten.changes;
  }

  if (!changed) throw new Error(fromAuthor === '__all__' ? 'This document has no review authors to change.' : `No comments or tracked changes are attributed to “${fromAuthor}”.`);
  const bytes = await buildZip(pkg, replacements);
  const verification = await inspectDocxReviewAuthors(bytes);
  if (fromAuthor === '__all__') {
    const unexpected = verification.authors.filter((row) => row.author !== toAuthor);
    if (unexpected.length) throw new Error('Post-write verification found an unchanged reviewer name.');
  } else if (fromAuthor !== toAuthor && verification.authors.some((row) => row.author === fromAuthor)) {
    throw new Error('Post-write verification found an unchanged target reviewer name.');
  }
  return { bytes, changed, comments, changes, verification };
}

export const _test = Object.freeze({ parseZip, buildZip, inspectReviewXml, rewriteReviewXml, crc32, decompressEntry });
