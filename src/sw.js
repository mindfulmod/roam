// Tandem Roads offline helper (service worker). It lets the app open with no signal, which a
// trip in Japan will have plenty of: in the metro, on a mountain, on a plane.
//   - the page shell and the app's code are kept when they first arrive (named by version)
//   - city details and photos are kept the first time they load, so a city you looked at once
//     opens again offline; the log page fetches your trip's cities ahead of time
//   - pages are asked of the network first, so a new version arrives as soon as there is signal
// Only this site's own files are kept. Map tiles and other sites are left to the browser.
const VERSION = '__VERSION__';
const CORE = __CORE__;
const SHELL = 'tr-shell-' + VERSION;
const KEEP = 'tr-files';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys())
        if (k.startsWith('tr-shell-') && k !== SHELL) await caches.delete(k);
      // Older versions of the app code are never asked for again.
      const keep = await caches.open(KEEP);
      for (const r of await keep.keys())
        if (/\/(app|data)\.[0-9a-f]+\.js$/.test(r.url)) await keep.delete(r);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (e) => {
  const r = e.request,
    url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r).catch(
        async () => (await caches.match('index.html', { cacheName: SHELL })) || Response.error(),
      ),
    );
    return;
  }
  e.respondWith(
    (async () => {
      const hit = await caches.match(r, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(r);
      if (
        res.ok &&
        /\/(city|images)\/|\.(js|json|webp|jpe?g|png|svg|webmanifest)$/.test(url.pathname)
      )
        (await caches.open(KEEP)).put(r, res.clone()).catch(() => {});
      return res;
    })(),
  );
});
