self.addEventListener('install', (e) => {
    e.waitUntil(
      caches.open('chat-cache').then((cache) => {
        return cache.addAll([
          '/',
          '/chat',
          '/css/style.css',
          '/js/main.js',
          '/manifest.json'
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
  