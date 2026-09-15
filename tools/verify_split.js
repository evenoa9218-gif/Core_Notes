// 쪼갠 데이터가 원본과 「같은 내용인가」를 기계로 대조한다.
//   node tools/verify_split.js
// 파일을 실제로 실행해 전역을 만든 뒤, 논점 하나하나를 JSON 으로 굳혀 비교한다.
// 글자 수가 아니라 글자 자체를 본다 — 한 자라도 다르면 실패다.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function load(files) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.window;
}

const PAIRS = [
  ['data-criminal.js', ['data-crim.js', 'data-crimpro.js'],
   ['CRIM_CATS_DATA', 'CRIM_GAKRON_CONCEPT', 'CRIMPRO_CATS_DATA', 'CRIMPRO_UNITS']],
  ['data-public.js', ['data-const.js', 'data-admin.js'],
   ['CONST_CATS_DATA', 'CONST_UNITS', 'ADMIN_CATS_DATA', 'ADMIN_UNITS']],
];

let bad = 0;
for (const [src, parts, keys] of PAIRS) {
  const a = load([src]), b = load(parts);
  for (const k of keys) {
    const x = JSON.stringify(a[k]), y = JSON.stringify(b[k]);
    const rows = Array.isArray(a[k]) ? a[k].length : '-';
    const chars = Array.isArray(a[k]) ? a[k].reduce((n, r) => n + (typeof r[2] === 'string' ? r[2].length : 0), 0) : 0;
    if (x === y) console.log(`  ✓ ${k.padEnd(20)} ${String(rows).padStart(4)}행  본문 ${chars.toLocaleString()}자  — 원본과 완전히 같음`);
    else { console.log(`  ✗ ${k} 다름! (원본 ${x.length}자 vs 쪼갠 것 ${y.length}자)`); bad++; }
  }
  // 옛 파일에만 있고 새 파일엔 없는 전역이 없는지
  const only = Object.keys(a).filter(k => !(k in b));
  if (only.length) { console.log('  ✗ 새 파일에서 빠진 전역:', only); bad++; }
}
console.log(bad ? `\n✗ ${bad}건 불일치` : '\n✓ 모두 일치 — 내용 손실 0');
process.exit(bad ? 1 : 0);
