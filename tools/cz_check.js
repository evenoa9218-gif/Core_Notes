// 빈칸 묶음(tools/ask/cz*.json) 점검 — 답이 문장에 드러난 문항 · 한 단원에서 겹치는 답 · 단원별 문항 수.
//   node tools/cz_check.js          문제만 찍는다(없으면 「문제 없음」)
//   node tools/cz_check.js --n      단원별 문항 수도
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'ask');
let bad = 0, total = 0;
const per = [];
for (const f of fs.readdirSync(DIR).filter(x => /^cz\d+.*\.json$/.test(x)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const [u, l] of Object.entries(d)) {
    total += l.length;
    per.push(u + ':' + l.length);
    const seen = {};
    l.forEach(c => {
      if (c.q.split('____').length !== 2) { bad++; console.log(u, '빈칸이 하나가 아님 |', c.q); }
      if (!/^\d+$/.test(c.a) && c.q.replace('____', '').indexOf(c.a) > -1) { bad++; console.log(u, '답이 문장에 보임:', c.a, '|', c.q); }
      if (seen[c.a]) { bad++; console.log(u, '같은 답 두 번:', c.a); }
      seen[c.a] = 1;
    });
  }
}
if (process.argv.includes('--n')) console.log(per.join(' '));
console.log(bad ? '★ 문제 ' + bad + '곳' : '문제 없음', '· 빈칸', total, '· 단원', per.length);
process.exit(bad ? 1 : 0);
