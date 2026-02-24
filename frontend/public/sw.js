// Service Worker for PWA
const CACHE_NAME = 'engineering-pms-v2.1.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install - 缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - 网络优先策略，失败时使用缓存
self.addEventListener('fetch', (event) => {
  // 跳过非GET请求和API请求
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // API请求直接走网络
  if (url.pathname.includes('/api/') || url.hostname.includes('pocketbase')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 如果请求成功，克隆并缓存
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败，尝试从缓存获取
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 如果是导航请求，返回缓存的index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// 监听消息（用于强制更新）
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
