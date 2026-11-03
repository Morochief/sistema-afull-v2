/* global self, caches, fetch, URL */
/* Service worker mínimo de aFull: que "En la calle" abra sin señal.
 * - Navegación (páginas): primero la red; sin red, el index.html guardado (la app es una sola página).
 * - /assets/* (con hash en el nombre, nunca cambian): primero la caché.
 * - /api/*: NUNCA se cachea (datos con sesión; lo sin señal lo maneja la cola de la app).
 */
const CACHE = 'afull-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/index.html')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          if (r.ok) caches.open(CACHE).then((c) => c.put('/index.html', copia));
          return r;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            const copia = r.clone();
            if (r.ok) caches.open(CACHE).then((c) => c.put(req, copia));
            return r;
          })
      )
    );
  }
});
