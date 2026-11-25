// Offline cache for the app shell. YouTube and fonts always go to the network.
const CACHE = 'leo-v2';
const SHELL = ['./', 'index.html', 'core.js', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/tv') return; // the Fire TV app download: let the browser follow the redirect itself
  // Network first so updates arrive; fall back to cache when offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (!res.ok || res.type !== 'basic') return res; // never cache redirects or errors
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy)).catch((err) => console.warn('[LEO sw] cache put failed', err));
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))));
});
