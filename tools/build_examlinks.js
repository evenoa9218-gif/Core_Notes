// 민법 본문의 기출 표시(「변10 사례」「24년 8모 사례」「변13 기록」「객빈」…)를 실제 시험 문항에 잇는다.
//
//   node tools/build_examlinks.js            → data-examlinks.js + tools/examlinks_report.txt
//
// 표시에는 회차·유형만 있고 「몇 문」인지는 없다. 그래서 그 줄의 내용과 회차 안 각 문항
// (설문 요지·문제문·모범답안)을 글자쌍으로 맞춰 가장 가까운 문을 고른다. 결과는 보고서로
// 남겨 눈으로 확인한다 — 점수가 낮은 연결은 화면에서 「추정」으로 표시한다.
//
// 표시는 세 갈래다.
//   회차 표시   「변10 사례」「24년 8모」     → 그 회차 안에서 문을 고른다
//   회차 없음   「변모 사례」「21년 신모 사례」 → 전 회차에서 내용이 가장 가까운 문 2개(추정)
//                「모의 기록」「변시 사례형」     (「신모」는 어떤 시험인지 자료가 없어 이렇게 처리한다)
//   선택형      「객빈」「모의 객관식」         → MCQ 민법 OX 문항 중 내용이 가장 가까운 지문 3개
//
// 자료 출처 — 경로는 환경변수로 바꿀 수 있다(CI 는 다른 곳에 체크아웃한다).
//   사례형  $CASE_DIR   (기본 ../CASE_Practice)  data/민사법/exams/*.json
//   기록형  $RECORD_DIR (기본 ../RECORD)         data/민사법/exams/*.json
//   선택형  $MCQ_DIR    (기본 ../MCQ_check)      data/{민법총칙,물권법,채권총론,채권각론}.json
//   책 원문 tools/examlinks_sources.json — D 드라이브 PDF 에서 tools/extract_examlink_sources.py 로 미리 뽑아 둔 것
//           (변시 기록형 해설 쪽별 원문, 사례형 사이트에 해설이 없는 3개 문의 해설)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const firstDir = (...ds) => ds.find(d => d && fs.existsSync(d)) || ds[ds.length - 1];
const CASE = firstDir(process.env.CASE_DIR, path.join(ROOT, '..', 'CASE_Practice'));
const RECORD = firstDir(process.env.RECORD_DIR, path.join(ROOT, '..', 'RECORD'), path.join(ROOT, '..', 'RECORD_Practice'));
const MCQ = firstDir(process.env.MCQ_DIR, path.join(ROOT, '..', 'MCQ_check'), path.join(ROOT, '..', 'MCQ'));
const CASE_URL = 'https://evenoa9218-gif.github.io/CASE_Practice/';
const RECORD_URL = 'https://evenoa9218-gif.github.io/RECORD_Practice/';
const MCQ_URL = 'https://evenoa9218-gif.github.io/MCQ/';
const SRC_FILE = path.join(__dirname, 'examlinks_sources.json');
const SOURCES = fs.existsSync(SRC_FILE) ? JSON.parse(fs.readFileSync(SRC_FILE, 'utf8')) : { record: {}, extra: {} };

// ── index.html 과 똑같이 계산해야 화면에서 같은 줄을 찾는다 ──
const stripTags = s => (s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function hash32(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const keyOf = t => hash32((t || '').replace(/\s+/g, ''));

// 사례형 사이트의 문제 분리 함수를 그대로 빌려 쓴다(같은 규칙으로 잘라야 사이트와 어긋나지 않는다)
const caseSrc = fs.readFileSync(path.join(CASE, 'index.src.html'), 'utf8');
const sandbox = {};
vm.runInNewContext(caseSrc.slice(caseSrc.indexOf('const MARK_RE'), caseSrc.indexOf('function useTheme')) +
  '\nthis.splitProblemText = splitProblemText;', sandbox);
const splitProblemText = sandbox.splitProblemText;

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data-civil.js'), 'utf8'), { window: win });
const UNITS = win.CIVIL_UNITS;

// ── 표시 읽기 ──
// ⚠ 이 정규식 원문을 data-examlinks.js 에 같이 싣고 index.html 이 그걸 쓴다 — 두 곳에서 따로 고치면 어긋난다.
// 회차 없는 표시·선택형 표시는 【】 안에 단독으로 있을 때만 잡는다(본문 산문 속 「모의 사례」 같은 말은 표시가 아니다).
// 앞쪽 갈래가 먼저 먹어야 「【객빈 — 변5·17.6모 기출】」의 변5·17.6모가 회차 표시로 따로 잡히지 않는다.
const LABEL_SRC =
  '(?<=【)(?:객빈(?:\\s?—[^】]*)?|(?:모의\\s?)?객관식|변시\\s?선택형|변모\\s?(?:사례|기록|선택형|×\\s?\\d)|' +
  '모의\\s?(?:사례|기록)(?:·(?:사례|기록))?(?:\\s?\\d회↑)?|법전협\\s?모의\\s?(?:사례|기록)|변시\\s?사례형|사례형|' +
  '\\d{2}년\\s?(?:모의\\s?출제|신모\\s?(?:사례|기록)?))(?=】)' +
  '|변시?\\s?(\\d{1,2})회?\\s*(사례형?|기록형?|기출|선택형)?' +
  '|(\\d{2})\\s?(?:년\\s?|\\.\\s?)(\\d{1,2})\\s?모\\s*(사례|기록|기출|채점기준)?';
const LABEL_RE = new RegExp(LABEL_SRC, 'g');
const MONTH_ROUND = { 6: 1, 8: 2, 10: 3 };
const GROUP_RE = /^\s*제\s?(\d)\s?문(?:의\s?(\d))?/;

function readLabels(text) {
  const out = [];
  let m;
  LABEL_RE.lastIndex = 0;
  while ((m = LABEL_RE.exec(text))) {
    const raw = m[0].trim();
    if (!m[1] && !m[3]) {                                          // 【】 단독 표시
      if (/객빈|객관식|선택형/.test(raw)) { out.push({ raw, cls: 'mcq' }); continue; }
      const types = /사례/.test(raw) && /기록/.test(raw) ? ['사례', '기록'] : /사례/.test(raw) ? ['사례'] : /기록/.test(raw) ? ['기록'] : ['사례', '기록'];
      const kinds = /^변시/.test(raw) ? ['변시'] : /^(?:모의|법전협|\d{2}년)/.test(raw) ? ['모의'] : ['변시', '모의'];
      const y = /^(\d{2})년\s?모의\s?출제/.exec(raw);
      out.push({ raw, cls: 'generic', types, kinds: /신모/.test(raw) ? ['변시', '모의'] : kinds, year: y ? 2000 + +y[1] : null, sinmo: /신모/.test(raw) });
      continue;
    }
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    // 「특변13」 같은 낱말 속 숫자는 표시가 아니다 — 단 「(19년」처럼 괄호 뒤는 된다
    if (/[가-힣]/.test(before) && !/[(\s【·,]/.test(before)) continue;
    let kind, year, round, n, type;
    if (m[1]) { kind = '변시'; n = +m[1]; type = m[2]; if (n < 1 || n > 15) continue; }
    else { kind = '모의'; year = 2000 + +m[3]; round = MONTH_ROUND[+m[4]]; type = m[5]; if (!round) continue; }
    if (type === '선택형') { out.push({ raw, cls: 'mcq' }); continue; }
    type = type ? type.replace(/형$/, '') : null;
    if (type === '채점기준') type = null;
    const g = GROUP_RE.exec(text.slice(m.index + m[0].length));
    out.push({ raw, cls: 'exam', kind, year, round, n, type, group: g ? '제' + g[1] + '문' + (g[2] ? '의' + g[2] : '') : null });
  }
  return out;
}

const examCache = {};
function loadExam(site, id) {
  const k = site + id;
  if (k in examCache) return examCache[k];
  const f = path.join(site === 'case' ? CASE : RECORD, 'data', '민사법', 'exams', id + '.json');
  return (examCache[k] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
}
const examId = (l, t) => '민사법_' + (l.kind === '변시' ? '변시_' + l.n + '회' : '모의_' + l.year + '_' + l.round + '차') + '_' + t;
// 창작문제(로사정·박승수)는 기출이 아니므로 「가장 가까운 기출」 후보에서 뺀다
const realExamIds = site => fs.readdirSync(path.join(site === 'case' ? CASE : RECORD, 'data', '민사법', 'exams'))
  .filter(f => /^민사법_(?:변시_\d+회|모의_\d{4}_\d차)_(?:사례|기록)\.json$/.test(f)).map(f => f.replace(/\.json$/, ''));

// ── 맞춰 보기: 한글 글자쌍, 흔한 쌍은 가볍게 ──
const bigrams = t => { const s = new Set(); (t.match(/[가-힣]{2,}/g) || []).forEach(w => { for (let i = 0; i < w.length - 1; i++) s.add(w.substr(i, 2)); }); return s; };
const NOISE = /【[^】]*】|★+|判例\d*|大判全合\d*|私見|正辯/g;
// 문서 묶음을 한 번만 쪼개 두고 여러 줄을 맞춰 본다(선택형 1,600문항 × 표시 100곳을 매번 쪼개면 느리다)
function makePool(docs) {
  const sets = docs.map(bigrams), df = new Map();
  sets.forEach(s => s.forEach(g => df.set(g, (df.get(g) || 0) + 1)));
  return {
    size: docs.length,
    score(note) {
      const nb = [...bigrams(note.replace(NOISE, ' '))];
      const idf = g => Math.log((docs.length + 1) / (1 + (df.get(g) || 0))) + 0.3;
      const total = nb.reduce((a, g) => a + idf(g), 0) || 1;
      return sets.map(s => nb.reduce((a, g) => a + (s.has(g) ? idf(g) : 0), 0) / total);
    }
  };
}
const scoreAll = (note, docs) => makePool(docs).score(note);

// 문제문을 문(group)별로 나눈다. 사이트의 injectCaseLabels 는 사례 경계 수와 문 수가 다르면 포기하는데
// (민사법은 「추가적 사실관계」가 끼어 20/25가 그랬다), 문마다 배점 합이 있으므로 「(15점)」을
// 차례로 더해 그 문의 배점에 이르면 끊는다.
// ⚠ 문제 블록 종류(question)에 기대면 안 된다 — 「< 문제 >」 아래 번호 없이 쓴 설문은 사이트 분리기가
//   question 으로 못 잡는다(변시 10회). 문단 그대로 훑으며 「(N점)」만 센다.
function splitByPoints(ex, groups) {
  const paras = (ex.problemText || '').split(/\n[ \t]*\n/).map(p => p.trim()).filter(Boolean);
  const probOf = {};
  let gi = 0, acc = 0, buf = [];
  for (const p of paras) {
    if (gi >= groups.length) break;
    if (!buf.length && gi > 0 && /^[<\[【]\s*(?:참조|참고|관련)|^제\s*\d+\s*조|^※/.test(p)) { probOf[groups[gi - 1].label].push(p); continue; }
    buf.push(p);
    (p.match(/[(（]\s*\d{1,3}\s*점\s*[)）]/g) || []).forEach(x => { acc += +x.replace(/\D/g, ''); });
    const need = groups[gi].points || (groups[gi].questions || []).reduce((a, q) => a + (q.points || 0), 0);
    if (need && acc >= need) {
      if (acc !== need) break;                                       // 배점이 어긋나면 여기서 멈춘다(앞 문들은 둔다)
      probOf[groups[gi].label] = buf; buf = []; acc = 0; gi++;
    }
  }
  return probOf;
}

const groupCache = {};
function caseGroups(id, ex) {
  if (groupCache[id]) return groupCache[id];
  const groups = ex.groups || [];
  const blocks = splitProblemText(ex.problemText || '', groups.map(g => g.label));
  const siteOf = {};
  let cur = null;
  blocks.forEach(b => {
    if (b.type === 'caselabel') { cur = b.text; siteOf[cur] = []; return; }
    if (cur) siteOf[cur].push((b.type === 'question' ? '【문제】\n' : b.type === 'ref' ? '【참조조문】\n' : '') + b.text);
  });
  // 배점으로 자른 것을 먼저 쓴다. 사이트 분리기의 라벨은 경계 수만 맞으면 붙이므로 엉뚱한 사례에
  // 붙기도 한다(변시 12·13회에서 5건) — 그쪽은 배점 합이 맞을 때만 받는다.
  const probOf = splitByPoints(ex, groups);
  const sumPts = arr => (arr.join('\n').match(/[(（]\s*\d{1,3}\s*점\s*[)）]/g) || []).reduce((a, x) => a + +x.replace(/\D/g, ''), 0);
  groups.forEach(g => { if (!probOf[g.label] && siteOf[g.label] && sumPts(siteOf[g.label]) === g.points) probOf[g.label] = siteOf[g.label]; });
  return (groupCache[id] = groups.map(g => {
    const bs = g.basisSlice || {};
    let answer = '', src = '';
    if (bs.src === 'casebook' && (bs.idx || []).length) {
      const as = bs.idx.map(i => (ex.casebookAnswers || [])[i]).filter(Boolean);
      answer = as.map(a => a.answerText).join('\n\n');
      src = as[0] ? as[0].author + ' 「' + as[0].book + '」 해설' : '';
    } else if (bs.src === 'rubric' && (bs.ranges || []).length) {
      answer = bs.ranges.map(([a, b]) => (ex.rubricText || '').slice(a, b)).join('\n\n');
      src = '채점기준표';
    }
    // 사례형 사이트에 해설·채점기준표가 없는 문은 책에서 뽑아 둔 해설로 채운다
    const extra = (SOURCES.extra || {})[id + '|' + g.key];
    if (!answer && extra) { answer = extra.text; src = extra.src; }
    return { g, problem: (probOf[g.label] || []).join('\n\n'), answer, src,
             asks: (g.questions || []).map(q => ({ no: q.no, points: q.points, ask: q.ask })) };
  }));
}

// 기록형 — 그 줄과 가장 가까운 부분만 떼어 보여 준다.
//   변시: 채점기준표가 공개되지 않는다 → 정연석 해설을 PDF 에서 쪽 단위로 다시 뽑은 원문(문단·각주 복원)
//   모의: 채점기준표 문단
function recordExcerpt(id, ex, note) {
  const pages = (SOURCES.record || {})[id];
  if (pages && pages.length) {
    const sc = scoreAll(note, pages.map(p => p.text));
    let best = 0;
    sc.forEach((v, i) => { if (v > sc[best]) best = i; });
    // 쪽을 통째로 보이면 관련 대목이 쪽 아래에 있을 때 스크롤해야 한다(변13 기록: 법정지상권이 p.752 끝 「7.」).
    // 쪽 안에서 가장 가까운 문단을 찾아 그 위의 소제목부터 보여 주고, 다음 쪽까지 잇는다.
    const body = pages[best].text.split('\n[각주]')[0].split('\n');
    const ls = scoreAll(note, body);
    let bl = 0;
    ls.forEach((v, i) => { if (v > ls[bl]) bl = i; });
    let start = bl;
    for (let j = bl; j >= Math.max(0, bl - 8); j--) if (/^(?:\d{1,2}\s*\.|[가-하]\s*\.|\(\d{1,2}\))\s/.test(body[j])) { start = j; break; }
    let text = body.slice(start).join('\n');
    if (pages[best + 1]) text += '\n\n(p.' + pages[best + 1].page + ')\n' + pages[best + 1].text;
    if (text.length > 4500) text = text.slice(0, 4500) + '\n…(이하 생략 — 사이트에서 전문 보기)';
    return { text, score: sc[best], src: '정연석 「로스쿨 기록형 기출문제집」 해설 p.' + pages[best].page + (start ? ' 중간부터' : '') };
  }
  let text = ex.rubricText || '', src = '채점기준표';
  if (!text && (ex.commentaries || [])[0]) { text = ex.commentaries[0].text; src = ex.commentaries[0].author + ' 「' + ex.commentaries[0].title + '」 해설'; }
  let paras = text.split(/\n\s*\n/);
  if (paras.length < 20) paras = text.split(/\n/);
  paras = paras.filter(p => p.trim());
  if (!paras.length) return { text: '', score: 0, src };
  const sc = scoreAll(note, paras);
  let best = 0;
  sc.forEach((v, i) => { if (v > sc[best]) best = i; });
  let a = best, b = best + 1, len = paras[best].length;
  while (len < 1800 && (a > 0 || b < paras.length)) {
    if (a > 0) { a--; len += paras[a].length; }
    if (len < 1800 && b < paras.length) { len += paras[b].length; b++; }
  }
  return { text: paras.slice(a, b).join('\n'), score: sc[best], src: src + ' (관련 부분)' };
}

const REFS = [], refIndex = {}, LINKS = {}, report = [];
const addRef = r => { const k = r.site + '|' + r.examId + '|' + (r.group || '') + '|' + (r.excerptKey || ''); if (!(k in refIndex)) { refIndex[k] = REFS.length; REFS.push(r); } return refIndex[k]; };
const cut = (s, n) => (s || '').length > n ? s.slice(0, n) + '\n…(이하 생략 — 사이트에서 전문 보기)' : (s || '');
const makeRef = c => c.t === '사례'
  ? { site: '사례형', examId: c.id, exam: c.ex.label, group: c.x.g.key, groupLabel: c.x.g.label, points: c.x.g.points,
      asks: c.x.asks, problem: cut(c.x.problem, 6000), answer: cut(c.x.answer, 7000), answerSrc: c.x.src,
      url: CASE_URL + '?exam=' + encodeURIComponent(c.id) + '&group=' + encodeURIComponent(c.x.g.key) }
  : { site: '기록형', examId: c.id, exam: c.ex.label, group: '', groupLabel: (c.ex.tasks || []).map(t => t.title).join('·'),
      points: null, asks: [], problem: cut(c.ex.problemBlock || '', 1500), answer: c.ep.text, answerSrc: c.ep.src,
      excerptKey: hash32(c.ep.text.slice(0, 200)), url: RECORD_URL + '?exam=' + encodeURIComponent(c.id) };
const candName = c => c.t === '사례' ? c.ex.label + ' ' + c.x.g.label : c.ex.label;

// ── 회차 없는 표시: 전 회차 후보 ──
let GEN = null;
function genericPool() {
  if (GEN) return GEN;
  const caseDocs = [], recs = [];
  realExamIds('case').forEach(id => {
    const ex = loadExam('case', id);
    if (ex) caseGroups(id, ex).forEach(x => caseDocs.push({ t: '사례', id, ex, x, text: x.asks.map(a => a.ask).join(' ') + ' ' + x.problem + ' ' + x.answer }));
  });
  realExamIds('record').forEach(id => { const ex = loadExam('record', id); if (ex) recs.push({ t: '기록', id, ex }); });
  return (GEN = { caseDocs, casePool: makePool(caseDocs.map(d => d.text)), recs });
}
const kindOf = id => /_변시_/.test(id) ? '변시' : '모의';
const yearOf = id => { const m = /_모의_(\d{4})_/.exec(id); return m ? +m[1] : null; };

// ── 선택형: MCQ 민법 OX ──
let MCQ_POOL = null;
function mcqPool() {
  if (MCQ_POOL) return MCQ_POOL;
  const items = [];
  ['민법총칙', '물권법', '채권총론', '채권각론'].forEach(mod => {
    const f = path.join(MCQ, 'data', mod + '.json');
    if (!fs.existsSync(f)) return;
    JSON.parse(fs.readFileSync(f, 'utf8')).forEach(([no, q, ans, why, topic]) => items.push({ mod, no, q, ans, why, topic }));
  });
  return (MCQ_POOL = { items, pool: makePool(items.map(it => it.q + ' ' + (it.why || ''))) });
}

let lines = 0, found = 0, linked = 0;
const miss = [];
const pushLink = (k, entry) => {
  LINKS[k] = LINKS[k] || [];
  if (LINKS[k].some(x => x.r === entry.r)) return false;        // 풀이 상자 안의 줄이 두 번 잡힌 경우
  LINKS[k].push(entry);
  return true;
};

UNITS.forEach(([uid, title, html]) => {
  // ⚠ 사례 풀이 상자(cs-ans-in) 안에도 표시가 있다(「법전협 사례형 모의시험(19년 10모 제1문의 4)」). index.html 의 EXAM_BLOCK_RE 와 같아야 한다.
  const blocks = (html || '').match(/<div class="cs-(?:h|li|ans-in)[^"]*"[^>]*>[\s\S]*?<\/div>/g) || [];
  blocks.forEach((blk, bi) => {
    const text = stripTags(blk);
    const labels = readLabels(text);
    if (!labels.length) return;
    lines++;
    // 표시만 있는 짧은 줄은 앞줄이 내용이다
    let note = text;
    for (let j = bi - 1; note.replace(NOISE, '').length < 60 && j >= 0; j--) note = stripTags(blocks[j]) + ' ' + note;
    labels.forEach(l => {
      found++;
      const k = uid + '|' + keyOf(text) + '|' + l.raw.replace(/\s/g, '');

      if (l.cls === 'mcq') {
        const { items, pool } = mcqPool();
        const sc = pool.score(note);
        const top = sc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter(([v]) => v >= 0.35);   // 0.3대는 절반쯤 엉뚱한 지문이었다
        if (!top.length) { miss.push(`선택형 비슷한 지문 없음 ${uid} 「${l.raw}」`); return; }
        const ref = { site: '선택형', examId: 'MCQ', exam: 'MCQ 민법 OX', group: top.map(([, i]) => items[i].mod + items[i].no).join(','),
                      groupLabel: '내용이 가장 가까운 지문 ' + top.length + '개', points: null, asks: [],
                      items: top.map(([v, i]) => ({ mod: items[i].mod, topic: items[i].topic, q: items[i].q, ans: items[i].ans, why: cut(items[i].why, 500) })),
                      problem: '', answer: '', answerSrc: '', url: MCQ_URL };
        if (pushLink(k, { r: addRef(ref), sure: false, mcq: true })) linked++;
        report.push(`◇ ${uid} 「${l.raw}」 → 선택형 ${top.map(([v, i]) => items[i].mod + items[i].no + '(' + v.toFixed(2) + ')').join(' ')}` +
          `\n    줄: ${text.slice(0, 100)}\n    지문: ${items[top[0][1]].q.slice(0, 120)}`);
        return;
      }

      if (l.cls === 'generic') {
        const G = genericPool();
        const cands = [];
        if (l.types.includes('사례')) {
          const sc = G.casePool.score(note);
          G.caseDocs.forEach((d, i) => {
            if (!l.kinds.includes(kindOf(d.id)) || (l.year && yearOf(d.id) !== l.year)) return;
            cands.push({ t: '사례', id: d.id, ex: d.ex, x: d.x, score: sc[i] });
          });
        }
        if (l.types.includes('기록')) {
          G.recs.forEach(r => {
            if (!l.kinds.includes(kindOf(r.id)) || (l.year && yearOf(r.id) !== l.year)) return;
            const ep = recordExcerpt(r.id, r.ex, note);
            // 기록형 발췌 점수는 한 회차 안에서 잰 것이라 사례형 점수보다 후하다 — 조금 깎아 견준다
            cands.push({ t: '기록', id: r.id, ex: r.ex, ep, score: ep.score * 0.8 });
          });
        }
        cands.sort((a, b) => b.score - a.score);
        const top = cands.slice(0, 2).filter(c => c.score >= 0.3);
        if (!top.length) { miss.push(`가까운 기출 없음 ${uid} 「${l.raw}」`); return; }
        top.forEach((c, i) => { if (pushLink(k, { r: addRef(makeRef(c)), sure: false, generic: true, sinmo: !!l.sinmo, alt: i > 0 }) && i === 0) linked++; });
        report.push(`○ ${uid} 「${l.raw}」 → ${top.map(c => candName(c) + '(' + c.score.toFixed(2) + ')').join(' / ')}\n    줄: ${text.slice(0, 100)}`);
        return;
      }

      const types = l.type === '사례' ? ['사례'] : l.type === '기록' ? ['기록'] : ['사례', '기록'];
      const cands = [];
      types.forEach(t => {
        const id = examId(l, t), ex = loadExam(t === '사례' ? 'case' : 'record', id);
        if (!ex) return;
        if (t === '사례') {
          const gs = caseGroups(id, ex);
          const sc = scoreAll(note, gs.map(x => x.asks.map(a => a.ask).join(' ') + ' ' + x.problem + ' ' + x.answer));
          gs.forEach((x, i) => {
            if (l.group && x.g.key.replace(/\s/g, '') !== l.group) return;
            cands.push({ t, id, ex, x, score: l.group ? 1 : sc[i] });
          });
        } else {
          const ep = recordExcerpt(id, ex, note);
          cands.push({ t, id, ex, ep, score: ep.score });
        }
      });
      cands.sort((a, b) => b.score - a.score);
      const best = cands[0];
      if (!best) { miss.push(`자료 없음 ${uid} 「${l.raw}」`); return; }
      const second = cands[1];
      // 유형 표시가 있으면 그 회차 안에서 고른 것이라 믿을 만하다. 문 번호를 고른 근거는 점수뿐이므로
      // 1·2위가 비슷하면 「추정」으로 둔다. 기록형은 회차가 곧 문제 한 벌이라 연결은 확실하지만,
      // 보여 주는 해설 발췌가 맞는 부분인지는 점수로만 안다 — 0.5 미만이면 발췌를 「추정」으로 둔다.
      const sure = !!l.group ||
        (best.t === '기록' ? best.score >= 0.5 : best.score >= 0.35 && (!second || best.score - second.score >= 0.08));
      const ref = makeRef(best);
      if (!pushLink(k, { r: addRef(ref), sure, typeGuess: !l.type && !l.group })) return;   // 「제1문의 4」까지 적혀 있으면 추정이 아니다
      // 1·2위가 비슷하면 점수만으로 못 가른다 — 2위도 같은 창에 「다른 후보」로 보여 주고 사용자가 고르게 한다
      if (!sure && second && second.score >= best.score * 0.7) pushLink(k, { r: addRef(makeRef(second)), sure: false, alt: true, typeGuess: !l.type });
      linked++;
      report.push(`${sure ? '✓' : '△'} ${uid} 「${l.raw}」 → ${candName(best)} (${best.score.toFixed(2)}${second ? ' / 2위 ' + candName(second) + ' ' + second.score.toFixed(2) : ''})` +
        `\n    줄: ${text.slice(0, 110)}\n    문: ${(ref.asks.map(a => a.ask).join(' / ') || ref.answer.replace(/\s+/g, ' ')).slice(0, 150)}`);
    });
  });
});

REFS.forEach(r => delete r.excerptKey);
const out = '// tools/build_examlinks.js 로 만든다 — 손으로 고치지 말 것\n' +
  'window.EXAM_LABEL_SRC = ' + JSON.stringify(LABEL_SRC) + ';\n' +
  'window.EXAM_LINKS = ' + JSON.stringify(LINKS) + ';\nwindow.EXAM_REFS = ' + JSON.stringify(REFS) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data-examlinks.js'), out);
const empty = REFS.filter(r => r.site !== '선택형' && !r.answer).map(r => r.examId + ' ' + r.group);
const head = `표시 있는 줄 ${lines} · 표시 ${found} · 연결 ${linked} · 참조 ${REFS.length} · ${(out.length / 1024).toFixed(0)}KB\n` +
  `답안 자료 없는 참조 ${empty.length}${empty.length ? ': ' + empty.join(', ') : ''}\n` +
  `연결 못 함 ${miss.length}${miss.length ? '\n  ' + miss.join('\n  ') : ''}\n`;
fs.writeFileSync(path.join(__dirname, 'examlinks_report.txt'), head + '\n' + report.join('\n'));
console.log(head);
