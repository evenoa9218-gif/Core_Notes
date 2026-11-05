#!/usr/bin/env node
// units/ → data-cards.js (카드 경계)
//
// ★ 카드는 파생물이다. 진도를 카드에 붙이지 않는다.
//   경계 규칙을 손보면 카드가 달라지는데, 거기에 회독·체크가 붙어 있으면 기록이 흔들린다.
//   그래서 진도는 **블록 id** 에 붙이고, 카드는 「한 번에 보여 주고 한 번에 체크하는 묶음」일 뿐이다.
//   카드를 체크하면 그 안의 블록들에 표시가 간다 — 전문 보기와 카드 보기가 같은 기록을 본다.
//
// 모형: 단원을 **잎 블록 열**(문서 순서)로 펼치고, 카드는 그 위의 구간이다.
//   컨테이너(callout·details)는 경계가 아니라 「가르면 안 되는 울타리」로 쓴다.
//   울타리가 작으면(≤MAX) 통으로 두고, 크면 안으로 들어가 가른다 —
//   형소·형법에 5,000자짜리 callout 이 있어서 통으로 두면 카드가 벽이 된다.
//
// 경계는 만들지 않고 찾는다. 본문에 이미 들어 있다.
//   ① cs-h (소제목)                   → 새 카드
//   ② 번호 머리 cs-li (1. 가. (1) Ⅰ.)  → 새 카드
//   ③ 컨테이너가 시작되는 자리          → 새 카드
//   ④ 그래도 길면 글자 수로 끊는다
//
// 목표는 카드 수가 아니라 **카드당 300~800자**다.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUBJ = ['민법', '헌법', '행정법', '형법', '형소', '민소', '최판'];

const MIN = 300;    // 이보다 짧으면 다음 것을 붙인다 — 「Ⅰ. 의의」 한 줄 카드를 막는다
const MAX = 800;    // 이보다 길면 경계가 아니어도 끊는다

const txt = h => (h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const clsOf = b => b.w !== undefined ? '' : ((/class="([^"]*)"/.exec(b.o) || [, ''])[1]);

// 번호 머리 — 「1. 」「가. 」「(1) 」「Ⅰ. 」「① 」
const NUM = /^\s*(?:\d{1,2}[.)]|[가-힣][.)]|\([0-9가-힣]{1,2}\)|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.)]?|[①-⑳])\s/;

// 단원을 잎 열로 펼친다. 각 잎에 조상 울타리(컨테이너)들의 글자 수를 달아 둔다.
function leaves(blocks, anc = [], out = []) {
  blocks.forEach(b => {
    if (b.w !== undefined) return;                 // 블록 사이 공백은 카드와 무관
    if (b.b) {
      const size = charsOf(b);
      const a = anc.concat([{ i: b.i, size, first: out.length }]);
      leaves(b.b, a, out);
      return;
    }
    out.push({ i: b.i, cls: clsOf(b), len: txt(b.h).length, head: txt(b.h).slice(0, 30), anc });
  });
  return out;
}
function charsOf(b) {
  return b.w !== undefined ? 0 : b.b ? b.b.reduce((n, x) => n + charsOf(x), 0) : txt(b.h).length;
}

function isBoundary(L, i) {
  const l = L[i];
  if (i === 0) return true;
  // ③ 울타리가 여기서 시작하면 새 카드
  if (l.anc.some(a => a.first === i)) return true;
  if (/\bcs-h\b/.test(l.cls)) return true;                                   // ①
  if (/\bcs-li\b/.test(l.cls) && !/\bcs-bul\b/.test(l.cls) && NUM.test(l.head)) return true;  // ②
  return false;
}

// i 에서 끊어도 되나 — 작은 울타리 한가운데를 가르면 안 된다
function canCut(L, i) {
  if (i === 0 || i >= L.length) return false;
  const prev = L[i - 1].anc, now = L[i].anc;
  // 둘을 함께 감싸는 울타리 중 작은 것(≤MAX)이 있으면 못 끊는다
  return !now.some(a => a.size <= MAX && prev.some(p => p.i === a.i));
}

function cardsOf(unit) {
  const L = leaves(unit.b);
  if (!L.length) return { L, starts: [] };
  const starts = [0];
  let acc = L[0].len;
  for (let i = 1; i < L.length; i++) {
    const cut = canCut(L, i) && (
      (isBoundary(L, i) && acc >= MIN) ||      // 경계이고 충분히 모았다
      (acc >= MAX)                             // 경계가 아니어도 너무 길다
    );
    if (cut) { starts.push(i); acc = L[i].len; }
    else acc += L[i].len;
  }
  return { L, starts };
}

function main() {
  const out = {};
  const rows = [];
  let allLens = [], cards = 0, leafTotal = 0;

  for (const s of SUBJ) {
    const dir = path.join(ROOT, 'units', s);
    const idx = JSON.parse(fs.readFileSync(path.join(dir, '_index.json'), 'utf8'));
    const lens = [];
    let n = 0;
    idx.order.forEach(id => {
      const u = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
      const { L, starts } = cardsOf(u);
      out[id] = starts;
      n += starts.length; leafTotal += L.length;
      starts.forEach((st, k) => {
        const end = k + 1 < starts.length ? starts[k + 1] : L.length;
        lens.push(L.slice(st, end).reduce((a, x) => a + x.len, 0));
      });
    });
    cards += n;
    allLens = allLens.concat(lens);
    const p = q => lens.slice().sort((a, b) => a - b)[Math.floor(lens.length * q)] || 0;
    rows.push([s, idx.order.length, n, (n / idx.order.length).toFixed(1), p(.5), p(.1), p(.9)]);
  }

  const head = ['과목', '단원', '카드', '단원당', '중앙', '10%', '90%'];
  const w = head.map((h, i) => Math.max(h.length + 1, ...rows.map(r => String(r[i]).length + 1)));
  console.log(head.map((h, i) => h.padStart(w[i])).join(''));
  rows.forEach(r => console.log(r.map((v, i) => String(v).padStart(w[i])).join('')));
  const p = q => allLens.slice().sort((a, b) => a - b)[Math.floor(allLens.length * q)];
  console.log('─'.repeat(w.reduce((a, b) => a + b, 0)));
  console.log('카드', cards.toLocaleString(), '· 잎', leafTotal.toLocaleString(),
    '· 글자 중앙', p(.5), '10%', p(.1), '90%', p(.9), '99%', p(.99));

  const body = '// units/ 에서 만든 카드 경계. 손으로 고치지 않는다 — tools/build_cards.js 가 쓴다.\n' +
    '// { 단원id: [카드가 시작하는 잎 블록 번호…] }  잎 = 단원을 문서 순서로 펼친 줄 열\n' +
    '// 카드는 파생물이라 진도를 붙이지 않는다. 진도는 블록 id 에 붙는다.\n' +
    'window.CARDS = ' + JSON.stringify(out) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'data-cards.js'), body, 'utf8');
  console.log('data-cards.js', (body.length / 1024).toFixed(0) + 'KB');
}

if (require.main === module) main();
module.exports = { cardsOf, leaves, charsOf, isBoundary, canCut, txt, MIN, MAX };
