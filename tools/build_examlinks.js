// 민법 본문의 기출 표시(「변10 사례」「24년 8모 사례」「변13 기록」…)를 실제 시험 문항에 잇는다.
//
//   node tools/build_examlinks.js            → data-examlinks.js + tools/examlinks_report.txt
//
// 표시에는 회차·유형만 있고 「몇 문」인지는 없다. 그래서 그 줄의 내용과 회차 안 각 문항
// (설문 요지·문제문·모범답안)을 글자쌍으로 맞춰 가장 가까운 문을 고른다. 결과는 보고서로
// 남겨 눈으로 확인한다 — 점수가 낮은 연결은 화면에서 「추정」으로 표시한다.
//
// 자료 출처(로컬 저장소):
//   사례형  ../CASE_Practice/data/민사법/exams/민사법_{변시_N회|모의_YYYY_N차}_사례.json
//   기록형  ../RECORD/data/민사법/exams/민사법_{…}_기록.json
// 선택형 기출은 MCQ 데이터에 회차 정보가 없어 잇지 못한다. 「신모」는 해당 시험 자료가 없다.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CASE = path.join(ROOT, '..', 'CASE_Practice');
const RECORD = path.join(ROOT, '..', 'RECORD');
const CASE_URL = 'https://evenoa9218-gif.github.io/CASE_Practice/';
const RECORD_URL = 'https://evenoa9218-gif.github.io/RECORD_Practice/';

// ── index.html 과 똑같이 계산해야 화면에서 같은 줄을 찾는다 ──
const stripTags = s => (s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function hash32(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const keyOf = t => hash32((t || '').replace(/\s+/g, ''));

// 사례형 사이트의 문제 분리 함수를 그대로 빌려 쓴다(같은 규칙으로 잘라야 사이트와 어긋나지 않는다)
const caseSrc = fs.readFileSync(path.join(CASE, 'index.src.html'), 'utf8');
const from = caseSrc.indexOf('const MARK_RE'), to = caseSrc.indexOf('function useTheme');
const sandbox = {};
vm.runInNewContext(caseSrc.slice(from, to) + '\nthis.splitProblemText = splitProblemText;', sandbox);
const splitProblemText = sandbox.splitProblemText;

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data-civil.js'), 'utf8'), { window: win });
const UNITS = win.CIVIL_UNITS;

// ── 표시 읽기 ──
const MONTH_ROUND = { 6: 1, 8: 2, 10: 3 };
const LABEL_RE = /변시?\s?(\d{1,2})회?\s*(사례형?|기록형?|기출|선택형)?|(\d{2})\s?(?:년\s?|\.\s?)(\d{1,2})\s?모\s*(사례|기록|기출|채점기준)?/g;
const GROUP_RE = /^\s*제\s?(\d)\s?문(?:의\s?(\d))?/;

function readLabels(text) {
  const out = [];
  let m;
  LABEL_RE.lastIndex = 0;
  while ((m = LABEL_RE.exec(text))) {
    // 【객빈 — 변5·17.6모 기출】【모의 객관식】 같은 선택형 표시는 뺀다
    const open = text.lastIndexOf('【', m.index), close = text.lastIndexOf('】', m.index);
    const bracket = open > close ? text.slice(open, text.indexOf('】', m.index) + 1 || undefined) : '';
    if (/객관식|객빈|선택형/.test(bracket) || m[2] === '선택형') continue;
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if (/[가-힣]/.test(before) && before !== '【') {
      // 「특변13」 같은 낱말 속 숫자는 표시가 아니다 — 단 「(19년」처럼 괄호 뒤는 된다
      if (!/[(\s【·,]/.test(before)) continue;
    }
    let kind, year, round, n, type;
    if (m[1]) { kind = '변시'; n = +m[1]; type = m[2]; if (n < 1 || n > 15) continue; }
    else { kind = '모의'; year = 2000 + +m[3]; round = MONTH_ROUND[+m[4]]; type = m[5]; if (!round) continue; }
    type = type ? type.replace(/형$/, '') : null;
    if (type === '채점기준') type = null;
    const tail = text.slice(m.index + m[0].length);
    const g = GROUP_RE.exec(tail);
    out.push({ raw: m[0].trim(), kind, year, round, n, type, group: g ? '제' + g[1] + '문' + (g[2] ? '의' + g[2] : '') : null });
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

// ── 맞춰 보기: 한글 글자쌍, 회차 안에서 흔한 쌍은 가볍게 ──
const bigrams = t => { const s = new Set(); (t.match(/[가-힣]{2,}/g) || []).forEach(w => { for (let i = 0; i < w.length - 1; i++) s.add(w.substr(i, 2)); }); return s; };
const NOISE = /【[^】]*】|★+|判例\d*|大判全合\d*|私見|正辯/g;
function scoreAll(note, docs) {
  const nb = [...bigrams(note.replace(NOISE, ' '))];
  const sets = docs.map(bigrams);
  const idf = g => Math.log((docs.length + 1) / (1 + sets.filter(s => s.has(g)).length)) + 0.3;
  const total = nb.reduce((a, g) => a + idf(g), 0) || 1;
  return sets.map(s => nb.reduce((a, g) => a + (s.has(g) ? idf(g) : 0), 0) / total);
}

// 문제문을 문(group)별로 나눈다. 사이트의 injectCaseLabels 는 사례 경계 수와 문 수가 다르면 포기하는데
// (민사법은 「추가적 사실관계」가 끼어 20/25가 그랬다), 문마다 배점 합이 있으므로 문제 블록의 「(15점)」을
// 차례로 더해 그 문의 배점에 이르면 끊는다. 합이 끝내 안 맞으면 틀리게 붙이느니 비워 둔다.
// ⚠ 문제 블록 종류(question)에 기대면 안 된다 — 「< 문제 >」 아래 번호 없이 쓴 설문은 사이트 분리기가
//   question 으로 못 잡는다(변시 10회). 문단 그대로 훑으며 「(N점)」만 센다.
function splitByPoints(ex, groups) {
  const paras = (ex.problemText || '').split(/\n[ \t]*\n/).map(p => p.trim()).filter(Boolean);
  const probOf = {};
  let gi = 0, acc = 0, buf = [];
  for (const p of paras) {
    if (gi >= groups.length) break;
    // 앞 문의 배점을 다 채운 직후의 조문·유의사항 문단은 그 문에 붙인다
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

function caseGroups(ex) {
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
  return groups.map(g => {
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
    return { g, problem: (probOf[g.label] || []).join('\n\n'), answer, src,
             asks: (g.questions || []).map(q => ({ no: q.no, points: q.points, ask: q.ask })) };
  });
}

// 기록형 채점기준표는 한 벌이 수만 자다 — 그 줄과 가장 가까운 문단 주변만 떼어 보여 준다.
// 변시 기록형은 채점기준표가 공개되지 않아(rubricText null) 정연석 해설로 대신한다.
function recordSource(ex) {
  if (ex.rubricText) return { text: ex.rubricText, src: '채점기준표' };
  const c = (ex.commentaries || [])[0];
  return c ? { text: c.text, src: c.author + ' 「' + c.title + '」 해설' } : { text: '', src: '' };
}
function recordExcerpt(ex, note) {
  const { text, src } = recordSource(ex);
  let paras = text.split(/\n\s*\n/);
  if (paras.length < 20) paras = text.split(/\n/);           // PDF 에서 뽑은 해설은 빈 줄이 없다
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
  return { text: paras.slice(a, b).join('\n'), score: sc[best], src };
}

const REFS = [], refIndex = {}, LINKS = {}, report = [];
const addRef = r => { const k = r.examId + '|' + (r.group || '') + '|' + (r.excerptKey || ''); if (!(k in refIndex)) { refIndex[k] = REFS.length; REFS.push(r); } return refIndex[k]; };
const cut = (s, n) => (s || '').length > n ? s.slice(0, n) + '\n…(이하 생략 — 사이트에서 전문 보기)' : (s || '');

let lines = 0, found = 0, linked = 0;
const skipped = [];
UNITS.forEach(([uid, title, html]) => {
  // ⚠ 사례 풀이 상자(cs-ans-in) 안에도 표시가 있다(「법전협 사례형 모의시험(19년 10모 제1문의 4)」). index.html 의 EXAM_BLOCK_RE 와 같아야 한다.
  const blocks = (html || '').match(/<div class="cs-(?:h|li|ans-in)[^"]*"[^>]*>[\s\S]*?<\/div>/g) || [];
  blocks.forEach((blk, bi) => {
    const text = stripTags(blk);
    if (/신모/.test(text)) skipped.push(uid + ' ' + (text.match(/\d{2}년\s?신모[^】]*/) || [''])[0]);
    const labels = readLabels(text);
    if (!labels.length) return;
    lines++;
    // 표시만 있는 짧은 줄은 앞줄이 내용이다
    let note = text;
    for (let j = bi - 1; note.replace(NOISE, '').length < 60 && j >= 0; j--) note = stripTags(blocks[j]) + ' ' + note;
    labels.forEach(l => {
      found++;
      const types = l.type === '사례' ? ['사례'] : l.type === '기록' ? ['기록'] : ['사례', '기록'];
      const cands = [];
      types.forEach(t => {
        const id = examId(l, t), ex = loadExam(t === '사례' ? 'case' : 'record', id);
        if (!ex) return;
        if (t === '사례') {
          const gs = caseGroups(ex);
          const sc = scoreAll(note, gs.map(x => x.asks.map(a => a.ask).join(' ') + ' ' + x.problem + ' ' + x.answer));
          gs.forEach((x, i) => {
            if (l.group && x.g.key.replace(/\s/g, '') !== l.group) return;
            cands.push({ t, id, ex, x, score: l.group ? 1 : sc[i] });
          });
        } else {
          const ep = recordExcerpt(ex, note);
          cands.push({ t, id, ex, ep, score: ep.score });
        }
      });
      cands.sort((a, b) => b.score - a.score);
      const best = cands[0];
      if (!best) { report.push(`✗ 자료없음 ${uid} 「${l.raw}」`); return; }
      const second = cands[1];
      // 유형 표시가 있으면 그 회차 안에서 고른 것이라 믿을 만하다. 문 번호를 고른 근거는 점수뿐이므로
      // 1·2위가 비슷하면 「추정」으로 둔다.
      // 기록형은 회차가 곧 문제 한 벌이라 연결 자체는 확실하지만, 보여 주는 해설 발췌가 맞는 부분인지는
      // 점수로만 안다(해설 텍스트가 PDF 추출이라 거칠다) — 0.5 미만이면 발췌를 「추정」으로 둔다.
      const sure = !!l.group ||
        (best.t === '기록' ? best.score >= 0.5 : best.score >= 0.35 && (!second || best.score - second.score >= 0.08));
      const makeRef = c => c.t === '사례'
        ? { site: '사례형', examId: c.id, exam: c.ex.label, group: c.x.g.key, groupLabel: c.x.g.label, points: c.x.g.points,
            asks: c.x.asks, problem: cut(c.x.problem, 6000), answer: cut(c.x.answer, 7000), answerSrc: c.x.src,
            url: CASE_URL + '?exam=' + encodeURIComponent(c.id) + '&group=' + encodeURIComponent(c.x.g.key) }
        : { site: '기록형', examId: c.id, exam: c.ex.label, group: '', groupLabel: (c.ex.tasks || []).map(t => t.title).join('·'),
            points: null, asks: [], problem: cut(c.ex.problemBlock || '', 1500), answer: c.ep.text, answerSrc: c.ep.src + ' (관련 부분)',
            excerptKey: hash32(c.ep.text.slice(0, 200)), url: RECORD_URL };
      const ref = makeRef(best);
      const k = uid + '|' + keyOf(text) + '|' + l.raw.replace(/\s/g, '');
      const idx = addRef(ref);
      LINKS[k] = LINKS[k] || [];
      if (LINKS[k].some(x => x.r === idx)) return;                 // 풀이 상자 안의 줄이 두 번 잡힌 경우
      LINKS[k].push({ r: idx, sure: sure, typeGuess: !l.type && !l.group });   // 「제1문의 4」까지 적혀 있으면 추정이 아니다
      // 1·2위가 비슷하면 점수만으로 못 가른다 — 2위도 같은 창에 「다른 후보」로 보여 주고 사용자가 고르게 한다
      if (!sure && second && second.score >= best.score * 0.7) LINKS[k].push({ r: addRef(makeRef(second)), sure: false, alt: true, typeGuess: !l.type });
      linked++;
      report.push(`${sure ? '✓' : '△'} ${uid} 「${l.raw}」 → ${ref.exam} ${ref.groupLabel || ''} (${best.score.toFixed(2)}${second ? ' / 2위 ' + (second.x ? second.x.g.label : second.t) + ' ' + second.score.toFixed(2) : ''})` +
        `\n    줄: ${text.slice(0, 110)}\n    문: ${(ref.asks.map(a => a.ask).join(' / ') || ref.answer.replace(/\s+/g, ' ')).slice(0, 150)}`);
    });
  });
});

REFS.forEach(r => delete r.excerptKey);
const out = '// tools/build_examlinks.js 로 만든다 — 손으로 고치지 말 것\n' +
  'window.EXAM_LINKS = ' + JSON.stringify(LINKS) + ';\nwindow.EXAM_REFS = ' + JSON.stringify(REFS) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data-examlinks.js'), out);
fs.writeFileSync(path.join(__dirname, 'examlinks_report.txt'),
  `표시 있는 줄 ${lines} · 표시 ${found} · 연결 ${linked} · 참조 ${REFS.length} · ${(out.length / 1024).toFixed(0)}KB\n` +
  `신모(자료 없음) ${skipped.length}: ${skipped.join(' / ')}\n\n` + report.join('\n'));
console.log(`표시 있는 줄 ${lines} · 표시 ${found} · 연결 ${linked} · 참조 ${REFS.length} · ${(out.length / 1024).toFixed(0)}KB`);
