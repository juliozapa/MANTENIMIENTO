/* Service worker: funciona sin conexión (pantallas) y muestra los avisos. */
const CACHE = 'mant-v29';
const SHELL = ['./', 'index.html', 'panel.html', 'app.js', 'logo.png', 'simbolo.png', 'logo-blanco.png', 'logo-color.png', 'icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Primero la red (para tener siempre la última versión); si no hay conexión, la copia guardada.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copia = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// Avisos que envía el servidor a través de Firebase Cloud Messaging
self.addEventListener('push', e => {
  let d = {};
  try { const j = e.data.json(); d = j.data || j.notification || j; } catch (err) {}
  const title = d.title || 'Mantenimiento';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'badge-72.png',
    tag: d.tag || undefined,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope) && 'navigate' in w) return w.navigate(url).then(x => x && x.focus());
    return self.clients.openWindow(url);
  }));
});
