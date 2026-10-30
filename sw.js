// 앱 화면은 저장해 두고(오프라인 사용), data.json은 항상 새로 받아오되 실패하면 저장본 사용
const CACHE = 'econ-v5';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'data.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;  // 실시간 서버 요청은 그대로 통과
  if (url.pathname.endsWith('data.json') || url.pathname.endsWith('config.json')) {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(url.pathname.endsWith('config.json') ? 'config.json' : 'data.json', cp)); return r; })
      .catch(() => caches.match(url.pathname.endsWith('config.json') ? 'config.json' : 'data.json')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
