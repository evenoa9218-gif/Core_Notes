/* 오프라인 대비 — 지하철·비행기 모드에서도 암기장이 뜨게 한다. (2026-09-15)

   전략을 둘로 나눈 이유:
     · 껍데기(index·support·react·글꼴)는 바뀌는 일이 드물다 → 캐시 먼저, 갱신은 뒤에서.
     · 본문 데이터(data-*.js)는 노션 동기화가 매일 갈아끼운다 → 그물 먼저, 끊기면 캐시.
   그래서 온라인일 땐 늘 최신 본문을 보고, 끊기면 마지막으로 본 본문이 그대로 뜬다.

   ⚠ scope 는 /Core_Notes/ 다. 루트(허브)와 옆 앱들은 이 워커가 건드리지 않는다.
   ⚠ 캐시 이름을 올리면 activate 에서 옛 캐시를 지운다. 데이터 형식을 바꿀 땐 올릴 것. */

// v3 — 데이터 파일을 과목별로 갈랐다(data-criminal/public → crim/crimpro/const/admin).
// 이름을 올려 옛 캐시에 남은 합본 4MB 를 activate 에서 지운다.
const CACHE = 'lawmj-v93';  // v93: O·X 다시 쓰기 — 형사소송법 형소064~072 (107문항) · v92: O·X 다시 쓰기 — 형사소송법 형소056~063 (90문항) · v91: O·X 다시 쓰기 — 형사소송법 형소049~055 (106문항) · v90: O·X 다시 쓰기 — 형사소송법 형소040~048 (92문항) · v89: O·X 다시 쓰기 — 형사소송법 형소030~039 (90문항) · v88: O·X 다시 쓰기 — 형사소송법 형소015~029 (127문항) · v87: O·X 다시 쓰기 — 형사소송법 형소001~014 (80문항) · v86: O·X 다시 쓰기 — 형법 끝(국가014~021, 형법 923문항 완료) · v85: O·X 다시 쓰기 — 형법각론 국가적 법익 국가001~013 (82문항) · v84: O·X 다시 쓰기 — 형법각론 사회적 법익(사회001~013, 89문항) · v83: O·X 다시 쓰기 — 형법각론 개인적 법익 끝(개인065~076, 92문항) · v82: O·X 다시 쓰기 — 형법각론 개인054~064 (83문항) · v81: O·X 다시 쓰기 — 형법각론 개인043~053 (80문항) · v80: O·X 다시 쓰기 — 형법각론 개인033~042 (91문항) · v79: O·X 다시 쓰기 — 형법각론 개인021~032 (77문항) · v78: O·X 다시 쓰기 — 형법각론 개인010~020 (95문항) · v77: O·X 다시 쓰기 — 형법 형총041~059·각론 개인001~009 (96문항) · v76: O·X 다시 쓰기 — 형법총론 형총001~035 (68문항) · v75: O·X 다시 쓰기 — 민사소송법 끝(민소043~060, 민소 722문항 완료) · v74: O·X 다시 쓰기 — 민사소송법 민소039~042 (41문항) · v73: O·X 다시 쓰기 — 민사소송법 민소037·038 (36문항) · v72: O·X 다시 쓰기 — 민사소송법 민소031~036 (56문항) · v71: O·X 다시 쓰기 — 민사소송법 민소028~030 (59문항) · v70: O·X 다시 쓰기 — 민사소송법 민소026·027 (61문항) · v69: O·X 다시 쓰기 — 민사소송법 민소020~025 (92문항) · v68: O·X 다시 쓰기 — 민사소송법 민소018·019 (55문항) · v67: O·X 다시 쓰기 — 민사소송법 민소014~017 (73문항) · v66: O·X 다시 쓰기 — 민사소송법 민소007~013 (125문항) · v65: O·X 다시 쓰기 — 민사소송법 민소001~006 (77문항) · v64: 행정법 O·X 견본 — 강성민 「비례의 원칙」 15문항(본문에 ○✕ 줄이 없는 단원에 새로 지은 문항을 붙이는 층) · v63: O·X 다시 쓰기 — 민법 끝(물권71·72, 민법 1,181문항 완료) · v62: O·X 다시 쓰기 — 물권법 물권69·70 (161문항) · v61: O·X 다시 쓰기 — 물권법 물권66~68 (89문항) · v60: O·X 다시 쓰기 — 물권법 물권53~65 (88문항) · v59: O·X 다시 쓰기 — 민법총칙 끝(민총19 소멸시효 162문항) · v58: O·X 다시 쓰기 — 민법총칙 민총13~17 (161문항) · v57: O·X 다시 쓰기 — 민법총칙 민총6~12 (93문항) · v56: 민법 빈칸 — 물권법 끝(물권60~72), 민법 72단원 1,066문항 완료 · v55: 민법 빈칸 — 물권법 물권53~59 (7단원) · v54: 민법 빈칸 — 민법총칙 끝(민총13~19), 채권·총칙 52단원 완료 · v53: 민법 빈칸 — 민법총칙 민총1~12 (12단원) · v52: 민법 빈칸 — 채권각론 끝(채각47~52), 채권 편 33단원 완료 · v51: 민법 빈칸 — 채권각론 채각37~46 (10단원 149문항) · v50: O·X 다시 쓰기 — 민법총칙 민총1·3·4·5 (33문항) · v49: O·X 다시 쓰기 — 채권각론 끝(채각38~52, 153문항) · v48: 민법 빈칸 — 채총35·36 반영(앞 판에서 빠짐) · v47: 민법 빈칸 다시 쓰기 — 채권총론 17단원(문장 통째 빈칸 250개, 단원당 15~20개·중요한 것 위주) · v46: O·X 다시 쓰기 — 채권총론 끝(채총28~35, 26문항) · v45: O·X 다시 쓰기 — 채권총론 채총20·22·23·25·26 (46문항) · v44: 빈칸 문항 견본(채총21) — 문장 통째로 쓴 빈칸 21개, 같은 카드 글 없음 · v43: 형법(반반형법) 요약 줄마다 「원문」 펼침 — 책 지면처럼(○ 내어쓰기·파란 꼬리표·밑줄) · 원문 도구를 책 설정으로 일반화 · 민법 단원 파일을 정본 꼴(블록당 한 줄)로 되돌림 · v42: 강성민 행정법 원문 상자를 책 지면처럼 — 쪽 표시·번호 내어쓰기·회색 상자·파란 ○✕ · v41: O·X 문항 다시 쓰기 견본(민총2·채총21 — 완결된 문장 + 손 해설) · v40: 판례 O·X 를 카드로(본문과 다른 바탕) · 문항의 가림 표시·보충 상자 머리글·빗금 조각 정리 · v39: 진도 단추(완료·약점)를 알약 모양·제 색으로 — 하는 일 단추와 구분 · v38: 폰 단원 도구줄을 네 칸 격자로(폭·높이 통일, 윗줄 하는 일 · 아랫줄 진도) · v37: 민법 원문 상자를 책 지면처럼(문단·들여쓰기·굵은 글씨·자주색·요사 딱지), 목차만 붙던 줄 고침 · v36: 민법(로민정) 요약 줄마다 「원문」 펼침 — 원문은 누를 때 따로 받음 · v35: 강성민 행정법 — 원문 사건번호 오타 11곳 지면대로 교정 · v34: 강성민 행정법 맞춤요약 p512~535 — 대상 1,031항목 전부 끝 · v33: 강성민 행정법 맞춤요약 p477~511 (누계 32묶음) · v32: 강성민 행정법 맞춤요약 p454~476 (누계 30묶음) · v31: 강성민 행정법 맞춤요약 p416~454 (누계 28묶음) · v30: 강성민 행정법 맞춤요약 p388~415 (누계 26묶음) · v29: 강성민 행정법 맞춤요약 p349~387 (누계 24묶음) · v28: 강성민 행정법 맞춤요약 p302~348 (누계 22묶음) · v27: 강성민 행정법 맞춤요약 p273~302 (누계 20묶음) · v26: 강성민 행정법 맞춤요약 p246~272 (누계 18묶음) · v25: 강성민 행정법 맞춤요약 p203~246 (누계 15묶음) · v24: 강성민 행정법 맞춤요약 p140~202 (누계 12묶음) · v23: 강성민 행정법 맞춤요약 p73~140 (누계 234항목) · v22: 강성민 행정법 맞춤요약(요약 본문 + 「원문」 펼침) 첫 묶음 · v21: 본문 양쪽 맞춤(글자 단위 줄바꿈) · v20: 강성민 행정법 단권화 노트 제목 다섯 단계·문단 나눔 · v19: 강성민 행정법 단권화 노트 글자 교정(다수결 + 지면 대조) · v18: 강성민 행정법 단권화 노트를 지면 구조대로 다시 세움(항목·상자·밑줄·✕○) · v17: 강성민 행정법에 인강 채점기준표 16건
const SCOPE = new URL('./', self.location).pathname;
const SHELL = ['./', './manifest.json', './support.js',
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
    // ⚠ 그냥 fetch(req) 를 쓰면 브라우저의 HTTP 캐시가 먼저 답한다. GitHub Pages 는
    //    max-age=600 을 주므로 배포한 지 10분이 안 됐으면 옛 화면이 그대로 뜬다
    //    (실제로 이번에 밟았다 — 새 빌드를 올렸는데 폰 화면이 안 바뀌었다).
    //    no-cache 는 서버에 물어보게만 할 뿐 몸통을 매번 받지는 않는다(보통 304).
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
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
