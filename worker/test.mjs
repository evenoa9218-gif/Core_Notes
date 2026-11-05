// 워커의 「마지막 방어선」이 실제로 막는지 — GitHub 은 가짜로 세워 둔다.
//   cp worker/src/index.js worker/src/index.mjs && node worker/test.mjs && rm worker/src/index.mjs
//
// (노드는 .js 를 CommonJS 로 보려 들어서 export default 를 못 읽는다.
//  wrangler 는 .js 그대로 ESM 으로 다루므로 소스 확장자는 건드리지 않는다.)
import worker from './src/index.js';

const ORIGIN = 'https://evenoa9218-gif.github.io';
const PW = 'test-pw';

// 저장소에 이미 올라가 있다고 치는 단원
const BEFORE = {
  id: '채총20', t: '일반론', cat: '채권총론 · 제1장 서설', lv: 1, tg: [],
  b: [
    { i: 'aaa', o: '<div class="cs-h">', h: 'Ⅰ. 의의' },
    { i: 'bbb', o: '<div class="cs-li">', h: '채권은 특정인이 특정인에게 특정 행위를 청구하는 권리다. 아주 긴 설명이 여기 들어간다.' },
    { i: 'ccc', o: '<div class="cs-li cs-bul">', h: '청구력·급부보유력·강제력이 있다. 이것도 제법 길게 적혀 있는 줄이다.' },
  ],
};
const clone = o => JSON.parse(JSON.stringify(o));

// 가짜 GitHub
let captured = null;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
  if (u.includes('/contents/')) {
    // 채총20 만 이미 올라가 있다고 친다. 채총21 은 새 단원이라 404 —
    // 아무 경로에나 같은 단원을 돌려주면 새 단원이 「id 가 사라진다」로 잘못 막힌다.
    if (!u.includes('20.json')) return ok({ message: 'Not Found' }, 404);
    return ok({ content: btoa(unescape(encodeURIComponent(JSON.stringify(BEFORE)))) });
  }
  if (u.includes('/git/ref/heads/')) return ok({ object: { sha: 'head1' } });
  if (u.includes('/git/commits/head1')) return ok({ tree: { sha: 'tree0' } });
  if (u.includes('/git/blobs')) return ok({ sha: 'blob1' });
  if (u.includes('/git/trees')) { captured = JSON.parse(init.body); return ok({ sha: 'tree1' }); }
  if (u.includes('/git/commits')) return ok({ sha: 'commit1' });
  if (u.includes('/git/refs/heads/')) return ok({});
  return ok({ message: 'not found' }, 404);
};

const env = { GH_TOKEN: 'x', APP_PASSWORD: PW };
const call = (path, body, method = 'POST', pw = PW) => worker.fetch(new Request('https://w.dev' + path, {
  method, headers: { Origin: ORIGIN, Authorization: 'Bearer ' + pw, 'Content-Type': 'application/json' },
  body: method === 'POST' ? JSON.stringify(body) : undefined,
}), env, {});

const send = (unit, extra = {}) => call('/save', { units: [{ subj: '민법', id: unit.id, unit }], ...extra });

let pass = 0, fail = 0;
async function check(name, res, want) {
  const body = await res.json();
  const got = res.status;
  const good = got === want;
  console.log((good ? '  ✓ ' : '  ★ ') + name.padEnd(42) + got + (good ? '' : ' (바란 것 ' + want + ')')
    + (body.why ? '  — ' + body.why : ''));
  good ? pass++ : fail++;
  return body;
}

console.log('① 경로');
await check('모르는 과목', await call('/save', { units: [{ subj: '상법', id: 'x', unit: BEFORE }] }), 400);
await check('이상한 단원 id (../)', await call('/save', { units: [{ subj: '민법', id: '../../index', unit: BEFORE }] }), 400);
await check('파일 이름과 단원 id 가 다름', await call('/save', { units: [{ subj: '민법', id: '채총21', unit: BEFORE }] }), 400);

console.log('② 모양');
await check('블록에 id 가 없다', await send(Object.assign(clone(BEFORE), { b: [{ o: '<div>', h: 'x' }] })), 400);
await check('여는 태그가 아니다', await send(Object.assign(clone(BEFORE), { b: [{ i: 'q', o: '그냥 글', h: 'x' }] })), 400);
await check('블록 id 중복', await send(Object.assign(clone(BEFORE), {
  b: [{ i: 'aaa', o: '<div>', h: 'x' }, { i: 'aaa', o: '<div>', h: 'y' }] })), 400);
await check('블록이 하나도 없다', await send(Object.assign(clone(BEFORE), { b: [] })), 400);

console.log('③ id 가 사라지지 않는다');
{
  const u = clone(BEFORE); u.b.splice(1, 1);
  const b = await check('줄을 지우면 막는다', await send(u), 409);
  console.log('     사라지는 id:', (b.gone || []).join(','));
  await check('allowDrop 을 켜면 통과', await send(u, { allowDrop: true, confirmShrink: true }), 200);
  const hidden = clone(BEFORE); hidden.b[1].x = 1;
  await check('숨김(x:1) 은 그냥 통과', await send(hidden), 200);
}

console.log('④ 글자가 많이 줄면 되묻는다');
{
  const u = clone(BEFORE); u.b[1].h = '짧게';
  const b = await check('−20% 넘으면 멈춘다', await send(u), 409);
  console.log('     ' + b.before + ' → ' + b.after + ' 자 (−' + b.pct + '%)');
  await check('confirmShrink 를 켜면 통과', await send(u, { confirmShrink: true }), 200);
}

console.log('그 밖');
await check('비밀번호가 다르면', await call('/save', { units: [] }, 'POST', 'wrong-pw'), 401);
await check('/health 는 비밀번호 없이', await call('/health', null, 'GET', ''), 200);
{
  const r = await worker.fetch(new Request('https://w.dev/save', {
    method: 'POST', headers: { Origin: 'https://evil.example', Authorization: 'Bearer ' + PW },
    body: '{}' }), env, {});
  await check('다른 출처에서 오면', r, 403);
}
{
  const u2 = clone(BEFORE); u2.id = '채총21'; u2.b.forEach(b => b.i += '2');
  const r = await call('/save', { units: [
    { subj: '민법', id: '채총20', unit: clone(BEFORE) },
    { subj: '민법', id: '채총21', unit: u2 }] });
  const b = await check('단원 둘을 보내면 커밋 하나', r, 200);
  console.log('     올린 파일:', (captured.tree || []).map(t => t.path).join(' + '));
}

console.log('\n' + (fail ? '★ ' + fail + '건 실패' : '✓ ' + pass + '건 전부 통과'));
process.exit(fail ? 1 : 0);
