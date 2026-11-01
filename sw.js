/* Service worker: cache offline dell'app (alzare CACHE a ogni release). */
const CACHE = 'magazzino-v7';
const FILES = ['./', './index.html', './app.js', './core.js', './importa.js', './leggi.js', './github.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
const LIB = 'https://cdnjs.cloudflare.com/'; // pdf.js e SheetJS: caricati solo quando si importa un file, poi tenuti in cache
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.url.startsWith(LIB)) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; }))); return; }
  if (u.origin !== location.origin) return; // api.github.com: sempre in rete
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
