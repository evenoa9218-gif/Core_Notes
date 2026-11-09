/**
 * 암기장 본문 쓰기 프록시.
 *
 * 2026-11-05부터 본문의 정본은 노션이 아니라 이 저장소의 `units/` 다.
 * 앱에서 줄을 고치면 그게 `units/{과목}/{단원}.json` 으로 커밋돼야 하는데,
 * 앱은 GitHub Pages 에 정적으로 올라가고 **저장소가 public** 이라
 * 쓰기 토큰을 브라우저에 둘 수가 없다. 그래서 토큰은 이 Worker 의 secret 에만 두고,
 * 앱은 여기로 바뀐 단원을 보낸다.
 *
 * ── 여기가 마지막 방어선이다 ─────────────────────────────────
 * 노션이 정본이던 때는 `verify_fidelity.py`(raw 글자 = html 글자)가 누락을 잡았고,
 * 무엇이 잘못돼도 노션에 원본이 남아 있었다. 이제 그 바깥이 없다.
 * CI 의 `verify_ids.js` 는 커밋이 **된 뒤에** 도는 그물이라, 쓰기 자체를 막지는 못한다.
 * 그래서 같은 검사를 여기서 먼저 한다:
 *   ① 경로는 units/{아는 과목}/{단원id}.json 만
 *   ② 모양 검사 — id·제목·블록이 있고 블록마다 i 와 o 가 있는가
 *   ③ **블록 id 는 사라지지 않는다** — 지금 올라가 있는 파일의 id 가 전부 남아 있는가
 *   ④ 글자가 한 번에 20% 넘게 줄면 멈추고 되묻는다
 * ③·④ 를 넘기려면 앱이 뜻을 분명히 밝혀야 한다(allowDrop / confirmShrink).
 *
 * 한 번 부르면 **커밋 하나**다. 단원 여러 개를 한꺼번에 보낼 수 있다 —
 * 읽기 세션 하나가 커밋 수십 개를 남기면 이력을 못 읽는다.
 */

// 앱이 배포된 곳. 여기서 온 요청만 받는다.
const ALLOWED_ORIGINS = [
  'https://evenoa9218-gif.github.io',
  'http://localhost:8765',
  'http://localhost:8766',
];

const OWNER = 'evenoa9218-gif';
const REPO = 'Core_Notes';
const BRANCH = 'main';
const API = 'https://api.github.com';

// 경로에 들어갈 값이라 형식을 먼저 좁힌다.
const SUBJECTS = ['민법', '헌법', '행정법', '형법', '형소', '민소', '최판'];
const UNIT_RE = /^[가-힣A-Za-z0-9][가-힣A-Za-z0-9_-]{0,30}$/;

// 한 번에 보낼 수 있는 양. 단원 하나가 가장 큰 것이 34,000자(민법)라 넉넉히 잡는다.
const MAX_UNITS = 40;
const MAX_BYTES = 4 * 1024 * 1024;
// 글자가 이 비율보다 더 줄면 되묻는다
const SHRINK_LIMIT = 0.2;

// ── 작은 도구들 ────────────────────────────────────────────────
function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (origin, body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) },
});
const bad = (origin, status, why, detail) => json(origin, { ok: false, why, detail }, status);

// GitHub 이 주는 base64 를 글자로 되돌린다.
// ⚠ atob 만 쓰면 안 된다 — 바이트 문자열이 나와서 한글 한 글자가 3글자로 보인다.
//   그러면 「글자가 20% 넘게 줄었다」가 저장할 때마다 잘못 뜬다(시험에서 −80%로 잡혔다).
const fromB64 = s => new TextDecoder().decode(
  Uint8Array.from(atob(String(s).replace(/\s/g, '')), c => c.charCodeAt(0)));

// 비밀번호 비교는 길이와 상관없이 같은 시간이 걸리게 한다
// 단원을 적는 틀 — tools/build_units.js 의 dumpUnit 과 **글자 하나까지 같아야 한다.**
// 한 줄에 블록 하나다. JSON.stringify 로 통째 한 줄을 쓰면 단원 전체가 한 줄이라
// git diff 가 「20줄 지우고 1줄 더함」으로만 보여서, 무엇이 바뀌었는지 못 읽는다.
// 정본의 이력을 사람이 읽을 수 있는 것이 이 체계의 마지막 안전망이다.
function dumpUnit(u) {
  const lines = [];
  const walk = (blocks, ind) => blocks.forEach((b, i) => {
    const pad = ' '.repeat(ind), tail = i === blocks.length - 1 ? '' : ',';
    if (b.w !== undefined || !b.b) return lines.push(pad + JSON.stringify(b) + tail);
    lines.push(pad + '{"i":' + JSON.stringify(b.i) + ',"o":' + JSON.stringify(b.o) + ',"b":[');
    walk(b.b, ind + 1);
    lines.push(pad + ']}' + tail);
  });
  lines.push('{"id":' + JSON.stringify(u.id) + ',"t":' + JSON.stringify(u.t) +
    ',"cat":' + JSON.stringify(u.cat) + ',"lv":' + u.lv +
    ',"tg":' + JSON.stringify(u.tg) + ',"b":[');
  walk(u.b, 1);
  lines.push(']}');
  return lines.join('\n') + '\n';
}

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function gh(env, path, init = {}) {
  const r = await fetch(API + path, {
    ...init,
    headers: {
      'Authorization': 'Bearer ' + env.GH_TOKEN,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'core-notes-writer',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = { raw: text.slice(0, 400) }; }
  if (!r.ok) {
    const err = new Error('GitHub ' + r.status + ' ' + (body && body.message || ''));
    err.status = r.status; err.body = body;
    throw err;
  }
  return body;
}

// ── 단원 검사 ──────────────────────────────────────────────────
const txtLen = h => (h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().length;

function walk(blocks, fn, where = 'b') {
  if (!Array.isArray(blocks)) throw new Error(where + ' 가 배열이 아니다');
  blocks.forEach((b, i) => {
    const at = where + '[' + i + ']';
    if (!b || typeof b !== 'object') throw new Error(at + ' 가 객체가 아니다');
    if (b.w !== undefined) {                       // 블록 사이 공백
      if (typeof b.w !== 'string' || b.w.trim()) throw new Error(at + '.w 는 공백 문자열이어야 한다');
      return;
    }
    if (typeof b.i !== 'string' || !b.i) throw new Error(at + ' 에 블록 id(i) 가 없다');
    if (typeof b.o !== 'string' || !/^<[a-z]+[^>]*>$/.test(b.o)) throw new Error(at + '.o 가 여는 태그가 아니다');
    fn(b, at);
    if (b.b !== undefined) walk(b.b, fn, at + '.b');
    else if (typeof b.h !== 'string') throw new Error(at + ' 는 잎인데 h 가 없다');
  });
}

function inspect(unit) {
  if (!unit || typeof unit !== 'object') throw new Error('단원이 객체가 아니다');
  if (typeof unit.id !== 'string' || !unit.id) throw new Error('id 가 없다');
  if (typeof unit.t !== 'string') throw new Error('제목(t) 이 없다');
  const ids = new Set();
  let chars = 0, n = 0;
  walk(unit.b, (b, at) => {
    if (ids.has(b.i)) throw new Error(at + ' 의 블록 id 가 겹친다 — ' + b.i);
    ids.add(b.i); n++;
    if (b.h !== undefined) chars += txtLen(b.h);
  });
  return { ids, chars, n };
}

// ── 본문 ───────────────────────────────────────────────────────
async function save(env, origin, req) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.units) || !body.units.length)
    return bad(origin, 400, '보낼 단원이 없다');
  if (body.units.length > MAX_UNITS)
    return bad(origin, 400, '한 번에 ' + MAX_UNITS + '단원까지');

  // ① 경로 — 아는 과목, 아는 꼴의 단원 id 만. 파일 이름이 단원의 id 와 같아야 한다.
  const files = [];
  for (const u of body.units) {
    if (!u || !SUBJECTS.includes(u.subj)) return bad(origin, 400, '모르는 과목', u && u.subj);
    if (!UNIT_RE.test(String(u.id || ''))) return bad(origin, 400, '단원 id 가 이상하다', u && u.id);
    let now;
    try { now = inspect(u.unit); }                 // ② 모양
    catch (e) { return bad(origin, 400, u.id + ' 의 모양이 틀렸다', e.message); }
    if (now.ids.size === 0) return bad(origin, 400, u.id + ' 에 블록이 하나도 없다');
    if (u.unit.id !== u.id) return bad(origin, 400, '파일 이름과 단원 id 가 다르다', u.id + ' vs ' + u.unit.id);
    files.push({ path: 'units/' + u.subj + '/' + u.id + '.json', unit: u.unit, now });
  }

  const text = files.map(f => f.text = dumpUnit(f.unit)).join('');
  if (text.length > MAX_BYTES) return bad(origin, 413, '너무 크다');

  // ③④ 지금 올라가 있는 것과 견준다.
  const warn = [];
  for (const f of files) {
    let prev = null;
    try {
      const got = await gh(env, `/repos/${OWNER}/${REPO}/contents/${encodeURI(f.path)}?ref=${BRANCH}`);
      prev = JSON.parse(fromB64(got.content));
    } catch (e) {
      if (e.status !== 404) throw e;               // 새 단원이면 견줄 것이 없다
    }
    if (!prev) continue;
    const was = inspect(prev);
    const gone = [...was.ids].filter(i => !f.now.ids.has(i));
    if (gone.length && !body.allowDrop)
      return json(origin, {
        ok: false, why: 'id 가 사라진다', detail: f.path,
        gone: gone.slice(0, 20), goneCount: gone.length,
        hint: '지울 생각이면 블록에 "x":1 을 달아 숨기고, 정말 지우려면 allowDrop 을 켠다',
      }, 409);
    const shrink = was.chars ? (was.chars - f.now.chars) / was.chars : 0;
    if (shrink > SHRINK_LIMIT && !body.confirmShrink)
      return json(origin, {
        ok: false, why: '글자가 많이 줄어든다', detail: f.path,
        before: was.chars, after: f.now.chars, pct: Math.round(shrink * 100),
        hint: '맞으면 confirmShrink 를 켠다',
      }, 409);
    if (shrink > 0.05) warn.push(f.path + ' −' + Math.round(shrink * 100) + '%');
  }

  // ── 커밋 하나로 묶는다 ──────────────────────────────────────
  // Contents API 는 파일마다 커밋이 하나씩 생긴다. 읽기 세션 하나가 커밋 수십 개를
  // 남기면 이력을 못 읽으므로 Git Data API 로 트리를 직접 짠다.
  const msg = (typeof body.message === 'string' && body.message.trim().slice(0, 200))
    || ('암기장: ' + files.map(f => f.unit.id).join(', ') + ' 수정');

  const commit = async () => {
    const ref = await gh(env, `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    const head = ref.object.sha;
    const base = await gh(env, `/repos/${OWNER}/${REPO}/git/commits/${head}`);
    const blobs = [];
    for (const f of files) {
      const b = await gh(env, `/repos/${OWNER}/${REPO}/git/blobs`, {
        method: 'POST', body: JSON.stringify({ content: f.text, encoding: 'utf-8' }),
      });
      blobs.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
    }
    const tree = await gh(env, `/repos/${OWNER}/${REPO}/git/trees`, {
      method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree: blobs }),
    });
    // 바뀐 것이 없으면 빈 커밋을 남기지 않는다
    if (tree.sha === base.tree.sha) return { head, sha: null, same: true };
    const made = await gh(env, `/repos/${OWNER}/${REPO}/git/commits`, {
      method: 'POST', body: JSON.stringify({ message: msg, tree: tree.sha, parents: [head] }),
    });
    await gh(env, `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH', body: JSON.stringify({ sha: made.sha, force: false }),
    });
    return { head, sha: made.sha };
  };

  // CI 가 번들을 커밋해 가지가 움직였을 수 있다 — 한 번은 다시 해 본다
  let out;
  try { out = await commit(); }
  catch (e) {
    if (e.status !== 422 && e.status !== 409) throw e;
    out = await commit();
  }

  return json(origin, {
    ok: true, same: !!out.same, sha: out.sha,
    units: files.map(f => ({ path: f.path, blocks: f.now.n, chars: f.now.chars })),
    warn,
  });
}

// 지금 저장소에 있는 그대로의 단원.
// ⚠ 앱이 Pages(/units/…)에서 읽으면 안 된다 — 배포가 1~2분 늦어서, 연달아 저장하면
//   두 번째 저장이 **첫 번째 수정이 없는 옛 파일**을 바탕으로 커밋해 앞 수정을 지운다.
//   여기는 GitHub API 를 바로 보므로 늘 최신이다.
async function unit(env, origin, url) {
  const subj = url.searchParams.get('subj'), id = url.searchParams.get('id');
  if (!SUBJECTS.includes(subj) || !UNIT_RE.test(String(id || '')))
    return bad(origin, 400, '과목이나 단원 id 가 이상하다');
  const path = 'units/' + subj + '/' + id + '.json';
  try {
    const got = await gh(env, `/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`);
    return json(origin, { ok: true, unit: JSON.parse(fromB64(got.content)) });
  } catch (e) {
    if (e.status === 404) return bad(origin, 404, '그런 단원이 없다', path);
    throw e;
  }
}

// 이 단원의 이력 — 되돌리기용
async function history(env, origin, url) {
  const subj = url.searchParams.get('subj'), id = url.searchParams.get('id');
  if (!SUBJECTS.includes(subj) || !UNIT_RE.test(String(id || '')))
    return bad(origin, 400, '과목이나 단원 id 가 이상하다');
  const path = 'units/' + subj + '/' + id + '.json';
  const sha = url.searchParams.get('sha');
  if (sha) {
    if (!/^[0-9a-f]{7,40}$/.test(sha)) return bad(origin, 400, 'sha 가 이상하다');
    const got = await gh(env, `/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${sha}`);
    return json(origin, { ok: true, unit: JSON.parse(fromB64(got.content)) });
  }
  const list = await gh(env, `/repos/${OWNER}/${REPO}/commits?path=${encodeURIComponent(path)}&per_page=30`);
  return json(origin, {
    ok: true, path,
    commits: list.map(c => ({ sha: c.sha, at: c.commit.author.date, msg: c.commit.message.split('\n')[0] })),
  });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === '/health') return json(origin, { ok: true, repo: OWNER + '/' + REPO });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return bad(origin, 403, '허용되지 않은 출처', origin);

    // 비밀번호. 새어도 피해가 units/ 안이고 git 이력으로 전부 되돌아온다 —
    // 쓰기 토큰 자체를 브라우저에 두지 않는 것이 요점이다.
    const auth = request.headers.get('Authorization') || '';
    if (!env.APP_PASSWORD || !sameSecret(auth.replace(/^Bearer\s+/i, ''), env.APP_PASSWORD))
      return bad(origin, 401, '비밀번호가 다르다');

    if (env.WRITE_LIMIT) {
      const ip = request.headers.get('CF-Connecting-IP') || 'x';
      const { success } = await env.WRITE_LIMIT.limit({ key: ip });
      if (!success) return bad(origin, 429, '잠시 뒤에 다시');
    }

    try {
      if (request.method === 'POST' && url.pathname === '/save') return await save(env, origin, request);
      if (request.method === 'GET' && url.pathname === '/unit') return await unit(env, origin, url);
      if (request.method === 'GET' && url.pathname === '/history') return await history(env, origin, url);
      return bad(origin, 404, '없는 길');
    } catch (e) {
      return bad(origin, e.status === 403 ? 403 : 502, 'GitHub 쪽에서 막혔다', String(e.message || e).slice(0, 300));
    }
  },
};
