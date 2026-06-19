/* Kickoff service worker — deliberately conservative.
 *
 * Its only job is to (a) satisfy PWA installability (a fetch handler must exist)
 * and (b) provide an offline fallback for the static shell. It must NEVER serve
 * stale HTML or API data: overview.html sends no-cache headers and all game data
 * is live from Supabase, so navigations and /api/* always go to the network.
 */
// Relative URLs resolve against the SW's own location, so the same file works
// at the site root (Vercel) and under a subpath (GitHub Pages /M/).
const CACHE = 'kickoff-shell-v2';
const SHELL = [
  './css/styles.css',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations (HTML) and API calls: network-only, never cached. Fall back to a
  // cached shell asset only if the network is unavailable (best-effort offline).
  if (req.mode === 'navigate' || (sameOrigin && url.pathname.startsWith('/api/'))) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Static same-origin assets: cache-first, then populate the cache in the background.
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit)
      )
    );
  }
  // Cross-origin (fonts, Supabase, etc.): leave to the network/browser.
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'Kickoff', body: event.data.text() }; }
  const title   = payload.title || 'Kickoff';
  const options = {
    body:               payload.body || 'New notification',
    icon:               './assets/icons/icon-192.png',
    badge:              './assets/icons/icon-192.png',
    data:               { url: payload.url || './betting.html' },
    requireInteraction: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './betting.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const target = new URL(targetUrl, self.location.origin);
      for (const win of wins) {
        if (new URL(win.url).pathname === target.pathname && 'focus' in win) return win.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
