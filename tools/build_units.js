#!/usr/bin/env node
// data-*.js(과목 번들) → units/{과목}/{단원id}.json (정본)
//
// 1회용이 아니다 — 왕복 검증(build_bundle.js 와 짝)에 계속 쓴다.
// 하지만 「블록 id 부여」는 한 번뿐이다. 이미 units/ 가 있으면 그 id 를 그대로 되찾아 쓴다.
// 진도·오답·기출연결이 전부 id 로 붙으므로 id 가 바뀌면 기록이 끊긴다.
//
// 블록 모형
//   컨테이너  { i:id, o:"<div class=...>", b:[자식…] }      ← 블록 자식만 가진다
//   줄        { i:id, o:"<div class=...>", h:"속 HTML", k:"옛해시" }
// 조사 결과 컨테이너 안에 맨텍스트가 섞인 경우는 0건이라 이 둘로 전부 덮인다.
//
// 줄 속 inline 마크(cs-hl·cs-o·strong…)는 HTML 그대로 둔다.
// 형광펜을 오프셋 배열로 바꾸지 않는 이유: buildQuiz·buildCloze·build_examlinks 가
// 전부 그 HTML 을 읽는다. 지금 바꾸면 읽기 동작이 달라진다.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUBJ = {
  민법:   ['data-civil.js',   'CIVIL_UNITS'],
  헌법:   ['data-const.js',   'CONST_UNITS'],
  행정법: ['data-admin.js',   'ADMIN_UNITS'],
  형법:   ['data-crim.js',    'CRIM_GAKRON_CONCEPT'],
  형소:   ['data-crimpro.js', 'CRIMPRO_UNITS'],
  민소:   ['data-minso.js',   'MINSO_UNITS'],
  최판:   ['data-choipan.js', 'CHOIPAN_UNITS'],
};

// ── 파서 ──────────────────────────────────────────────────────
const BLOCK = /^(?:div|details|summary|table|tbody|thead|tr|td|th|ul|ol|li|p)$/;
const VOID  = /^(?:br|img|hr|input)$/;

function scan(inner) {
  const parts = [];
  let depth = 0, last = 0, start = -1, name = '', open = '';
  const re = /<(\/?)([a-z]+)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(inner))) {
    if (m[4] === '/' || VOID.test(m[2])) continue;
    if (m[1] !== '/') {
      if (depth === 0) {
        const t = inner.slice(last, m.index);
        if (t) parts.push({ text: t });
        start = m.index; name = m[2]; open = m[0];
      }
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        parts.push({ name, open, inner: inner.slice(start + open.length, re.lastIndex - (m[2].length + 3)) });
        last = re.lastIndex;
      }
    }
  }
  const t = inner.slice(last);
  if (t) parts.push({ text: t });
  return parts;
}
const hasBlockChild = p => p.some(x => x.name && BLOCK.test(x.name));

// ── 앱과 같은 해시 (index.html 의 hash32 · keyOf) ──────────────
function hash32(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const stripTags = s => (s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const keyOf = t => hash32((t || '').replace(/\s+/g, ''));

// ── 블록 id ───────────────────────────────────────────────────
// 내용 + 위치로 뽑되, 겹치면 꼬리를 붙인다. 한 번 정해지면 영원히 그 값이다.
function mkId(unitId, pathStr, html, used) {
  let base = hash32(unitId + '|' + pathStr + '|' + html).slice(0, 8);
  let id = base, n = 1;
  while (used.has(id)) id = base + '-' + (++n);
  used.add(id);
  return id;
}

function toBlocks(html, unitId, used, oldById) {
  const walk = (inner, pathStr) => scan(inner).map((p, idx) => {
    // 블록 사이의 공백(전 과목 통틀어 줄바꿈 12개)은 그대로 보존한다 — 왕복이 글자까지 같아야 한다.
    // 공백이 아닌 맨텍스트가 섞이면 이 모형으로 못 담으므로 멈춘다 (조사 결과 0건).
    if (!p.name) {
      if (p.text.trim()) throw new Error(unitId + ': 블록 사이에 맨텍스트 — ' + JSON.stringify(p.text.slice(0, 60)));
      return { w: p.text };
    }
    const here = pathStr + '/' + idx + p.name;
    // 번들이 이미 id 를 달고 있으면(2단계 이후) 그걸 그대로 쓴다 — 경로가 아니라 id 가 정본이다.
    const carried = (/ data-i="([^"]+)"/.exec(p.open) || [])[1];
    if (carried) { p.open = p.open.replace(/ data-i="[^"]+"/, ''); used.add(carried); }
    const kids = scan(p.inner);
    if (hasBlockChild(kids)) {
      const b = walk(p.inner, here);
      return { i: carried || pickId(unitId, here, p.open, used, oldById), o: p.open, b };
    }
    const node = { i: carried || pickId(unitId, here, p.open + p.inner, used, oldById), o: p.open, h: p.inner };
    const k = keyOf(stripTags(p.open + p.inner + '</' + p.name + '>'));
    if (k) node.k = k;
    return node;
  });
  return walk(html, '');
}

// 이미 부여된 id 를 되찾는다 — 옛 해시(k)가 같은 줄이 있으면 그 id 를 쓴다
function pickId(unitId, pathStr, html, used, oldByPath) {
  const prev = oldByPath && oldByPath.get(pathStr);
  if (prev && !used.has(prev)) { used.add(prev); return prev; }
  return mkId(unitId, pathStr, html, used);
}

function flattenPaths(blocks, out = new Map(), pathStr = '') {
  blocks.forEach((b, idx) => {
    if (b.w !== undefined) return;
    const name = /^<([a-z]+)/.exec(b.o)[1];
    const here = pathStr + '/' + idx + name;
    out.set(here, b.i);
    if (b.b) flattenPaths(b.b, out, here);
  });
  return out;
}

// ── 직렬화 ────────────────────────────────────────────────────
// 블록 하나가 한 줄이다. 줄 하나를 고치면 diff 도 한 줄이 된다 —
// 앱이 단원 파일을 통째로 커밋하므로 이게 이력의 가독성을 정한다.
// (JSON.stringify(…, null, 1) 은 블록 하나를 6줄로 흩어 놓아 diff 를 못 읽는다.)
function dumpUnit(u) {
  const lines = [];
  const walk = (blocks, ind) => blocks.forEach((b, i) => {
    const pad = ' '.repeat(ind), tail = i === blocks.length - 1 ? '' : ',';
    if (b.w !== undefined) return lines.push(pad + JSON.stringify(b) + tail);
    if (!b.b) return lines.push(pad + JSON.stringify(b) + tail);
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

// ── 실행 ──────────────────────────────────────────────────────
function main() {
  const window = {};
  for (const [, [file]] of Object.entries(SUBJ))
    eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));

  let units = 0, blocks = 0, reused = 0;
  const report = [];
  // ⚠ 저장소 전체에서 유일해야 한다. 단원마다 새 Set 을 쓰면 8자 해시가 겹칠 때
  //    서로 다른 줄이 같은 id 를 갖는다 — 실제로 형소022 와 형소115 가 겹쳤다.
  const used = new Set();

  for (const [subj, [file, key]] of Object.entries(SUBJ)) {
    const rows = window[key];
    if (!rows) throw new Error(subj + ': ' + key + ' 를 못 찾았다');
    const dir = path.join(ROOT, 'units', subj);
    fs.mkdirSync(dir, { recursive: true });

    const catsKey = key.replace(/_(UNITS|GAKRON_CONCEPT)$/, '') +
      (key === 'CIVIL_UNITS' ? '_UNITS_CATS' : '_CATS_DATA');
    const cats = window[catsKey] || [];

    let n = 0, bn = 0;
    rows.forEach(row => {
      const [id, title, html, tg, lv, cat] = row;
      const file = path.join(dir, id + '.json');
      let oldByPath = null;
      if (fs.existsSync(file)) {
        const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
        oldByPath = flattenPaths(prev.b);
      }
      const before = used.size;
      const b = toBlocks(html, id, used, oldByPath);
      if (oldByPath) reused += [...used].filter(x => [...oldByPath.values()].includes(x)).length;
      const unit = { id, t: title, cat: cat, lv: lv || 1, tg: tg || [], b };
      fs.writeFileSync(file, dumpUnit(unit), 'utf8');
      n++; bn += used.size - before;
    });

    fs.writeFileSync(path.join(dir, '_index.json'),
      JSON.stringify({ subj, key, catsKey, cats, order: rows.map(r => r[0]) }, null, 1), 'utf8');

    units += n; blocks += bn;
    report.push([subj, n, bn]);
  }

  report.forEach(([s, n, b]) => console.log(s.padEnd(4), String(n).padStart(4) + '단원', String(b).padStart(6) + '블록'));
  console.log('─'.repeat(32));
  console.log('합계'.padEnd(4), String(units).padStart(4) + '단원', String(blocks).padStart(6) + '블록',
    reused ? '  (되찾은 id ' + reused + ')' : '  (id 최초 부여)');
}

if (require.main === module) main();
module.exports = { scan, hasBlockChild, hash32, stripTags, keyOf, dumpUnit };
