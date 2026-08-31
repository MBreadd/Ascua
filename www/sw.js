const CACHE = 'ascua-v16';

const LOCAL = [
  './',
  './index.html',
  './app.js',
  './streak.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './pdf.min.js',
  './pdf.worker.min.js',
  './fonts/eb-garamond-400.woff2',
  './fonts/eb-garamond-500.woff2',
  './fonts/hanken-grotesk-300.woff2',
  './fonts/hanken-grotesk-400.woff2',
  './fonts/hanken-grotesk-500.woff2',
  './fonts/hanken-grotesk-600.woff2'
];

const EXTERNO = [];

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
    const url = new URL(ev.request.url);
    const esInterfaz = url.origin === self.location.origin &&
      (ev.request.mode === 'navigate' || /\.(?:html|js|css)$/.test(url.pathname));

    if (esInterfaz) {
      try {
        const res = await fetch(ev.request);
        if (res && res.ok) {
          const c = await caches.open(CACHE);
          c.put(ev.request, res.clone());
        }
        return res;
      } catch (e) {
        const hit = await caches.match(ev.request, { ignoreSearch: false });
        return hit || (await caches.match('./index.html')) || Response.error();
      }
    }

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
