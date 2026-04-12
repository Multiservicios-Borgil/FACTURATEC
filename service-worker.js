/* ===================================================
   service-worker.js – Caché offline para PWA
   =================================================== */

const CACHE_NAME = 'facturatec-v1';
const ASSETS = [
  './index.html',
  './css/main.css',
  './css/print.css',
  './js/data.js',
  './js/invoices.js',
  './js/print.js',
  './js/app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700&display=swap',
];

// Instalación: cachear assets esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: servir desde caché, fallback a red
self.addEventListener('fetch', event => {
  // Solo interceptar peticiones de la misma origen o assets conocidos
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cachear recursos nuevos dinámicamente
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Si falla la red y no hay caché, devolver página offline si existe
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
