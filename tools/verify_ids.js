#!/usr/bin/env node
// 새 불변식 — 「블록 id 는 사라지지 않는다」
//
// 노션이 정본이던 때는 verify_fidelity.py(raw 글자 = html 글자)가 누락을 잡았다.
// 이제 정본이 units/ 라 비교할 바깥이 없다. 대신 기준 커밋과 견준다:
//   기준에 있던 블록 id 가 지금도 전부 있는가. 숨김(x:1)도 「있는」 것으로 센다.
// 지우려면 숨기고, 정말 지울 때만 --allow-drop 을 붙인다.
//
//   node tools/verify_ids.js [기준커밋]        기본 HEAD
//
// 빠르기: 기준에서 **바뀐 파일만** 꺼내 본다(보통 한둘). 지금 쪽은 디스크에서 통으로 읽는다.
// id 가 다른 파일로 옮겨가도 잡히지 않게 하려고 「지금」은 전체를 본다.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
const BASE = args[0] || 'HEAD';
const ALLOW = process.argv.includes('--allow-drop');
const ROOT = path.join(__dirname, '..');

const idsIn = (blocks, out = new Set()) => {
  blocks.forEach(b => { if (b.w === undefined) { out.add(b.i); if (b.b) idsIn(b.b, out); } });
  return out;
};
const isUnit = f => f.endsWith('.json') && !f.endsWith('_index.json') && f.startsWith('units/');

// ⚠ -z 로 받는다. 한글 경로는 git 이 "units/\353\257\274…" 처럼 따옴표로 감싸 내보내서
//   그냥 읽으면 .json 으로 끝나지 않아 전부 걸러진다 — 게이트가 조용히 통과해 버린다.
const zlist = cmd => {
  try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 1e9 }).split('\0').filter(Boolean); }
  catch (e) { return null; }
};

function main() {
  const inBase = zlist(`git ls-tree -r --name-only -z ${BASE} -- units`);
  if (!inBase || !inBase.filter(isUnit).length) {
    console.log('기준(' + BASE + ')에 units/ 가 없다 — 첫 커밋으로 보고 통과');
    return;
  }

  // 기준 → 지금(작업트리) 사이에 바뀐 units 파일만
  const changed = (zlist(`git diff --name-only -z ${BASE} -- units`) || []).filter(isUnit);
  if (!changed.length) { console.log('기준', BASE, '이후 units/ 가 안 바뀌었다 — 통과'); return; }

  // 바뀐 파일들의 「예전」 id
  const was = new Set();
  changed.forEach(f => {
    if (!inBase.includes(f)) return;                       // 기준에 없던 새 파일
    const u = JSON.parse(execSync('git show ' + BASE + ':' + JSON.stringify(f),
      { encoding: 'buffer', maxBuffer: 1e9 }).toString('utf8'));
    idsIn(u.b, was);
  });

  // 「지금」은 전체를 본다 — id 가 다른 단원으로 옮겨갔을 수도 있다
  const now = new Set();
  const base = path.join(ROOT, 'units');
  fs.readdirSync(base).forEach(s => {
    const d = path.join(base, s);
    if (!fs.statSync(d).isDirectory()) return;
    fs.readdirSync(d).forEach(f => {
      if (!f.endsWith('.json') || f === '_index.json') return;
      idsIn(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).b, now);
    });
  });

  const gone = [...was].filter(i => !now.has(i));
  console.log('기준', BASE, '· 바뀐 단원', changed.length, '· 그 안의 옛 id', was.size.toLocaleString(),
    '· 지금 전체 id', now.size.toLocaleString());
  if (!gone.length) { console.log('✓ 사라진 id 없음'); return; }
  console.log((ALLOW ? '⚠' : '★') + ' 사라진 id ' + gone.length + '개:', gone.slice(0, 10).join(' '), gone.length > 10 ? '…' : '');
  if (!ALLOW) {
    console.log('   지울 생각이 아니면 되돌린다. 숨기려면 "x":1, 정말 지우려면 --allow-drop');
    process.exit(1);
  }
}

main();
