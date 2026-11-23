// data-ask.js 를 만든다 — 손으로 쓴 문항 층.
//   node tools/build_ask.js
//
//   tools/ask/all.json        옛 것(2026-09) — { O·X 문항 id: 다시 쓴 문장 }
//   tools/ask/s*.json         O·X 다시 쓰기 — { 문항 id: { ask: 문장, why: 해설 } }   (같은 id 가 있으면 새 것이 이긴다)
//   tools/ask/cz*.json        빈칸 문항 — { 단원 id: [ { h: 소제목, q: '… ____ …', a: 답 } ] }
//                             이 묶음이 있는 단원은 형광펜에서 추측한 빈칸 대신 **이것만** 낸다.
//
// O·X 문항 id = 단원 id + ':' + 문항 글자의 해시. 본문이 바뀌면 그 문항의 덮어쓰기는 풀리고 원래 글자로 돌아간다
// (틀린 문장이 남는 것보다 낫다). 풀린 열쇠는 D:\_audit\quiz_audit.js 가 센다.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'ask');
const ask = JSON.parse(fs.readFileSync(path.join(DIR, 'all.json'), 'utf8'));
const why = {}, cz = {}, ox = {};
let n = 0, nc = 0, nx = 0;
fs.readdirSync(DIR).filter(f => /^s\d+.*\.json$/.test(f)).sort().forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const [id, v] of Object.entries(d)) {
    if (!v.ask || /[«»]/.test(v.ask)) throw new Error(f + ' ' + id + ' — 문장이 비었거나 가림 표시가 남았다');
    ask[id] = v.ask;
    if (v.why) why[id] = v.why;
    n++;
  }
});
fs.readdirSync(DIR).filter(f => /^cz\d+.*\.json$/.test(f)).sort().forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const [unit, list] of Object.entries(d)) {
    list.forEach(c => {
      if (!c.q || !c.a || c.q.split('____').length !== 2) throw new Error(f + ' ' + unit + ' — 빈칸은 한 문항에 하나: ' + c.q);
      // 숫자 답(「20」)은 날짜(「2021. 7. 7.」) 속에 우연히 들어 있을 수 있다 — 글자 답만 본다
      if (!/^\d+$/.test(c.a) && c.q.replace('____', '').indexOf(c.a) > -1) throw new Error(f + ' ' + unit + ' — 답이 문장에 그대로 보인다: ' + c.q);
    });
    cz[unit] = (cz[unit] || []).concat(list);
    nc += list.length;
  }
});
// tools/ask/ox*.json — 새로 지은 O·X 문항 { 단원 id: [ { h: 소제목, q: 완결된 문장, a: 'O'|'X', why: 해설 } ] }
// 본문에 (O)(X) 줄이 없는 단원(행정법)에 쓴다. 본문에서 뽑은 문항 뒤에 붙는다.
fs.readdirSync(DIR).filter(f => /^ox\d+.*\.json$/.test(f)).sort().forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const [unit, list] of Object.entries(d)) {
    const seen = new Set((ox[unit] || []).map(c => c.q));
    list.forEach(c => {
      if (!c.q || (c.a !== 'O' && c.a !== 'X') || !c.why) throw new Error(f + ' ' + unit + ' — 문장·답(O/X)·해설이 다 있어야 한다: ' + c.q);
      if (seen.has(c.q)) throw new Error(f + ' ' + unit + ' — 같은 문장이 두 번: ' + c.q);
      seen.add(c.q);
    });
    ox[unit] = (ox[unit] || []).concat(list);
    nx += list.length;
  }
});
const head = `/* 손으로 쓴 문항 층. tools/build_ask.js 가 만든다 — 손으로 고치지 말 것.
   ASK_FIX  O·X 문항을 완결된 문장으로 다시 쓴 것 · WHY_FIX 그 해설 · CZ_SET 단원별 빈칸 문항(문장 통째로 쓴 것)
   OX_SET   단원별로 새로 지은 O·X 문항(본문에 (O)(X) 줄이 없는 단원용)
   ⚠ 본문(data-*.js)은 한 글자도 건드리지 않는다. 이 파일은 문항 글자와 해설만 덮어쓴다.
   ⚠ O·X 열쇠는 문항 글자에서 뽑은 id 다 — 원문이 바뀌면 그 문항은 덮어쓰기가 풀리고
      원래 글자로 돌아간다(틀린 문장이 남는 것보다 낫다). */
`;
fs.writeFileSync(path.join(__dirname, '..', 'data-ask.js'),
  head + 'window.ASK_FIX = ' + JSON.stringify(ask) + ';\nwindow.WHY_FIX = ' + JSON.stringify(why) + ';\nwindow.CZ_SET = ' + JSON.stringify(cz) + ';\nwindow.OX_SET = ' + JSON.stringify(ox) + ';\n');
console.log('다시 쓴 O·X 문장', Object.keys(ask).length, '(새 묶음', n + ')', '· 손 해설', Object.keys(why).length, '· 빈칸 문항', nc, '(' + Object.keys(cz).length + '단원)', '· 지은 O·X', nx, '(' + Object.keys(ox).length + '단원)');
