// 민법 본문의 【…】 표시 중 기출 연결기가 못 읽는 것을 뽑는다.  node tools/audit_labels.js
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('data-examlinks.js', 'utf8'));
const RE = new RegExp(window.EXAM_LABEL_SRC, 'g');
const plain = fs.readFileSync('data-civil.js', 'utf8').replace(/<[^>]*>/g, '');
const NOT_EXAM = /^(암기|判例|大判全合|통판|통|최판|조문|Note |목차암기|주의|예외|민소|판례|재항변|CF )/;
const seen = new Map();
for (const m of plain.matchAll(/【([^】]{0,30})】/g)) {
  const b = m[1];
  if (!seen.has(b)) { RE.lastIndex = 0; const h = RE.exec('【' + b + '】'); seen.set(b, { n: 0, hit: h ? h[0] : null }); }
  seen.get(b).n++;
}
console.log('— 기출 표시로 보이는데 못 읽는 것');
[...seen].filter(([b, v]) => !v.hit && !NOT_EXAM.test(b)).forEach(([b, v]) => console.log('  ' + v.n + '  【' + b + '】'));
console.log('— 읽히지만 표시 전체를 다 먹지 못한 것(뒤가 잘림)');
[...seen].filter(([b, v]) => v.hit && v.hit.replace(/[【】]/g, '').trim() !== b.trim()).forEach(([b, v]) => console.log('  ' + v.n + '  【' + b + '】 → "' + v.hit + '"'));
