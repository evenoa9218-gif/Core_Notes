// data-ask.js 를 만든다 — O·X 문항을 완결된 문장으로 다시 쓴 것(ASK_FIX)과 손으로 쓴 해설(WHY_FIX).
//   node tools/build_ask.js
//
//   tools/ask/all.json        옛 것(2026-09) — { 문항 id: 다시 쓴 문장 }
//   tools/ask/s*.json         새 것 — { 문항 id: { ask: 문장, why: 해설 } }   (같은 id 가 있으면 새 것이 이긴다)
//
// 문항 id = 단원 id + ':' + 문항 글자의 해시. 본문이 바뀌면 그 문항의 덮어쓰기는 풀리고 원래 글자로 돌아간다
// (틀린 문장이 남는 것보다 낫다). 풀린 열쇠는 D:\_audit\quiz_audit.js 가 센다.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'ask');
const ask = JSON.parse(fs.readFileSync(path.join(DIR, 'all.json'), 'utf8'));
const why = {};
let n = 0;
fs.readdirSync(DIR).filter(f => /^s\d+.*\.json$/.test(f)).sort().forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const [id, v] of Object.entries(d)) {
    if (!v.ask || /[«»]/.test(v.ask)) throw new Error(f + ' ' + id + ' — 문장이 비었거나 가림 표시가 남았다');
    ask[id] = v.ask;
    if (v.why) why[id] = v.why;
    n++;
  }
});
const head = `/* 문장으로 다시 쓴 O·X 문항과 손으로 쓴 해설. tools/build_ask.js 가 만든다 — 손으로 고치지 말 것.
   원문이 「[사안] 계약 해제」처럼 줄임말이라, 그대로는 무엇을 묻는지 알 수 없는 문항이 많다.
   ⚠ 본문(data-*.js)은 한 글자도 건드리지 않는다. 이 파일은 문항 글자와 해설만 덮어쓴다.
   ⚠ 열쇠는 문항 글자에서 뽑은 id 다 — 원문이 바뀌면 그 문항은 덮어쓰기가 풀리고
      원래 글자로 돌아간다(틀린 문장이 남는 것보다 낫다). */
`;
fs.writeFileSync(path.join(__dirname, '..', 'data-ask.js'),
  head + 'window.ASK_FIX = ' + JSON.stringify(ask) + ';\nwindow.WHY_FIX = ' + JSON.stringify(why) + ';\n');
console.log('다시 쓴 문장', Object.keys(ask).length, '(새 묶음', n + ')', '· 손 해설', Object.keys(why).length);
