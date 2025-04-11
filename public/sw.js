self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('chat-cache').then((cache) => {
      return cache.addAll([
        '/',
        '/chat',
        '/css/style.css',
        '/manifest.json',
        '/icons/app-icon.png',
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
