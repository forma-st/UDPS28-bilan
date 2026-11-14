/* Service worker : met l'application en cache pour un fonctionnement 100 % hors ligne. */
const CACHE = 'fiche-bilan-v1.0.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/schema.js', './js/report.js', './js/app.js',
  './js/vendor/jspdf.umd.min.js', './js/vendor/html2canvas.min.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;               // les envois API ne passent pas par le cache
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
