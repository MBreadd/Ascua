const CACHE = 'ascua-v1';

const LOCAL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const EXTERNO = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(LOCAL).catch(() => {});
    await Promise.all(EXTERNO.map(u =>
      fetch(u, { mode: 'cors' }).then(r => c.put(u, r)).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET') return;
  ev.respondWith((async () => {
    const hit = await caches.match(ev.request, { ignoreSearch: false });
    if (hit) return hit;
    try {
      const res = await fetch(ev.request);
      if (res && res.ok && res.type === 'basic') {
        const c = await caches.open(CACHE);
        c.put(ev.request, res.clone());
      }
      return res;
    } catch (e) {
      const fb = await caches.match('./index.html');
      return fb || Response.error();
    }
  })());
});
