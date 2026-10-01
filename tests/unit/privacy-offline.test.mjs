import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('production policy permits only same-origin runtime connections', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || '';
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /connect-src 'self' blob:/);
  assert.match(policy, /worker-src 'self' blob:/);
  assert.match(policy, /object-src 'none'/);
  assert.doesNotMatch(policy, /connect-src[^;]*(?:https?:|\*)/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:/i);
  assert.doesNotMatch(html, /analytics|telemetry|sendBeacon\s*\(/i);
});

test('document workflows contain no external network probes or persistence archive', async () => {
  const [html, workbench] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'src/workbench.js'), 'utf8')
  ]);
  const application = `${html}\n${workbench}`;
  assert.doesNotMatch(application, /fetch\s*\(\s*(?:url|link|target|relationship)/i);
  assert.doesNotMatch(application, /XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
  assert.doesNotMatch(application, /localStorage|sessionStorage/);
  assert.doesNotMatch(workbench, /indexedDB\.open/);
  assert.match(html, /External website addresses found in the document are listed locally and are never contacted/);
});

test('service worker caches only exact application assets', async () => {
  const worker = await readFile(path.join(root, 'src/service-worker.js'), 'utf8');
  assert.match(worker, /CORE_URLS\.has\(request\.url\)/);
  assert.match(worker, /OPTIONAL_URLS\.has\(request\.url\)/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /request\.headers\.has\('Range'\)/);
  assert.match(worker, /cache: 'no-store'/);
  assert.doesNotMatch(worker, /caches\.match\(request\)(?!\.url)/);
  assert.doesNotMatch(worker, /skipWaiting|clients\.claim/);
});

test('built manifest resolves every exact offline asset and contains no source archive', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'dist/asset-manifest.json'), 'utf8'));
  assert.equal(manifest.version, '7.1.1');
  assert.ok(manifest.buildId.length >= 20);
  assert.equal(manifest.files['./asset-manifest.json'], undefined, 'the manifest cannot contain a stale or self-referential digest');
  for (const asset of [...manifest.coreAssets, ...Object.values(manifest.optionalAssets).flat()]) {
    const target = path.join(root, 'dist', asset.replace(/^\.\//, ''));
    assert.equal((await stat(target)).isFile(), true, `${asset} must be a concrete file`);
  }
  const requiredPdfJsAssets = [
    './vendor/pdfjs/wasm/openjpeg.wasm',
    './vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js',
    './vendor/pdfjs/wasm/jbig2.wasm',
    './vendor/pdfjs/wasm/jbig2_nowasm_fallback.js',
    './vendor/pdfjs/wasm/qcms_bg.wasm',
    './vendor/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap',
    './vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
    './vendor/pdfjs/iccs/CGATS001Compat-v2-micro.icc'
  ];
  for (const asset of requiredPdfJsAssets) {
    assert.ok(manifest.coreAssets.includes(asset), `${asset} must be cached as a core offline asset`);
    assert.ok(manifest.files[asset]?.bytes > 0, `${asset} must be recorded in the build manifest`);
  }
  assert.equal(manifest.coreAssets.some((asset) => /quickjs-eval/.test(asset)), false);
  const topLevel = Object.keys(manifest.files);
  assert.equal(topLevel.some((name) => /(?:tests|REPORT_v|package\.json|node_modules)/.test(name)), false);
});
