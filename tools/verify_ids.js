#!/usr/bin/env node
// 새 불변식 — 「블록 id 는 사라지지 않는다」
//
// 노션이 정본이던 때는 verify_fidelity.py(raw 글자 = html 글자)가 누락을 잡았다.
// 이제 정본이 units/ 라 비교할 바깥이 없다. 대신 직전 커밋을 기준으로 본다:
//   전 커밋에 있던 블록 id 가 지금도 전부 있는가. 숨김(x:1)도 「있는」 것으로 센다.
// 지우려면 숨기고, 정말 지울 때는 --allow-drop 을 붙인다.
//
//   node tools/verify_ids.js [기준커밋]        기본 HEAD

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) || 'HEAD';
const ALLOW = process.argv.includes('--allow-drop');
const ROOT = path.join(__dirname, '..');

const idsIn = (blocks, out = new Set()) => {
  blocks.forEach(b => { if (b.w === undefined) { out.add(b.i); if (b.b) idsIn(b.b, out); } });
  return out;
};

function fromGit(ref) {
  let list;
  try { list = execSync(`git ls-tree -r --name-only ${ref} -- units`, { encoding: 'utf8', maxBuffer: 1e9 }); }
  catch (e) { return null; }
  const ids = new Set();
  list.split('\n').filter(f => f.endsWith('.json') && !f.endsWith('_index.json')).forEach(f => {
    const u = JSON.parse(execSync(`git show ${ref}:"${f}"`, { encoding: 'buffer', maxBuffer: 1e9 }).toString('utf8'));
    idsIn(u.b, ids);
  });
  return ids;
}

function fromDisk() {
  const ids = new Set();
  const base = path.join(ROOT, 'units');
  if (!fs.existsSync(base)) return ids;
  fs.readdirSync(base).forEach(s => {
    fs.readdirSync(path.join(base, s)).forEach(f => {
      if (!f.endsWith('.json') || f === '_index.json') return;
      idsIn(JSON.parse(fs.readFileSync(path.join(base, s, f), 'utf8')).b, ids);
    });
  });
  return ids;
}

const before = fromGit(BASE);
if (!before || !before.size) { console.log('기준(' + BASE + ')에 units/ 가 없다 — 첫 커밋으로 보고 통과'); process.exit(0); }
const now = fromDisk();
const gone = [...before].filter(i => !now.has(i));

console.log('기준', BASE, before.size.toLocaleString() + '개 → 지금', now.size.toLocaleString() + '개');
if (!gone.length) { console.log('✓ 사라진 id 없음'); process.exit(0); }
console.log((ALLOW ? '⚠' : '★') + ' 사라진 id ' + gone.length + '개:', gone.slice(0, 10).join(' '), gone.length > 10 ? '…' : '');
if (!ALLOW) console.log('   지울 생각이 아니면 되돌린다. 정말 지우려면 --allow-drop');
process.exit(ALLOW ? 0 : 1);
