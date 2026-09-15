/* 오프라인 대비 — 지하철·비행기 모드에서도 암기장이 뜨게 한다. (2026-09-15)

   전략을 둘로 나눈 이유:
     · 껍데기(index·support·react·글꼴)는 바뀌는 일이 드물다 → 캐시 먼저, 갱신은 뒤에서.
     · 본문 데이터(data-*.js)는 노션 동기화가 매일 갈아끼운다 → 그물 먼저, 끊기면 캐시.
   그래서 온라인일 땐 늘 최신 본문을 보고, 끊기면 마지막으로 본 본문이 그대로 뜬다.

   ⚠ scope 는 /Core_Notes/ 다. 루트(허브)와 옆 앱들은 이 워커가 건드리지 않는다.
   ⚠ 캐시 이름을 올리면 activate 에서 옛 캐시를 지운다. 데이터 형식을 바꿀 땐 올릴 것. */

const CACHE = 'lawmj-v2';
const SCOPE = new URL('./', self.location).pathname;
const SHELL = ['./', './support.js',
               './vendor/react.production.min.js', './vendor/react-dom.production.min.js'];
const NET_TIMEOUT = 4000;

self.addEventListener('install', e => {
  // addAll 은 하나만 404 나도 통째로 실패한다 — 한 장씩 넣고 실패는 넘긴다
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 응답을 캐시에 넣는다.
// ⚠ clone() 은 「지금」 떠야 한다. caches.open() 을 기다렸다가 뜨면 그 사이 화면이 본문을
//    다 읽어 버려 body 가 잠긴다(처음에 그렇게 짜서 데이터가 한 건도 안 담겼다).
function keep(e, req, res) {
  if (!res || !(res.ok || res.type === 'opaque')) return res;
  const copy = res.clone();
  e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}));
  return res;
}

// 그물 먼저. 느리면(4초) 캐시로 갈아탄다.
function networkFirst(e, req, key) {
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => caches.match(key).then(finish), NET_TIMEOUT);
    fetch(req).then(res => {
      clearTimeout(timer);
      keep(e, key, res);
      finish(res);
    }).catch(() => {
      clearTimeout(timer);
      caches.match(key).then(hit => finish(hit || new Response(
        '오프라인입니다. 한 번이라도 연 과목은 그대로 열립니다.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
    });
  });
}

// 캐시 먼저. 화면에 즉시 내주고 갱신은 뒤에서 조용히 받아 둔다.
function cacheFirst(e, req, key) {
  return caches.match(key).then(hit => {
    const net = fetch(req).then(res => keep(e, key, res)).catch(() => hit);
    return hit || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const mine = url.origin === self.location.origin && url.pathname.startsWith(SCOPE);
  const asset = /(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/.test(url.host);
  if (!mine && !asset) return;           // 옆 앱·바깥 요청엔 끼어들지 않는다

  const nav = req.mode === 'navigate';
  const live = nav
            || /\/data-[^/]*\.js$/.test(url.pathname)
            || url.pathname === SCOPE
            || url.pathname === SCOPE + 'index.html';

  // ⚠ 화면 이동을 주소(#/민법/소멸시효)에 적기 시작했더니, 브라우저가 그 조각까지 붙은 채로
  //    문서를 요청해 해시마다 같은 HTML 이 한 벌씩 쌓였다. 더 나쁜 건 오프라인일 때
  //    「가 본 적 없는 해시」로 열면 캐시가 안 맞아 앱이 아예 안 뜨던 것. 문서는 한 자리에 담는다.
  const key = nav ? new Request(SCOPE) : req;
  e.respondWith(live ? networkFirst(e, req, key) : cacheFirst(e, req, key));
});
