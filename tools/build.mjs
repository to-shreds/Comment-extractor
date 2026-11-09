import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;

async function copy(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, source), path.join(dist, target));
}

async function copyTree(source, target, include = () => true) {
  const sourceRoot = path.join(root, source);
  for (const relative of await listFiles(sourceRoot)) {
    if (include(relative)) await copy(path.posix.join(source, relative), path.posix.join(target, relative));
  }
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Refusing to package non-file artifact: ${relative}`);
  }
  return files;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function replaceRequired(source, token, replacement) {
  const first = source.indexOf(token);
  if (first === -1 || source.indexOf(token, first + token.length) !== -1) {
    throw new Error(`Expected exactly one ${token} placeholder in service worker`);
  }
  return source.replace(token, replacement);
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });

await copy('index.html', 'index.html');
await copy('src/workbench.css', 'assets/workbench.css');
await copy('src/linear-workspace.css', 'assets/linear-workspace.css');
await copy('src/editorial-theme.css', 'assets/editorial-theme.css');
await copyTree('src/fonts', 'assets/fonts', (relative) => relative.endsWith('.woff2') || relative.startsWith('LICENSE-'));
await copy('src/linear-workspace.mjs', 'assets/linear-workspace.mjs');
await copy('src/review-summary.mjs', 'assets/review-summary.mjs');
await copy('src/workbench.js', 'assets/workbench.js');
await copy('src/workbench-core.mjs', 'assets/workbench-core.mjs');
await copy('src/pdf-engine.mjs', 'assets/pdf-engine.mjs');
await copy('src/service-worker.js', 'service-worker.js');
await copy('manifest.webmanifest', 'manifest.webmanifest');
await copy('THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md');

const vendorFiles = [
  ['node_modules/jszip/LICENSE.markdown', 'vendor/jszip/LICENSE.markdown'],
  ['node_modules/pako/LICENSE', 'vendor/jszip/pako-LICENSE'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdfjs/pdf.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.mjs'],
  ['node_modules/pdfjs-dist/LICENSE', 'vendor/pdfjs/LICENSE'],
  ['node_modules/pdf-lib/dist/pdf-lib.esm.min.js', 'vendor/pdf-lib/pdf-lib.esm.min.js'],
  ['node_modules/pdf-lib/LICENSE.md', 'vendor/pdf-lib/LICENSE'],
  ['node_modules/mammoth/mammoth.browser.min.js', 'vendor/mammoth/mammoth.browser.min.js'],
  ['node_modules/mammoth/LICENSE', 'vendor/mammoth/LICENSE'],
  ['node_modules/marked/lib/marked.esm.js', 'vendor/marked/marked.esm.js'],
  ['node_modules/marked/LICENSE', 'vendor/marked/LICENSE'],
  ['node_modules/dompurify/dist/purify.es.mjs', 'vendor/dompurify/purify.es.mjs'],
  ['node_modules/dompurify/LICENSE', 'vendor/dompurify/LICENSE'],
  ['node_modules/tesseract.js/dist/tesseract.esm.min.js', 'vendor/tesseract/tesseract.esm.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'vendor/tesseract/worker.min.js'],
  ['node_modules/tesseract.js/dist/tesseract.min.js.LICENSE.txt', 'vendor/tesseract/tesseract.min.js.LICENSE.txt'],
  ['node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', 'vendor/tesseract/worker.min.js.LICENSE.txt'],
  ['node_modules/tesseract.js/LICENSE.md', 'vendor/tesseract/LICENSE'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'vendor/tesseract/lang/eng.traineddata.gz'],
  ['node_modules/@tesseract.js-data/eng/README.md', 'vendor/tesseract/lang/README.md']
];

for (const [source, target] of vendorFiles) await copy(source, target);

await copyTree('node_modules/pdfjs-dist/cmaps', 'vendor/pdfjs/cmaps');
await copyTree('node_modules/pdfjs-dist/standard_fonts', 'vendor/pdfjs/standard_fonts');
await copyTree('node_modules/pdfjs-dist/iccs', 'vendor/pdfjs/iccs');
await copyTree(
  'node_modules/pdfjs-dist/wasm',
  'vendor/pdfjs/wasm',
  (relative) => !['quickjs-eval.js', 'quickjs-eval.wasm'].includes(relative)
);

const coreNames = [
  'tesseract-core.wasm.js', 'tesseract-core.wasm',
  'tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm',
  'tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm',
  'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm',
  'tesseract-core-relaxedsimd.wasm.js', 'tesseract-core-relaxedsimd.wasm',
  'tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm'
];
for (const name of coreNames) await copy(`node_modules/tesseract.js-core/${name}`, `vendor/tesseract/core/${name}`);
await copy('node_modules/tesseract.js-core/LICENSE', 'vendor/tesseract/core/LICENSE');

const pdfJsSupportAssets = [];
for (const [directory, extensions] of [
  ['cmaps', new Set(['.bcmap'])],
  ['standard_fonts', new Set(['.pfb', '.ttf'])],
  ['iccs', new Set(['.icc'])],
  ['wasm', new Set(['.wasm', '.js'])]
]) {
  const files = await listFiles(path.join(dist, 'vendor/pdfjs', directory));
  pdfJsSupportAssets.push(...files
    .filter((relative) => extensions.has(path.extname(relative)))
    .map((relative) => `./vendor/pdfjs/${directory}/${relative}`));
}

const editorialFontAssets = (await listFiles(path.join(dist, 'assets/fonts')))
  .filter((relative) => relative.endsWith('.woff2'))
  .map((relative) => `./assets/fonts/${relative}`);
if (editorialFontAssets.length !== 6) throw new Error('Expected six bundled editorial font files. Run npm run fonts:install first.');

const coreAssets = [
  './index.html', './manifest.webmanifest', './asset-manifest.json', './assets/workbench.css', './assets/workbench.js',
  './assets/linear-workspace.css', './assets/editorial-theme.css', ...editorialFontAssets,
  './assets/linear-workspace.mjs', './assets/review-summary.mjs',
  './assets/workbench-core.mjs', './assets/pdf-engine.mjs', './vendor/pdfjs/pdf.mjs',
  './vendor/pdfjs/pdf.worker.mjs', './vendor/pdf-lib/pdf-lib.esm.min.js',
  './vendor/marked/marked.esm.js', './vendor/dompurify/purify.es.mjs',
  ...pdfJsSupportAssets
];

const optionalAssets = {
  ocr: [
    './vendor/tesseract/tesseract.esm.min.js',
    './vendor/tesseract/worker.min.js',
    './vendor/tesseract/lang/eng.traineddata.gz',
    ...coreNames.map((name) => `./vendor/tesseract/core/${name}`)
  ],
  officeConversion: ['./vendor/mammoth/mammoth.browser.min.js']
};
const exactOptionalAssets = Object.values(optionalAssets).flat();

for (const asset of [...coreAssets.filter((item) => item !== './asset-manifest.json'), ...exactOptionalAssets]) {
  await readFile(path.join(dist, asset.slice(2)));
}

const buildInputs = (await listFiles(dist)).filter((relative) => relative !== 'asset-manifest.json');
const buildHasher = createHash('sha256');
buildHasher.update(`comment-master-build\0${version}\0`);
buildHasher.update(`${JSON.stringify(coreAssets)}\0${JSON.stringify(optionalAssets)}\0`);
for (const relative of buildInputs) {
  const bytes = await readFile(path.join(dist, relative));
  buildHasher.update(`${Buffer.byteLength(relative)}:${relative}:${bytes.length}:`);
  buildHasher.update(bytes);
}
const buildId = buildHasher.digest('hex').slice(0, 24);

const workerPath = path.join(dist, 'service-worker.js');
let worker = await readFile(workerPath, 'utf8');
worker = replaceRequired(worker, '__CM_VERSION__', JSON.stringify(version));
worker = replaceRequired(worker, '__CM_BUILD_ID__', JSON.stringify(buildId));
worker = replaceRequired(worker, '__CM_CORE_ASSETS__', JSON.stringify(coreAssets, null, 2));
worker = replaceRequired(worker, '__CM_OPTIONAL_ASSETS__', JSON.stringify(exactOptionalAssets, null, 2));
await writeFile(workerPath, worker);

const files = {};
for (const relative of (await listFiles(dist)).filter((item) => item !== 'asset-manifest.json')) {
  const bytes = await readFile(path.join(dist, relative));
  files[`./${relative}`] = { bytes: bytes.length, sha256: digest(bytes) };
}

const buildManifest = {
  schemaVersion: 1,
  version,
  buildId,
  coreAssets,
  optionalAssets,
  files
};
await writeFile(path.join(dist, 'asset-manifest.json'), `${JSON.stringify(buildManifest, null, 2)}\n`);

console.log(`Built Comment Master v${version} (${buildId}) in ${dist}`);
