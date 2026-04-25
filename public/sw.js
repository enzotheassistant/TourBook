const VERSION = 'tourbook-v2';
const APP_SHELL_CACHE = `${VERSION}-app-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const DATA_CACHE = `${VERSION}-data`;
const OFFLINE_URL = '/offline';
const APP_SHELL_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon?size=192',
  '/icon?size=512',
  '/apple-icon',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await Promise.allSettled(APP_SHELL_URLS.map(async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        await cache.put(url, response);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/api/dates')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('Network unavailable');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const networkResponse = await networkPromise;
  return networkResponse || Response.error();
}
