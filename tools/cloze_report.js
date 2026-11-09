#!/usr/bin/env node
// 빈칸이 쓸 만한가를 **재는 자**. 고치기 전에 한 번, 고친 뒤에 한 번 돌린다.
//
// 왜 필요한가: 지금 빈칸은 형광펜(cs-hl) 자리를 그대로 정답으로 쓴다.
//   형광펜은 「읽을 때 눈에 띄게」 그은 것이라 문장 조각도 긴 구절도 섞여 있고,
//   그걸 **써서 맞히는 정답**으로 재사용하니 맞지 않는다.
//   손으로 어휘 목록(TERM_KEEP)을 늘려 가며 땜질해 왔는데, 목록은 끝이 없다.
//   그래서 추측을 그만두고 **숫자로 본다.**
//
// 보는 것 (기획서 6-5)
//   과목별 수 / 빈칸 있는 단원 비율
//   단서 글자 분위 (10·50·90)      ← 10%분위가 40자 넘어야 한다
//   정답 낱말 수 분포 · 중복 정답
//   무작위 샘플 (통과·거부) — 눈으로 본다
//
// ⚠ 빈칸 엔진은 index.html 안에 있다(앱과 같은 코드를 써야 수가 뜻을 가진다).
//   여기서 **이름을 대어 떼어 온다.** 이름이 바뀌면 ReferenceError 로 요란하게 깨진다 —
//   조용히 다른 것을 재는 것보다 낫다.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SUBJ = {
  민법: ['data-civil.js', 'CIVIL_UNITS'],
  헌법: ['data-const.js', 'CONST_UNITS'],
  행정법: ['data-admin.js', 'ADMIN_UNITS'],
  형법: ['data-crim.js', 'CRIM_GAKRON_CONCEPT'],
  형소: ['data-crimpro.js', 'CRIMPRO_UNITS'],
  민소: ['data-minso.js', 'MINSO_UNITS'],
  최판: ['data-choipan.js', 'CHOIPAN_UNITS'],
};

// ── index.html 에서 빈칸 엔진만 떼어 온다 ────────────────────────
const NEEDED = [
  'stripTags', 'MARK_BRACKET', 'cleanQ', 'hash32', 'cutAt', 'isHead',
  'balanced', 'TERM_KEEP', 'TERM_TAIL', 'TERM_OPEN', 'TERM_VERB', 'TERM_GENERIC',
  'isKeyTerm', 'TERM_PARTICLE', 'clozeCand', 'normAns', 'defCloze', 'buildCloze',
];

// 선언 하나를 통째로 잘라 온다.
// ⚠ 괄호를 세어 끝을 찾으면 안 된다 — 정규식 속 괄호까지 세기 때문이다.
//   `/<[^>]*>/g` 의 대괄호, `/【[^】]{0,24}】/g` 의 중괄호가 전부 걸린다.
//   그래서 **줄을 하나씩 붙여 가며 컴파일되는 지점**을 찾는다. 자바스크립트에게 묻는 게 맞다.
function declOf(src, name) {
  const re = new RegExp('^(?:function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=)', 'm');
  const m = re.exec(src);
  if (!m) throw new Error('index.html 에서 ' + name + ' 을 못 찾았다 — 이름이 바뀌었나');
  const lines = src.slice(m.index).split('\n');
  let acc = '';
  for (let i = 0; i < lines.length && i < 200; i++) {
    acc += (i ? '\n' : '') + lines[i];
    // 중간에 우연히 말이 되는 토막(「const normAns = s => {」 같은 것)을 집지 않도록
    // 닫는 글자로 끝날 때만 따져 본다
    if (!/[};]\s*$/.test(acc)) continue;
    try { new vm.Script(acc); return acc; } catch (e) { /* 아직 모자라다 */ }
  }
  throw new Error(name + ' 의 끝을 못 찾았다');
}

function engine() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const code = NEEDED.map(n => declOf(src, n)).join('\n\n');
  // 카드 경계를 알아야 단서를 카드째 모은다(8단계 ①). 앱은 window.CARDS 로 읽는다.
  const ctx = { console, module: {}, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data-cards.js'), 'utf8'), ctx);
  vm.runInContext(code + '\n;({ buildCloze, isKeyTerm, clozeCand, cleanQ, stripTags });', ctx);
  return vm.runInContext('({ buildCloze, isKeyTerm, clozeCand, cleanQ, stripTags })', ctx);
}

// ── 돌린다 ──────────────────────────────────────────────────────
function rowsOf(file, key) {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { window: win });
  return win[key] || [];
}

const q = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

function main() {
  const { buildCloze } = engine();
  const all = [];
  const rows = [];

  for (const [subj, [file, key]] of Object.entries(SUBJ)) {
    const units = rowsOf(file, key);
    let n = 0, withCz = 0;
    units.forEach(u => {
      const cz = buildCloze(u[2], u[0]).map(c => Object.assign({ subj, unit: u[0] }, c));
      if (cz.length) withCz++;
      n += cz.length;
      all.push(...cz);
    });
    rows.push([subj, units.length, n, withCz,
      units.length ? Math.round(withCz / units.length * 100) + '%' : '-']);
  }

  const head = ['과목', '단원', '빈칸', '있는단원', '비율'];
  const w = head.map((h, i) => Math.max(h.length * 2 + 1, ...rows.map(r => String(r[i]).length + 2)));
  console.log(head.map((h, i) => h.padStart(w[i])).join(''));
  rows.forEach(r => console.log(r.map((v, i) => String(v).padStart(w[i])).join('')));
  console.log('─'.repeat(w.reduce((a, b) => a + b, 0)));

  // 단서 — 빈칸을 뺀 나머지 글자. 이게 짧으면 못 푼다.
  // 8단계 ① 부터는 **카드의 다른 줄(near)까지** 단서다.
  const clue = all.map(c => c.text.replace(/_+/g, '').trim().length + (c.near || '').length);
  const words = all.map(c => c.answer.trim().split(/\s+/).length);
  const head0 = all.filter(c => /^_/.test(c.text)).length;
  console.log('빈칸', all.length.toLocaleString(),
    '· 단서 10%', q(clue, .1), '중앙', q(clue, .5), '90%', q(clue, .9));
  console.log('정답 낱말  1개', words.filter(x => x === 1).length,
    '· 2개', words.filter(x => x === 2).length,
    '· 3개 이상', words.filter(x => x >= 3).length,
    '  (2낱말 이상 ' + Math.round(words.filter(x => x > 1).length / all.length * 100) + '%)');
  console.log('줄 맨 앞이 빈칸', head0);

  // 같은 답이 여러 번 — 외우는 게 아니라 눈치로 맞히게 된다
  const dup = {};
  all.forEach(c => { dup[c.answer] = (dup[c.answer] || 0) + 1; });
  const top = Object.entries(dup).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('중복 정답 Top', top.map(([a, n]) => a + '×' + n).join(' · '));

  // 6-4 ②의 필터를 **재 보기만** 한다(아직 적용하지 않는다)
  const pass = all.filter(c => c.text.replace(/_+/g, '').trim().length >= 50
    && c.answer.trim().split(/\s+/).length <= 2 && !/^_/.test(c.text));
  console.log('\n6-4② 필터를 걸면', pass.length, '/', all.length,
    '(' + Math.round(pass.length / all.length * 100) + '%)');
  const bySubj = {};
  pass.forEach(c => { bySubj[c.subj] = (bySubj[c.subj] || 0) + 1; });
  console.log('  ', Object.entries(bySubj).map(([s, n]) => s + ' ' + n).join(' · '));

  if (process.argv.includes('--sample')) {
    const pick = (a, n) => a.slice().sort(() => Math.random() - .5).slice(0, n);
    // near 까지 보여 준다 — 실제로 화면에 같이 뜨는 단서라, 빼고 보면 풀 수 있는지 판단이 안 된다
    const show = c => '  [' + c.subj + ' ' + c.unit + '] ' + c.answer + '\n     '
      + c.text.replace(/\s+/g, ' ').slice(0, 150)
      + (c.near ? '\n     ↳ ' + c.near.replace(/\s+/g, ' ').slice(0, 110) + '…' : '');
    console.log('\n── 통과 표본 ──'); pick(pass, 12).forEach(c => console.log(show(c)));
    const fail = all.filter(c => pass.indexOf(c) < 0);
    console.log('\n── 걸러진 표본 ──'); pick(fail, 12).forEach(c => console.log(show(c)));
  }
}

if (require.main === module) main();
module.exports = { engine };
