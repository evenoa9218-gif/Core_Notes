#!/usr/bin/env node
// units/{과목}/*.json (정본) → data-*.js (읽기용 번들)
//
// build_units.js 의 역방향. 둘을 왕복시켜 글자 하나까지 같아야 한다 —
// 그게 「읽기 동작이 전과 같다」의 증명이다. verify_units.js 가 그걸 돌린다.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUBJ = {
  민법:   ['data-civil.js',   'CIVIL_UNITS'],
  헌법:   ['data-const.js',   'CONST_UNITS'],
  행정법: ['data-admin.js',   'ADMIN_UNITS'],
  형법:   ['data-crim.js',    'CRIM_GAKRON_CONCEPT'],
  형소:   ['data-crimpro.js', 'CRIMPRO_UNITS'],
  민소:   ['data-minso.js',   'MINSO_UNITS'],
  최판:   ['data-choipan.js', 'CHOIPAN_UNITS'],
};

const closeOf = open => '</' + /^<([a-z]+)/.exec(open)[1] + '>';

function render(blocks) {
  return blocks.map(b => b.w !== undefined ? b.w
    : b.o + (b.b ? render(b.b) : b.h) + closeOf(b.o)).join('');
}

function rowsOf(subj) {
  const dir = path.join(ROOT, 'units', subj);
  const idx = JSON.parse(fs.readFileSync(path.join(dir, '_index.json'), 'utf8'));
  return idx.order.map(id => {
    const u = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
    const html = render(u.b);
    // 최판만 4칸이었다 — 이제 전 과목 6칸이다 (f923746)
    return [u.id, u.t, html, u.tg, u.lv, u.cat];
  });
}

function main() {
  for (const [subj, [file, key]] of Object.entries(SUBJ)) {
    const rows = rowsOf(subj);
    const target = path.join(ROOT, file);
    const src = fs.readFileSync(target, 'utf8');
    const at = src.indexOf('window.' + key + ' = ');
    if (at < 0) throw new Error(file + ': window.' + key + ' 줄을 못 찾았다');
    const nl = /\r\n/.test(src) ? '\r\n' : '\n';
    const end = src.indexOf(nl, at);
    // 서식까지 전과 같게 쓴다. 원래 번들은 파이썬 json.dumps 산출물이라
    // 원소 사이가 ", "(쉼표+공백)다. JSON.stringify 는 ","라 바이트 비교가 어긋난다.
    const dumps = v => Array.isArray(v)
      ? '[' + v.map(dumps).join(', ') + ']'
      : JSON.stringify(v);
    const line = 'window.' + key + ' = ' + dumps(rows) + ';';
    fs.writeFileSync(target, src.slice(0, at) + line + src.slice(end < 0 ? src.length : end), 'utf8');
    console.log(file.padEnd(18), rows.length + '단원');
  }
}

if (require.main === module) main();
module.exports = { render, rowsOf, SUBJ };
