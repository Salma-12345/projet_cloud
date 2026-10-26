/* Service worker : application installable (PWA), cache hors ligne de l'interface, notifications push. */
const CACHE = 'ecole-v1';
const COQUILLE = ['/', '/manifest.webmanifest', '/icones/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(COQUILLE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Les données (API) ne sont jamais mises en cache : elles restent toujours à jour.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copie = r.clone();
          caches.open(CACHE).then((c) => c.put('/', copie));
          return r;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icones/')) {
    e.respondWith(
      caches.match(req).then(
        (enCache) =>
          enCache ||
          fetch(req).then((r) => {
            if (r.ok) {
              const copie = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copie));
            }
            return r;
          })
      )
    );
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { titre: 'École', contenu: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.titre || 'Nouvelle notification', {
      body: d.contenu || '',
      icon: '/icones/icon-192.png',
      badge: '/icones/badge-72.png',
      lang: 'fr',
      data: { lien: d.lien || '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const lien = (e.notification.data && e.notification.data.lien) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if ('focus' in f) {
          f.navigate(lien).catch(() => {});
          return f.focus();
        }
      }
      return self.clients.openWindow(lien);
    })
  );
});
