const CACHE_PREFIX = 'rutas-pasto-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v4`;
// No guardar HTML dinámico con nonces CSP ni datos de una sesión anterior.
const SHELL_ASSETS = ['/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // No borrar cachés de otras aplicaciones que compartan el origen.
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname.startsWith('/_next/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cachedResponse = event.request.mode === 'navigate'
        ? await caches.match('/offline.html') : undefined;
      return cachedResponse ?? new Response('Sin conexión disponible.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })
  );
});
