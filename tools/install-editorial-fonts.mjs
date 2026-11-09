// Pinned, licensed typefaces. Run only during development/CI bootstrap.
// The published app loads fonts from its own assets, never a remote server.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const commit = '5a72889057f592bb0659629e38337359f94d53b2';
const files = [
  ['fonts/variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2', 'ibm-plex-sans-latin-wght-normal.woff2', 'b757bc5ca2d8845a5b8d5349c860553f1772dd69'],
  ['fonts/variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-italic.woff2', 'ibm-plex-sans-latin-wght-italic.woff2', 'a8c2c3659290c211df7ac724d91df2772b1dbd43'],
  ['fonts/variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2', 'source-serif-4-latin-wght-normal.woff2', '4c3e6b90c9518de98b75a1565cb2ec0f3865bb6f'],
  ['fonts/variable/source-serif-4/files/source-serif-4-latin-wght-italic.woff2', 'source-serif-4-latin-wght-italic.woff2', 'dfb754d4743e701e08b4b45c04d3e3f0eb06c995'],
  ['fonts/google/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-latin-400-normal.woff2', '0804aaff92260b5359330f63e05b9ac25ccabeee'],
  ['fonts/google/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2', 'ibm-plex-mono-latin-600-normal.woff2', '67aeeb0104a02cf060b813abf6dcb6fdb97b7512']
];
const gitHash = (bytes) => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');

for (const [remote, name, expected] of files) {
  const output = join(root, 'src', 'fonts', name);
  let bytes;
  try {
    bytes = await readFile(output);
    if (gitHash(bytes) !== expected) throw new Error('Bundled font checksum differs from pinned upstream');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const url = 'https://raw.githubusercontent.com/fontsource/font-files/' + commit + '/' + remote;
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error('Typeface download failed: ' + name + ', HTTP ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
    if (gitHash(bytes) !== expected) throw new Error('Typeface checksum verification failed: ' + name);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
    console.log('Added verified same-origin typeface:', name);
  }
}
console.log('All six local typefaces match their pinned upstream Git blobs.');
