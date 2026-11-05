#!/usr/bin/env node
// 왕복 검증 — units/ 에서 다시 그린 HTML 이 지금 번들과 글자 하나까지 같은가.
// 노션 시절 verify_fidelity.py(raw 글자 = html 글자)를 대신하는 1단계 게이트다.
//
// 추가로 「id 는 사라지지 않는다」를 본다 — 이게 2-4의 새 불변식이다.

const fs = require('fs');
const path = require('path');
const { render, SUBJ } = require('./build_bundle.js');

const ROOT = path.join(__dirname, '..');

function bundleRows() {
  const window = {};
  for (const [, [file]] of Object.entries(SUBJ))
    eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  return window;
}

function collectIds(blocks, out = []) {
  blocks.forEach(b => {
    if (b.w !== undefined) return;
    out.push(b.i);
    if (b.b) collectIds(b.b, out);
  });
  return out;
}

function main() {
  const W = bundleRows();
  let bad = 0, units = 0, chars = 0, ids = new Set(), dupe = 0;

  for (const [subj, [file, key]] of Object.entries(SUBJ)) {
    const rows = W[key];
    const dir = path.join(ROOT, 'units', subj);
    const idx = JSON.parse(fs.readFileSync(path.join(dir, '_index.json'), 'utf8'));

    if (idx.order.length !== rows.length) {
      console.log('★', subj, '단원 수가 다르다', idx.order.length, 'vs', rows.length); bad++;
    }

    rows.forEach((row, i) => {
      const [id, title, html, tg, lv, cat] = row;
      units++; chars += html.length;
      const u = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
      const back = render(u.b);

      if (back !== html) {
        bad++;
        if (bad <= 3) {
          let d = 0; while (d < back.length && back[d] === html[d]) d++;
          console.log('★', subj, id, '본문 불일치 @' + d);
          console.log('   원본:', JSON.stringify(html.slice(d - 40, d + 60)));
          console.log('   복원:', JSON.stringify(back.slice(d - 40, d + 60)));
        }
      }
      if (u.t !== title || u.cat !== cat || (u.lv || 1) !== (lv || 1) ||
          JSON.stringify(u.tg || []) !== JSON.stringify(tg || [])) {
        bad++; console.log('★', subj, id, '메타 불일치');
      }
      collectIds(u.b).forEach(x => { if (ids.has(x)) dupe++; ids.add(x); });
    });
  }

  console.log('단원', units, '· 본문', chars.toLocaleString(), '자 · 블록 id', ids.size.toLocaleString());
  if (dupe) console.log('★ 중복 id', dupe, '건');
  console.log(bad || dupe ? '★ 실패 ' + (bad + dupe) + '건' : '✓ 왕복 일치 — 읽기 동작이 전과 같다');
  process.exit(bad || dupe ? 1 : 0);
}

main();
