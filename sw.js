// Çevrimdışı çalışma: uygulama dosyalarını önbelleğe alır. Yeni sürüm
// yayınlarken VERSION değerini artırın; kullanıcıya "Yenile" seçeneği çıkar.
const VERSION = 'zeko-foto-v0.4.2';

// Yapay zekâ çalıştırıcısı ve modelleri büyük olduğu için kurulumda değil,
// ilk kullanımda önbelleğe alınır ve uygulama sürümü değişince silinmez.
// Model dosyaları değişirse bu adı değiştirin.
const AI_CACHE = 'zeko-foto-ai-v1';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/export.js',
  './js/history.js',
  './js/image-io.js',
  './js/stamp.js',
  './js/store.js',
  './js/ui.js',
  './js/viewer.js',
  './js/ai/depth.js',
  './js/ai/faces.js',
  './js/ai/runtime.js',
  './js/core/auto.js',
  './js/core/color.js',
  './js/core/exif.js',
  './js/core/geometry.js',
  './js/core/presets.js',
  './js/core/vision.js',
  './js/gl/engine.js',
  './js/gl/shaders.js',
  './js/tools/adjust.js',
  './js/tools/crop.js',
  './js/tools/filters.js',
  './js/widgets/curve.js',
  './js/widgets/slider.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== AI_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'activate') self.skipWaiting();
});

// Model ve çalıştırıcı: önce önbellek, yoksa indirip saklar.
function aiFile(req) {
  return caches.open(AI_CACHE).then(async (cache) => {
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
}

// Önce önbellek: uygulama ağ olmadan da açılır. Gezinme istekleri her zaman
// önbellekteki index.html ile karşılanır.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  if (/\/(vendor|models)\//.test(url.pathname)) {
    event.respondWith(aiFile(req));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
