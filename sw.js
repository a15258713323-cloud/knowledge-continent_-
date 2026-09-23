/* ============================================================================
 * Service Worker —— 离线缓存
 *
 * 策略选择（重要）：
 *   采用「网络优先，失败回退缓存」，而不是「缓存优先」。
 *   原因：这个应用的内容会不断更新（新关卡包 + 新版本），缓存优先会让用户
 *   一直看到旧版本。网络优先在有网时总是拿最新，断网时用缓存兜底，
 *   两个目标都满足。
 * ========================================================================== */

const VERSION = 'kc-v1.0.4';
const STATIC_CACHE = `${VERSION}-static`;
const PACK_CACHE = `${VERSION}-pack`;

/**
 * 预缓存清单。
 *
 * 关卡包同时列出两个候选路径：
 *   本地开发时文件在  game/ 与 packs/ 两个目录下 → ../packs/
 *   部署到 Pages 时文件都在仓库根目录            → ./packs/
 * 不存在的那个会 add 失败，下面用 catch 忽略掉，不影响整体。
 */
const STATIC_ASSETS = [
  './',
  './index.html',
  './icon.svg',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/theme.js',
  './js/data.js',
  './js/render.js',
  './js/judge.js',
  './js/engine.js',
  './js/ui.js',
  './js/views-onboard.js',
  './js/views-map.js',
  './js/views-stage.js',
  './js/views-study.js',
  './js/views-quiz.js',
  './js/views-result.js',
  './js/views-graph.js',
  './js/views-wrong.js',
  './js/views-profile.js',
  './js/views-achievements.js',
  './js/views-settings.js',
  './js/views-cheatsheet.js',
  './packs/levels.json',
  './packs/manifest.json',
  '../packs/levels.json',
  '../packs/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => Promise.all(
        STATIC_ASSETS.map((u) => c.add(u).catch(() => {
          console.warn('[SW] 预缓存失败（忽略）', u);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * 安全写入缓存。
 * 注意：Cache API 不允许缓存 mode === 'navigate' 的 Request（会抛 TypeError），
 * 因此导航请求改用 url 字符串作为 key，避免未捕获的 Promise 异常。
 */
function safePut(cacheName, req, res) {
  if (!res || res.status !== 200) return;
  const key = req.mode === 'navigate' ? req.url : req;
  const copy = res.clone();
  caches.open(cacheName)
    .then((c) => c.put(key, copy))
    .catch(() => { /* 缓存失败不影响页面 */ });
}

/** 网络优先，失败回退缓存；成功后顺手更新缓存 */
function networkFirst(req, cacheName) {
  return fetch(req)
    .then((res) => {
      safePut(cacheName, req, res);
      return res;
    })
    .catch(() => caches.match(req).then((hit) => {
      if (hit) return hit;
      if (req.mode === 'navigate') {
        return caches.match(req.url).then((h2) => h2 || caches.match('./index.html'));
      }
      return new Response('', { status: 504, statusText: 'Offline' });
    }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨域（大模型接口等）一律不介入
  if (url.origin !== location.origin) return;

  // 关卡包：网络优先
  if (/\/packs\/(levels|manifest)\.json$/.test(url.pathname)) {
    e.respondWith(networkFirst(req, PACK_CACHE));
    return;
  }

  // 图标：极少变动，缓存优先（离线时立刻可用）
  if (/icon\.svg$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // 其它同源资源（html/css/js）：网络优先，保证更新立即生效
  e.respondWith(networkFirst(req, STATIC_CACHE));
});
