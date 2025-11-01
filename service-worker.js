const CACHE_NAME = 'sos-pwa-cache-v1';
const urlsToCache = [
    './', // 快取根目錄 (index.html)
    'index.html',
    'manifest.json',
    'images/icon-192.png',
    'images/icon-512.png',
    // 如果有其他 CSS 或 JS 檔案，請在此處加入
];

// 安裝事件：將所有核心資產加入快取
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// 啟用事件：清理舊的快取版本
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 擷取事件：攔截網路請求並從快取中提供服務
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 快取命中 - 返回快取中的資源
                if (response) {
                    return response;
                }
                
                // 快取未命中 - 執行網路請求
                return fetch(event.request);
            })
    );
});