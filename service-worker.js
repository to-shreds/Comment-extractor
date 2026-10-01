const VERSION = "7.1.1";
const BUILD_ID = "5d8251752eae0ee36cb45d76";
const CACHE_PREFIX = 'comment-master-';
const CORE_CACHE = `${CACHE_PREFIX}core-${VERSION}-${BUILD_ID}`;
const OPTIONAL_CACHE = `${CACHE_PREFIX}optional-${VERSION}-${BUILD_ID}`;
const CORE_ASSETS = Object.freeze([
  "./index.html",
  "./manifest.webmanifest",
  "./asset-manifest.json",
  "./assets/workbench.css",
  "./assets/workbench.js",
  "./assets/workbench-core.mjs",
  "./assets/pdf-engine.mjs",
  "./vendor/pdfjs/pdf.mjs",
  "./vendor/pdfjs/pdf.worker.mjs",
  "./vendor/pdf-lib/pdf-lib.esm.min.js",
  "./vendor/marked/marked.esm.js",
  "./vendor/dompurify/purify.es.mjs",
  "./vendor/pdfjs/cmaps/78-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/78-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/78-H.bcmap",
  "./vendor/pdfjs/cmaps/78-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/78-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/78-V.bcmap",
  "./vendor/pdfjs/cmaps/78ms-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/78ms-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/83pv-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90ms-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90ms-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/90msp-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90msp-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/90pv-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90pv-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Add-H.bcmap",
  "./vendor/pdfjs/cmaps/Add-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/Add-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Add-V.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-3.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-4.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-5.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-6.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-3.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-4.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-5.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-3.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-4.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-5.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-6.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Korea1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Korea1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Korea1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/B5-H.bcmap",
  "./vendor/pdfjs/cmaps/B5-V.bcmap",
  "./vendor/pdfjs/cmaps/B5pc-H.bcmap",
  "./vendor/pdfjs/cmaps/B5pc-V.bcmap",
  "./vendor/pdfjs/cmaps/CNS-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/CNS-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/CNS1-H.bcmap",
  "./vendor/pdfjs/cmaps/CNS1-V.bcmap",
  "./vendor/pdfjs/cmaps/CNS2-H.bcmap",
  "./vendor/pdfjs/cmaps/CNS2-V.bcmap",
  "./vendor/pdfjs/cmaps/ETHK-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/ETHK-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/ETen-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/ETen-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/ETenms-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/ETenms-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/Ext-H.bcmap",
  "./vendor/pdfjs/cmaps/Ext-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/Ext-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Ext-V.bcmap",
  "./vendor/pdfjs/cmaps/GB-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GB-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GB-H.bcmap",
  "./vendor/pdfjs/cmaps/GB-V.bcmap",
  "./vendor/pdfjs/cmaps/GBK-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBK-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GBK2K-H.bcmap",
  "./vendor/pdfjs/cmaps/GBK2K-V.bcmap",
  "./vendor/pdfjs/cmaps/GBKp-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBKp-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GBT-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBT-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GBT-H.bcmap",
  "./vendor/pdfjs/cmaps/GBT-V.bcmap",
  "./vendor/pdfjs/cmaps/GBTpc-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBTpc-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/GBpc-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/GBpc-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/H.bcmap",
  "./vendor/pdfjs/cmaps/HKdla-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKdla-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKdlb-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKdlb-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKgccs-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKgccs-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKm314-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKm314-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKm471-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKm471-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/HKscs-B5-H.bcmap",
  "./vendor/pdfjs/cmaps/HKscs-B5-V.bcmap",
  "./vendor/pdfjs/cmaps/Hankaku.bcmap",
  "./vendor/pdfjs/cmaps/Hiragana.bcmap",
  "./vendor/pdfjs/cmaps/KSC-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/KSC-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/KSC-H.bcmap",
  "./vendor/pdfjs/cmaps/KSC-Johab-H.bcmap",
  "./vendor/pdfjs/cmaps/KSC-Johab-V.bcmap",
  "./vendor/pdfjs/cmaps/KSC-V.bcmap",
  "./vendor/pdfjs/cmaps/KSCms-UHC-H.bcmap",
  "./vendor/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap",
  "./vendor/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap",
  "./vendor/pdfjs/cmaps/KSCms-UHC-V.bcmap",
  "./vendor/pdfjs/cmaps/KSCpc-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/KSCpc-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/Katakana.bcmap",
  "./vendor/pdfjs/cmaps/NWP-H.bcmap",
  "./vendor/pdfjs/cmaps/NWP-V.bcmap",
  "./vendor/pdfjs/cmaps/RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Roman.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniCNS-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniGB-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniKS-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/V.bcmap",
  "./vendor/pdfjs/cmaps/WP-Symbol.bcmap",
  "./vendor/pdfjs/standard_fonts/FoxitDingbats.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitFixed.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSerif.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb",
  "./vendor/pdfjs/standard_fonts/FoxitSymbol.pfb",
  "./vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf",
  "./vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf",
  "./vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf",
  "./vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf",
  "./vendor/pdfjs/iccs/CGATS001Compat-v2-micro.icc",
  "./vendor/pdfjs/wasm/jbig2.wasm",
  "./vendor/pdfjs/wasm/jbig2_nowasm_fallback.js",
  "./vendor/pdfjs/wasm/openjpeg.wasm",
  "./vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js",
  "./vendor/pdfjs/wasm/qcms_bg.wasm"
]);
const OPTIONAL_ASSETS = Object.freeze([
  "./vendor/tesseract/tesseract.esm.min.js",
  "./vendor/tesseract/worker.min.js",
  "./vendor/tesseract/lang/eng.traineddata.gz",
  "./vendor/tesseract/core/tesseract-core.wasm.js",
  "./vendor/tesseract/core/tesseract-core.wasm",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm",
  "./vendor/tesseract/core/tesseract-core-simd.wasm.js",
  "./vendor/tesseract/core/tesseract-core-simd.wasm",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm",
  "./vendor/tesseract/core/tesseract-core-relaxedsimd.wasm.js",
  "./vendor/tesseract/core/tesseract-core-relaxedsimd.wasm",
  "./vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm",
  "./vendor/mammoth/mammoth.browser.min.js"
]);
const CORE_URLS = new Set(CORE_ASSETS.map((asset) => new URL(asset, self.registration.scope).href));
const OPTIONAL_URLS = new Set(OPTIONAL_ASSETS.map((asset) => new URL(asset, self.registration.scope).href));
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

function canStore(response) {
  return response.ok && response.status === 200 && response.type === 'basic' && !response.headers.has('Content-Range');
}

async function fetchAndStore(cacheName, request, cacheKey = request.url) {
  const response = await fetch(new Request(request, { cache: 'reload' }));
  if (!canStore(response)) throw new Error(`Refusing to cache ${request.url}: HTTP ${response.status}`);
  const cache = await caches.open(cacheName);
  await cache.put(cacheKey, response.clone());
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const results = await Promise.allSettled(CORE_ASSETS.map(async (asset) => {
      const url = new URL(asset, self.registration.scope).href;
      const request = new Request(url, { cache: 'reload', credentials: 'same-origin' });
      await fetchAndStore(CORE_CACHE, request, url);
    }));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      await caches.delete(CORE_CACHE);
      throw failure.reason;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && ![CORE_CACHE, OPTIONAL_CACHE].includes(key))
      .map((key) => caches.delete(key)));
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('Range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      try {
        return await fetch(new Request(request, { cache: 'no-store' }));
      } catch (error) {
        const fallback = await (await caches.open(CORE_CACHE)).match(INDEX_URL);
        if (fallback) return fallback;
        throw error;
      }
    })());
    return;
  }

  const isCore = CORE_URLS.has(request.url);
  const isOptional = OPTIONAL_URLS.has(request.url);
  if (!isCore && !isOptional) return;

  event.respondWith((async () => {
    const cacheName = isCore ? CORE_CACHE : OPTIONAL_CACHE;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request.url);
    if (cached) return cached;
    return fetchAndStore(cacheName, request, request.url);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && ['CLEAR_OPTIONAL_CACHE', 'CLEAR_OPTIONAL_CACHES'].includes(event.data.type)) {
    event.waitUntil(caches.delete(OPTIONAL_CACHE));
  }
});
