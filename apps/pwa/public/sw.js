// public/sw.js
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');
if (self.workbox) {
  workbox.core.clientsClaim();
  workbox.precaching.cleanupOutdatedCaches();
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages',
      networkTimeoutSeconds: 3,
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 604800 })],
    })
  );
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'script' || request.destination === 'style',
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'static-resources' })
  );
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'images',
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 2592000 })],
    })
  );
  workbox.routing.registerRoute(
    ({ url }) => url.origin.startsWith('https://fonts.googleapis.com') || url.origin.startsWith('https://fonts.gstatic.com'),
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'google-fonts' })
  );
}
