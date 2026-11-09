const VERSION = __CM_VERSION__;
const BUILD_ID = __CM_BUILD_ID__;
const CACHE_PREFIX = 'comment-master-';
const CORE_CACHE = `${CACHE_PREFIX}core-${VERSION}-${BUILD_ID}`;
const OPTIONAL_CACHE = `${CACHE_PREFIX}optional-${VERSION}-${BUILD_ID}`;
const CORE_ASSETS = Object.freeze(__CM_CORE_ASSETS__);
const OPTIONAL_ASSETS = Object.freeze(__CM_OPTIONAL_ASSETS__);
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

  // Versioned CSS/JS URLs bypass a waiting older worker's cache-first responses.
  // Within the current worker they use the same verified, precached file bytes.
  const versionedBaseUrl = url.search === `?v=${VERSION}` ? `${url.origin}${url.pathname}` : null;
  const isCore = CORE_URLS.has(request.url) || Boolean(versionedBaseUrl && CORE_URLS.has(versionedBaseUrl));
  const isOptional = OPTIONAL_URLS.has(request.url);
  if (!isCore && !isOptional) return;

  event.respondWith((async () => {
    const cacheName = isCore ? CORE_CACHE : OPTIONAL_CACHE;
    const cacheKey = versionedBaseUrl && CORE_URLS.has(versionedBaseUrl) ? versionedBaseUrl : request.url;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    return fetchAndStore(cacheName, request, cacheKey);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && ['CLEAR_OPTIONAL_CACHE', 'CLEAR_OPTIONAL_CACHES'].includes(event.data.type)) {
    event.waitUntil(caches.delete(OPTIONAL_CACHE));
  }
});
