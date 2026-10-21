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
