/**
 * TUJUANE Service Worker (v4)
 * Pre-caches application shell, icons, and essential assets.
 * Purges old caches to ensure the new app icon displays on all installed web apps.
 */

const CACHE_NAME = 'tujuane-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.log('SW cache skip:', url, err))
        )
      );
    })
  );
  // Force active service worker immediately without waiting for old instances
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging legacy PWA cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network-first for manifest and app icons to guarantee newest icon is served
  if (
    url.pathname.includes('manifest.json') ||
    url.pathname.includes('icon') ||
    url.pathname.includes('apple-touch-icon') ||
    url.pathname.includes('favicon')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For navigation requests (loading the HTML page)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // Stale-while-revalidate for general assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (
                url.origin === location.origin ||
                url.hostname.includes('googleapis.com') ||
                url.hostname.includes('gstatic.com')
              ) {
                cache.put(event.request, clone);
              }
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Notification click handler: Focuses or opens the TUJUANE app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Push notification event listener with new PWA app icon
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: 'TUJUANE Kenya Community',
        body: event.data.text()
      };
    }
  } else {
    data = {
      title: 'TUJUANE Kenya Community',
      body: 'You have a new message or community update.'
    };
  }

  const title = data.title || 'TUJUANE Kenya Community';
  const options = {
    body: data.body || 'You have new activity waiting for you on TUJUANE.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || `tujuane_${Date.now()}`,
    renotify: true,
    vibrate: [200, 100, 200],
    data: data.data || { url: '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
