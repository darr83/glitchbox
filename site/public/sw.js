// Minimal service worker: makes GlitchBox installable and keeps the app shell usable offline.
// Always tries the network first, so updates show up straight away.
const CACHE = 'gb-shell-v2';
const SHELL = ['/', '/style.css', '/app.js', '/vendor/fflate.min.js', '/manifest.webmanifest', '/icons/icon-192.png', '/brand/logo-word.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/^\/(api|play|media)\//.test(url.pathname)) return; // never cache live data or games
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && SHELL.includes(url.pathname)) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); }
      return r;
    }).catch(() => caches.match(e.request.mode === 'navigate' ? '/' : url.pathname))
  );
});
