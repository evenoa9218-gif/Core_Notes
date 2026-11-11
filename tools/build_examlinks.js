// 본문의 기출 표시(「변10 사례」「24년 8모 사례」「【변사25】」「【변25·23】」「객빈」…)를 실제 시험 문항에 잇는다.
//
//   node tools/build_examlinks.js            → data-examlinks.js + tools/examlinks_report.txt
//
// 표시에는 회차·유형만 있고 「몇 문」인지는 없다. 그래서 그 줄의 내용과 회차 안 각 문항
// (설문 요지·문제문·모범답안)을 글자쌍으로 맞춰 가장 가까운 문을 고른다. 결과는 보고서로
// 남겨 눈으로 확인한다 — 점수가 낮은 연결은 화면에서 「추정」으로 표시한다.
//
// ★ 과목마다 표시 문법이 다르다. 이것을 섞으면 조용히 엉뚱한 기출에 붙는다.
//
//   민법·헌법·행정법 — 번호가 **회차**다 (변1 … 변15). 유형이 없으면 사례·기록 양쪽을 재서 고른다.
//   형법·형소        — 번호가 **연도**다 (변12 … 변26 = 2012~2026년 = 1~15회).
//                      변26 이 있는데 변시 26회는 없다는 것이 증거다. 유형이 없는 「변N」은 **선택형**이고,
//                      사례·기록은 접두사로 적는다: 변사N(변시 사례) 변기N(변시 기록) 모사N·모기N(모의).
//                      「변25·23」 처럼 한 표시에 여러 해가 묶인다.
//   민소·최판        — 본문에 기출 표시가 하나도 없다. 돌려도 0건이다(그래도 돌려 둔다 — 생기면 바로 붙는다).
//
// 표시는 네 갈래다.
//   회차/연도   「변10 사례」「24년 8모」「변25·23」   → 그 회차 안에서 문을 고른다
//   접두사      「변사25」「모사23·21」                 → 유형이 정해져 있다. 모의는 해만 적혀 1·2·3차 중에서 고른다
//   회차 없음   「변모 사례」「모의 기록」「사례형」      → 전 회차에서 내용이 가장 가까운 문 2개(추정)
//   선택형      「객빈」「모의 객관식」, 형사법의 「변N」 → MCQ OX 문항 중 내용이 가장 가까운 지문 3개
//                                                        (형사법은 해가 적혀 있어 그 해 지문으로 좁힌다)
//
// 자료 출처 — 경로는 환경변수로 바꿀 수 있다(CI 는 다른 곳에 체크아웃한다).
//   사례형  $CASE_DIR   (기본 ../CASE_Practice)  data/{민사법,형사법,공법}/exams/*.json
//   기록형  $RECORD_DIR (기본 ../RECORD)         data/{민사법,형사법,공법}/exams/*.json
//   선택형  $MCQ_DIR    (기본 ../MCQ_check)      data/*.json + {index,criminal,public-law}.html 의 EXAM_YEAR_*
//   책 원문 tools/examlinks_sources.json — D 드라이브 PDF 에서 tools/extract_examlink_sources.py 로 미리 뽑아 둔 것
//           (변시 기록형 해설 쪽별 원문, 사례형 사이트에 해설이 없는 3개 문의 해설) — 민사법뿐이다
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

// ── 과목표 ───────────────────────────────────────────────────────
// scheme 이 번호를 어떻게 읽을지 정한다. 이 한 칸을 잘못 적으면 전 과목이 조용히 어긋난다.
// app 은 index.html 의 DATA_FILES 가 쓰는 과목 이름이다 — 이것이 어긋나면 앱이 파일을 못 찾는다.
// 파일 이름은 본문 데이터와 같은 꼬리(civil·crim…)를 쓴다. 한글 파일 이름은 쓰지 않는다 —
// 과목 칩 글자가 바뀌어도, 경로 인코딩이 어떻든 받아진다.
const SUBJECTS = {
  민법: { app: '민법', file: 'data-civil.js', key: 'CIVIL_UNITS', track: '민사법', scheme: '회차',
    mcqHtml: 'index.html', mcq: ['민법총칙', '물권법', '채권총론', '채권각론'],
    modOf: { 채총: '채권총론', 채각: '채권각론', 민총: '민법총칙', 물권: '물권법' } },
  헌법: { app: '헌법', file: 'data-const.js', key: 'CONST_UNITS', track: '공법', scheme: '회차' },
  행정법: { app: '행정법', file: 'data-admin.js', key: 'ADMIN_UNITS', track: '공법', scheme: '회차' },
  // 강성민 단권화 노트는 기출 표시에 **문 번호와 배점까지** 적어 둔다(「★12회 변시 1문 … (15)」) —
  // 류정모보다 정확히 붙는다. 번호 체계는 공법이므로 회차다.
  행정법강성민: { app: '행정법강성민', file: 'data-admin-kang.js', key: 'ADMIN_KANG_UNITS', track: '공법', scheme: '회차' },
  형법: { app: '형법', file: 'data-crim.js', key: 'CRIM_GAKRON_CONCEPT', track: '형사법', scheme: '연도',
    mcqHtml: 'criminal.html', mcq: ['형법총론', '형법각론'] },
  형소: { app: '형사소송법', file: 'data-crimpro.js', key: 'CRIMPRO_UNITS', track: '형사법', scheme: '연도',
    mcqHtml: 'criminal.html', mcq: ['형사소송법'] },
  민소: { app: '민사소송법', file: 'data-minso.js', key: 'MINSO_UNITS', track: '민사법', scheme: '회차' },
  최판: { app: '최신판례', file: 'data-choipan.js', key: 'CHOIPAN_UNITS', track: '민사법', scheme: '회차' },
};
const slugOf = subj => SUBJECTS[subj].file.replace(/^data-|\.js$/g, '');
// 변시 N 회 = 2011+N 년 1월. 거꾸로 연도 → 회차.
const ROUND_OF_YEAR = y => y - 11;          // 변25 → 14회
const YEAR_MIN = 12, YEAR_MAX = 26;

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

// ── 표시 읽기 ──
// ⚠ 이 정규식 원문을 data-examlinks.js 에 같이 싣고 index.html 이 그걸 쓴다 — 두 곳에서 따로 고치면 어긋난다.
// 과목별로 다른 것은 **읽는 쪽(readLabels)** 이고 정규식은 하나다 — 「변14」 를 잡는 일은 같고
// 그것을 14회로 볼지 2014년으로 볼지만 다르다. 화면은 표시 글자만 감싸므로 정규식이 하나여야 한다.
// 회차 없는 표시·선택형 어휘는 【】 안에 단독으로 있을 때만 잡는다(본문 산문 속 「모의 사례」 같은 말은 표시가 아니다).
// 앞쪽 갈래가 먼저 먹어야 「【객빈 — 변5·17.6모 기출】」의 변5·17.6모가 회차 표시로 따로 잡히지 않는다.
// 「·」 로 이어지는 꼬리는 형사법의 「변25·23」 을 한 표시로 잡으려고 둔 것이다. 숫자 뒤 (?!\d) 가 없으면
// 「변25, 2020도1234」 에서 「, 20」 을 삼킨다.
const NUM_TAIL = '((?:\\s?·\\s?\\d{1,2}(?!\\d))*)';
// ⚠ **책마다 표기가 다르다.** 넓힐 때마다 새 꼴이 나왔다 —
//     민법·류정모   「변12 사례」「24년 8모」        (변이 앞, 모의는 「N모」)
//     형사법        「변사25」「모사23·21」          (유형이 접두사, 번호는 연도)
//     강성민 행정법  「12회 변시 1문」「25년 2차 2문」 (회가 앞, 모의는 「N차」, **문 번호까지**)
//   강성민 것을 안 받아 185곳 중 63곳만 이어졌었다. 새 책을 넣을 땐 **표기부터 세어 볼 것.**
// 묶음에 이름을 붙인다 — 번호로 세면 갈래를 더할 때마다 뒤가 밀려 조용히 어긋난다.
const LABEL_SRC =
  '(?<=【)(?:객빈(?:\\s?—[^】]*)?|(?:법모\\s?)?객관식|변시\\s?선택형|' +
  '법모\\s?(?:사례|기록)(?:·(?:사례|기록))?(?:\\s?\\d회↑)?|법모\\s?(?:선택형|×\\s?\\d)|변시\\s?사례형|사례형|' +
  '\\d{2}년\\s?법모\\s?(?:출제|사례|기록)?|기록형|기록\\s?기출|변\\s?기출)(?=】)' +
  '|(?<pre>변사|변기|모사|모기)\\s?(?<preN>\\d{1,2})(?!\\d)(?<preTail>(?:\\s?·\\s?\\d{1,2}(?!\\d))*)' +
  // 강성민 — 「12회 변시 1문」「12회 변시 1문의2」
  '|(?<hoeN>\\d{1,2})\\s?회\\s?변시(?:\\s?(?<hoeMun>\\d)\\s?문(?:의\\s?(?<hoeSub>\\d))?)?' +
  // 강성민 — 「25년 2차 2문」 (1차=6모 · 2차=8모 · 3차=10모)
  '|(?<chaYY>\\d{2})\\s?년\\s?(?<chaN>[1-3])\\s?차(?:\\s?(?<chaMun>\\d)\\s?문(?:의\\s?(?<chaSub>\\d))?)?' +
  '|변시?\\s?(?<n>\\d{1,2})(?!\\d)회?(?<tail>(?:\\s?·\\s?\\d{1,2}(?!\\d))*)\\s*(?<type>사례형?|기록형?|기출|선택형)?' +
  '|(?<yy>\\d{2})\\s?(?:년\\s?|\\.\\s?)(?<mm>\\d{1,2})\\s?모\\s*(?<mtype>사례|기록|기출|채점기준)?';
const LABEL_RE = new RegExp(LABEL_SRC, 'g');
const MONTH_ROUND = { 6: 1, 8: 2, 10: 3 };
const GROUP_RE = /^\s*제\s?(\d)\s?문(?:의\s?(\d))?/;
// 「변11(30점 중 일부)」 — 공법 본문은 표시 뒤에 **배점**을 적어 둔다. 이게 글자 맞추기보다 센 단서다.
// 회차 안 설문 배점은 절반이 그 회차에서 하나뿐이라, 배점이 맞으면 설문이 바로 집힌다.
// 「35,65,100」처럼 회차가 설문 단위로 안 쪼개진 자료도 있어(변10·변8) 안 맞으면 조용히 물러난다.
const PT_RE = /^\s*[(（]\s?(\d{1,3})\s?점/;
// 「제1문의1」(민사법) 과 「제1문-1」(형사법·공법) 은 같은 것을 다르게 적은 것이다
const normGroup = s => (s || '').replace(/[\s의\-]/g, '');
const PRE_TYPE = { 변사: ['변시', '사례'], 변기: ['변시', '기록'], 모사: ['모의', '사례'], 모기: ['모의', '기록'] };
const nums = (head, tail) => [+head].concat((tail || '').split('·').slice(1).map(x => +x.trim()))
  .filter(n => !isNaN(n));

function readLabels(text, subj) {
  const S = SUBJECTS[subj];
  const out = [];
  let m;
  LABEL_RE.lastIndex = 0;
  while ((m = LABEL_RE.exec(text))) {
    const raw = m[0].trim();
    const G = m.groups;
    if (!G.pre && !G.n && !G.yy && !G.hoeN && !G.chaYY) {          // 【】 단독 표시
      if (/객빈|객관식|선택형/.test(raw)) { out.push({ raw, cls: 'mcq' }); continue; }
      const types = /사례/.test(raw) && /기록/.test(raw) ? ['사례', '기록'] : /사례/.test(raw) ? ['사례'] : /기록/.test(raw) ? ['기록'] : ['사례', '기록'];
      const kinds = /^변시|^변\s?기출/.test(raw) ? ['변시'] : /법모/.test(raw) ? ['모의'] : ['변시', '모의'];
      const y = /^(\d{2})년/.exec(raw);
      out.push({ raw, cls: 'generic', types, kinds, year: y ? 2000 + +y[1] : null });
      continue;
    }
    // 「특변13」 같은 낱말 속 숫자는 표시가 아니다 — 단 「(19년」「[변사24」처럼 괄호·대괄호 뒤는 된다
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if ((G.pre || G.n) && /[가-힣]/.test(before) && !/[(\s【\[·,]/.test(before)) continue;
    const tail = text.slice(m.index + m[0].length);
    const g = GROUP_RE.exec(tail);
    // 강성민은 문 번호를 표시 **안에** 적는다(「12회 변시 1문의2」) — 그쪽을 먼저 쓴다.
    const mun = G.hoeMun || G.chaMun, sub = G.hoeSub || G.chaSub;
    const group = mun ? '제' + mun + '문' + (sub ? '의' + sub : '')
      : g ? '제' + g[1] + '문' + (g[2] ? '의' + g[2] : '') : null;
    const pm = PT_RE.exec(tail);
    const points = pm ? +pm[1] : null;

    if (G.pre) {                                                    // 「변사25·20」「모사23·21」
      const [kind, type] = PRE_TYPE[G.pre];
      nums(G.preN, G.preTail).forEach(y => {
        if (y < YEAR_MIN || y > YEAR_MAX) return;
        out.push(kind === '변시'
          ? { raw, cls: 'exam', kind, n: ROUND_OF_YEAR(y), type, group, points }
          // 모의는 해만 적혀 있고 1·2·3차가 없다 — 그 해 세 회차를 다 재서 고른다
          : { raw, cls: 'exam', kind, year: 2000 + y, round: null, type, group, points });
      });
      continue;
    }
    // 문 번호가 적혀 있으면 **사례형**이다 — 기록형은 한 벌이라 「몇 문」이 없다.
    const munType = mun ? '사례' : null;
    if (G.hoeN) {                                                   // 강성민 「12회 변시 1문」
      const n = +G.hoeN;
      if (n >= 1 && n <= 15) out.push({ raw, cls: 'exam', kind: '변시', n, type: munType, group, points });
      continue;
    }
    if (G.chaYY) {                                                  // 강성민 「25년 2차 2문」
      // 차수가 그대로 적혀 있다 — 1차=6모·2차=8모·3차=10모. 민법처럼 달(6/8/10)을 환산할 일이 없다.
      out.push({ raw, cls: 'exam', kind: '모의', year: 2000 + +G.chaYY, round: +G.chaN,
                 type: munType, group, points });
      continue;
    }
    if (G.n) {                                                      // 「변13 사례」「변25·23」
      let type = G.type;
      if (type === '선택형') { out.push({ raw, cls: 'mcq' }); continue; }
      type = type ? type.replace(/형$/, '') : null;
      if (type === '채점기준') type = null;
      nums(G.n, G.tail).forEach(v => {
        if (S.scheme === '연도') {
          if (v < YEAR_MIN || v > YEAR_MAX) return;
          // 형사법에서 유형 없는 「변N」 은 선택형이다 — 민법과 기본값이 반대다
          if (!type) { out.push({ raw, cls: 'mcq', year: v, kind: '변시' }); return; }
          out.push({ raw, cls: 'exam', kind: '변시', n: ROUND_OF_YEAR(v), type, group, points });
        } else {
          if (v < 1 || v > 15) return;
          out.push({ raw, cls: 'exam', kind: '변시', n: v, type, group, points });
        }
      });
      continue;
    }
    // 「24년 8모 사례」
    const round = MONTH_ROUND[+G.mm];
    if (!round) continue;
    let type = G.mtype;
    if (type === '선택형') { out.push({ raw, cls: 'mcq' }); continue; }
    if (type === '채점기준') type = null;
    out.push({ raw, cls: 'exam', kind: '모의', year: 2000 + +G.yy, round, type, group, points });
  }
  return out;
}

const examCache = {};
function loadExam(site, track, id) {
  const k = site + id;
  if (k in examCache) return examCache[k];
  const f = path.join(site === 'case' ? CASE : RECORD, 'data', track, 'exams', id + '.json');
  return (examCache[k] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
}
// 표시 하나가 가리킬 수 있는 회차 id 들. 모의인데 차수가 없으면 1·2·3차를 다 돌려준다.
function examIds(l, track, t) {
  if (l.kind === '변시') return [track + '_변시_' + l.n + '회_' + t];
  if (l.round) return [track + '_모의_' + l.year + '_' + l.round + '차_' + t];
  return [1, 2, 3].map(r => track + '_모의_' + l.year + '_' + r + '차_' + t);
}
// 창작문제(로사정·박승수)는 기출이 아니므로 「가장 가까운 기출」 후보에서 뺀다
const realIdCache = {};
function realExamIds(site, track) {
  const k = site + track;
  if (realIdCache[k]) return realIdCache[k];
  const dir = path.join(site === 'case' ? CASE : RECORD, 'data', track, 'exams');
  if (!fs.existsSync(dir)) return (realIdCache[k] = []);
  const re = new RegExp('^' + track + '_(?:변시_\\d+회|모의_\\d{4}_\\d차)_(?:사례|기록)\\.json$');
  return (realIdCache[k] = fs.readdirSync(dir).filter(f => re.test(f)).map(f => f.replace(/\.json$/, '')));
}

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

// 채점기준표는 있는데 문항별 조각(basisSlice)이 없는 회차가 있다(2023·2025년 3차 등).
// 설문 머리 표기가 회차마다 달라(「문제 5.」가 있는 회차도, 아예 없는 회차도 있다) 번호로는 못 자른다 —
// 문단 덩어리로 나눠 그 설문의 물음과 가장 가까운 대목을 보여 주고, 추정이라고 밝힌다.
const rubricCache = {};
function rubricExcerpt(ex, g) {
  const t = ex.rubricText || '';
  if (t.length < 500) return '';
  let chunks = rubricCache[ex.id];
  if (!chunks) {
    chunks = [];
    let buf = '';
    t.split(/\n\s*\n/).forEach(p => {
      buf += (buf ? '\n\n' : '') + p;
      if (buf.length > 900) { chunks.push(buf); buf = ''; }
    });
    if (buf.trim()) chunks.push(buf);
    rubricCache[ex.id] = chunks;
  }
  const note = (g.questions || []).map(q => q.ask).join(' ');
  if (!note.trim() || chunks.length < 2) return '';
  const sc = scoreAll(note, chunks);
  let best = 0;
  sc.forEach((v, i) => { if (v > sc[best]) best = i; });
  return chunks.slice(best, best + 2).join('\n\n').slice(0, 3000);
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
    if (!answer) { answer = rubricExcerpt(ex, g); if (answer) src = '채점기준표 — 이 설문에 가장 가까운 대목(추정)'; }
    return { g, problem: (probOf[g.label] || []).join('\n\n'), answer, src,
             asks: (g.questions || []).map(q => ({ no: q.no, points: q.points, ask: q.ask })) };
  }));
}

// 기록형 — 그 줄과 가장 가까운 부분만 떼어 보여 준다.
//   변시 민사법: 채점기준표가 공개되지 않는다 → 정연석 해설을 PDF 에서 쪽 단위로 다시 뽑은 원문(문단·각주 복원)
//   그 밖:       채점기준표 문단, 없으면 해설서 문단
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
// 무엇을 어느 과목이 쓰는가 — 과목별 파일로 쪼개 내보내려고 모아 둔다.
// 한 파일에 다 담으면 10MB 다. 민법만 있던 때도 1.2MB 였는데 과목이 일곱이면 폰에서 못 받는다.
const USE = {};                                  // 과목 → { keys, refs, mcq }
let CUR = null;                                  // 지금 훑는 과목
const useOf = s => (USE[s] = USE[s] || { keys: new Set(), refs: new Set(), mcq: new Set() });
const addRef = r => {
  const k = r.site + '|' + r.examId + '|' + (r.group || '') + '|' + (r.excerptKey || '');
  if (!(k in refIndex)) { refIndex[k] = REFS.length; REFS.push(r); }
  const i = refIndex[k];
  useOf(CUR).refs.add(i);
  (r.items || []).forEach(j => useOf(CUR).mcq.add(j));
  return i;
};
// 선택형 지문은 한 번만 적고 번호로 가리킨다 — 같은 지문이 여러 줄에 붙어 세 번씩 적히면 3.3MB 가 된다.
// 해설(why)은 싣지 않는다. 왜 그런지는 본문 그 줄이 이미 적어 둔 것이고, 더 보려면 MCQ 사이트로 간다.
const MCQT = [], mcqIndex = {};
const addMcq = it => {
  const k = it.mod + '|' + it.no;
  if (!(k in mcqIndex)) { mcqIndex[k] = MCQT.length; MCQT.push({ mod: it.mod, no: it.no, topic: it.topic, q: it.q, ans: it.ans }); }
  return mcqIndex[k];
};
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
const GEN = {};
function genericPool(track) {
  if (GEN[track]) return GEN[track];
  const caseDocs = [], recs = [];
  realExamIds('case', track).forEach(id => {
    const ex = loadExam('case', track, id);
    if (ex) caseGroups(id, ex).forEach(x => caseDocs.push({ t: '사례', id, ex, x, text: x.asks.map(a => a.ask).join(' ') + ' ' + x.problem + ' ' + x.answer }));
  });
  realExamIds('record', track).forEach(id => { const ex = loadExam('record', track, id); if (ex) recs.push({ t: '기록', id, ex }); });
  return (GEN[track] = { caseDocs, casePool: makePool(caseDocs.map(d => d.text)), recs });
}
const kindOf = id => /_변시_/.test(id) ? '변시' : '모의';
const yearOf = id => { const m = /_모의_(\d{4})_/.exec(id); if (m) return +m[1]; const v = /_변시_(\d{1,2})회/.exec(id); return v ? 2011 + +v[1] : null; };   // 변시 N회 = 2011+N 년 1월

// ── 선택형: MCQ OX ──
// 형사법은 본문에 해가 적혀 있고 MCQ 쪽에도 EXAM_YEAR_* 가 있어 **그 해 지문으로 좁힌다**.
// 민법은 양쪽에 회차 자료가 없어 전 문항에서 내용으로만 찾는다 — 그래서 늘 「추정」이다.
const MCQ_POOL = {};
function mcqMeta(htmlFile, mod) {
  // 변수 이름에 한글이 들어가 정규식 조립이 번거롭다 — 글자 자리로 떼어 온다
  const f = path.join(MCQ, htmlFile);
  if (!fs.existsSync(f)) return {};              // MCQ 쪽이 없어도 연결 자체는 되게 — 해로 좁히는 것만 못 한다
  const html = fs.readFileSync(f, 'utf8');
  const i = html.indexOf('const EXAM_YEAR_' + mod);
  if (i < 0) return {};
  const a = html.indexOf('{', i), b = html.indexOf('}', a);
  if (a < 0 || b < 0) return {};
  let d;
  try { d = JSON.parse(html.slice(a, b + 1)); } catch (e) { return {}; }
  const out = {};
  for (const [k, v] of Object.entries(d)) {
    const y = /(\d\d)/.exec(v);
    if (y) out[k] = { y: +y[1], kind: /모/.test(v) ? '모의' : '변시' };
  }
  return out;
}
function mcqPool(subj) {
  if (MCQ_POOL[subj]) return MCQ_POOL[subj];
  const S = SUBJECTS[subj];
  const items = [];
  (S.mcq || []).forEach(mod => {
    const f = path.join(MCQ, 'data', mod + '.json');
    if (!fs.existsSync(f)) return;
    const meta = S.mcqHtml ? mcqMeta(S.mcqHtml, mod) : {};
    JSON.parse(fs.readFileSync(f, 'utf8')).forEach(([no, q, ans, why, topic]) =>
      items.push({ mod, no, q, ans, why, topic, meta: meta[String(no).split('.')[0]] || null }));
  });
  return (MCQ_POOL[subj] = { items, pool: items.length ? makePool(items.map(it => it.q + ' ' + (it.why || ''))) : null,
    byYear: {} });
}
// 해별 후보를 한 번만 쪼개 둔다
function yearPool(subj, year, kind) {
  const P = mcqPool(subj);
  const k = year + '|' + kind;
  if (P.byYear[k]) return P.byYear[k];
  let idx = P.items.map((it, i) => [it, i]).filter(([it]) => it.meta && it.meta.y === year && it.meta.kind === kind);
  // 그 해에 그 종류가 거의 없으면 종류를 풀어 준다(형법 모25 처럼 한쪽만 많은 해가 있다)
  if (idx.length < 10) idx = P.items.map((it, i) => [it, i]).filter(([it]) => it.meta && it.meta.y === year);
  return (P.byYear[k] = { idx, pool: idx.length ? makePool(idx.map(([it]) => it.q + ' ' + (it.why || ''))) : null });
}

let lines = 0, found = 0, linked = 0;
const miss = [];
const STAT = {};
const pushLink = (k, entry) => {
  useOf(CUR).keys.add(k);
  LINKS[k] = LINKS[k] || [];
  if (LINKS[k].some(x => x.r === entry.r)) return false;        // 풀이 상자 안의 줄이 두 번 잡힌 경우
  LINKS[k].push(entry);
  return true;
};

for (const [subj, S] of Object.entries(SUBJECTS)) {
  const dataFile = path.join(ROOT, S.file);
  if (!fs.existsSync(dataFile)) { console.log('⚠ ' + subj + ': ' + S.file + ' 이 없다 — 건너뛴다'); continue; }
  CUR = subj;
  const win = {};
  vm.runInNewContext(fs.readFileSync(dataFile, 'utf8'), { window: win });
  const UNITS = win[S.key] || [];
  const st = STAT[subj] = { units: UNITS.length, lines: 0, found: 0, linked: 0, mcq: 0, miss: 0 };
  // 이을 것을 못 찾았을 때 — 아무것도 안 하면 표시가 **조용히 평범한 글자**로 남는다.
  // 그러면 「이 표시는 왜 안 눌리지」를 알 길이 없다. 그래서 왜 못 이었는지 적은 칩을 남긴다.
  const nolink = (k, why, log) => { st.miss++; miss.push(log); pushLink(k, { none: 1, why }); };

  UNITS.forEach(([uid, title, html]) => {
    // ⚠ 사례 풀이 상자(cs-ans-in) 안에도 표시가 있다(「법전협 사례형 모의시험(19년 10모 제1문의 4)」). index.html 의 EXAM_BLOCK_RE 와 같아야 한다.
    const blocks = (html || '').match(/<div class="cs-(?:h|li|ans-in)[^"]*"[^>]*>[\s\S]*?<\/div>/g) || [];
    blocks.forEach((blk, bi) => {
      const text = stripTags(blk);
      const labels = readLabels(text, subj);
      if (!labels.length) return;
      lines++; st.lines++;
      // 표시만 있는 짧은 줄은 앞줄이 내용이다
      let note = text;
      for (let j = bi - 1; note.replace(NOISE, '').length < 60 && j >= 0; j--) note = stripTags(blocks[j]) + ' ' + note;
      labels.forEach(l => {
        found++; st.found++;
        // 같은 표시 글자 안에 해가 여럿이면(「변25·23」) 열쇠가 하나다 — 창 안에서 여러 후보로 보인다
        const k = uid + '|' + keyOf(text) + '|' + l.raw.replace(/\s/g, '');

        if (l.cls === 'mcq') {
          const P = mcqPool(subj);
          if (!P.items.length) return nolink(k, '선택형 문제은행에 이 과목 자료가 아직 없다',
            '선택형 자료 없음 ' + subj + ' ' + uid + ' 「' + l.raw + '」');
          // 선택형 지문은 한 줄짜리 법리라 앞줄까지 붙이면 오히려 흐려진다 — 그 줄(표시 뺀 것)로 맞추고
          // 너무 짧을 때만 앞줄을 붙인다. 형사법 본문은 더 짧게 끊어 적어 기준을 올렸다.
          const minQ = l.year ? 45 : 25;
          let q = text.replace(NOISE, ' ');
          for (let j = bi - 1; q.replace(/\s/g, '').length < minQ && j >= 0; j--) q = stripTags(blocks[j]).replace(NOISE, ' ') + ' ' + q;

          let top, items, scope = '';
          if (l.year) {
            // 해가 적혀 있다 — 그 해 지문 40~90개로 좁혀 고른다. 민법보다 믿을 만하다.
            const Y = yearPool(subj, l.year, l.kind || '변시');
            if (!Y.pool) return nolink(k, '문제은행에 그 해 지문이 아직 들어 있지 않다',
              '그 해 선택형 지문 없음 ' + subj + ' ' + uid + ' 「' + l.raw + '」');
            items = Y.idx.map(([it]) => it);
            const sc = Y.pool.score(q);
            top = sc.map((v, i) => [v, i]).filter(([v]) => v >= 0.2).sort((a, b) => b[0] - a[0]).slice(0, 3);
            scope = (2000 + l.year) + '년 ' + (l.kind || '변시') + ' 선택형 ' + items.length + '지문 중';
          } else {
            items = P.items;
            const sc = P.pool.score(q);
            // 글자쌍만으로는 편이 다른 비슷한 말에 끌린다(채권각론 「해제 전 제3자 보호」 → 민법총칙 「대리권 남용과 제3자」).
            // 단원 번호로 편을 알 수 있으니 같은 편 지문은 0.35, 다른 편 지문은 0.6 이상일 때만 받는다.
            const mod = (S.modOf || {})[uid.replace(/\d+$/, '')];
            // 줄 머리에 용어를 정의한 줄(「손해담보계약 : …」)은 그 용어가 든 지문만 받는다 — 글자쌍 점수만으로는
            // 「과실상계」가 겹친 「해제와 과실상계」 지문이 0.44로 붙었다
            const headM = /^[★☆\s]*(?:【[^】]*】\s*)*([^:：\[\]【】()]{3,20}?)\s*[:：]/.exec(text);
            const head = headM ? headM[1].replace(/\s|\(.*$/g, '') : '';
            const hasHead = i => !head || /^[가-힣A-Za-z§·0-9]{3,}$/.test(head) === false || (items[i].q + (items[i].why || '')).replace(/\s/g, '').includes(head);
            top = sc.map((v, i) => [v, i]).filter(([v, i]) => v >= (items[i].mod === mod ? 0.35 : 0.6) && hasHead(i))
              .sort((a, b) => b[0] - a[0]).slice(0, 3);
          }
          if (!top.length) return nolink(k, l.year
            ? (2000 + l.year) + '년 지문 가운데 이 줄과 맞는 것을 못 찾았다 — 문제은행에 아직 안 들어온 지문일 수 있다'
            : '문제은행에서 이 줄과 맞는 지문을 못 찾았다',
            '선택형 비슷한 지문 없음 ' + subj + ' ' + uid + ' 「' + l.raw + '」');
          const ref = { site: '선택형', examId: 'MCQ' + (l.year ? '_' + l.year : ''),
                        exam: l.year ? (2000 + l.year) + '년 ' + (l.kind || '변시') + ' 선택형' : 'MCQ ' + subj + ' OX',
                        group: top.map(([, i]) => items[i].mod + items[i].no).join(','),
                        groupLabel: '내용이 가장 가까운 지문 ' + top.length + '개', points: null, asks: [],
                        scope,
                        items: top.map(([, i]) => addMcq(items[i])),
                        problem: '', answer: '', answerSrc: '', url: MCQ_URL };
          if (pushLink(k, { r: addRef(ref), sure: false, mcq: true })) { linked++; st.linked++; st.mcq++; }
          report.push('◇ ' + subj + ' ' + uid + ' 「' + l.raw + '」 → 선택형 ' +
            top.map(([v, i]) => items[i].mod + items[i].no + '(' + v.toFixed(2) + ')').join(' ') +
            (scope ? '  [' + scope + ']' : '') +
            '\n    줄: ' + text.slice(0, 100) + '\n    지문: ' + items[top[0][1]].q.slice(0, 120));
          return;
        }

        if (l.cls === 'generic') {
          const G = genericPool(S.track);
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
          // 연도가 밚혀 있으면 후보가 네다섯뿐이다 — 줄이 짧아 점수가 낮아도 가장 가까운 것을 보인다(추정 표시는 그대로).
          const top = l.year ? cands.slice(0, 2) : cands.slice(0, 2).filter(c => c.score >= 0.3);
          if (!top.length) return nolink(k, '전 회차를 훑어도 이 줄과 맞는 기출을 못 찾았다',
            '가까운 기출 없음 ' + subj + ' ' + uid + ' 「' + l.raw + '」');
          top.forEach((c, i) => { if (pushLink(k, { r: addRef(makeRef(c)), sure: false, generic: true, alt: i > 0 }) && i === 0) { linked++; st.linked++; } });
          report.push('○ ' + subj + ' ' + uid + ' 「' + l.raw + '」 → ' + top.map(c => candName(c) + '(' + c.score.toFixed(2) + ')').join(' / ') + '\n    줄: ' + text.slice(0, 100));
          return;
        }

        // 배점이 적혀 있으면 사례형이다 — 기록형은 설문 배점을 그렇게 적지 않는다.
        // 이걸 안 두면 「변1(10점)」 처럼 그 회차에 그 배점이 없는 경우 기록형 발췌가 0.15 로 이겨 버린다.
        const types = l.type === '사례' || (!l.type && l.points) ? ['사례']
          : l.type === '기록' ? ['기록'] : ['사례', '기록'];
        const cands = [];
        types.forEach(t => {
          examIds(l, S.track, t).forEach(id => {
            const ex = loadExam(t === '사례' ? 'case' : 'record', S.track, id);
            if (!ex) return;
            if (t === '사례') {
              let gs = caseGroups(id, ex);
              // 적혀 있는 것부터 쓴다 — 문 번호 > 배점 > 글자 맞추기.
              // 배점으로 좁히면 열 설문이 한두 개가 된다(공법 표시의 76~80%에 배점이 있다).
              // 그 회차가 설문 단위로 안 쪼개져 있으면 하나도 안 맞는다 — 그때는 조용히 전체로 돌아간다.
              let pinned = false;
              if (l.group) {
                const want = normGroup(l.group);
                let f = gs.filter(x => normGroup(x.g.key) === want);
                if (f.length) { gs = f; pinned = true; }
                else {
                  // 「2문」처럼 **문 번호만** 적힌 것(강성민). 사이트는 「제2문-1」처럼 설문까지
                  // 쪼개 두어 글자로는 안 맞는다 — 그 문에 속한 설문으로 좁히고 그 안에서 고른다.
                  f = gs.filter(x => normGroup(x.g.key).startsWith(want));
                  if (f.length) { gs = f; pinned = f.length === 1; }
                }
              } else if (l.points) {
                const f = gs.filter(x => x.g.points === l.points);
                if (f.length) { gs = f; pinned = f.length === 1; }
              }
              const sc = scoreAll(note, gs.map(x => x.asks.map(a => a.ask).join(' ') + ' ' + x.problem + ' ' + x.answer));
              gs.forEach((x, i) => cands.push({ t, id, ex, x, score: pinned ? 1 : sc[i], pinned, byPt: !l.group && !!l.points }));
            } else {
              const ep = recordExcerpt(id, ex, note);
              cands.push({ t, id, ex, ep, score: ep.score });
            }
          });
        });
        cands.sort((a, b) => b.score - a.score);
        const best = cands[0];
        if (!best) return nolink(k, '그 회차 자료가 아직 사이트에 없다',
          '자료 없음 ' + subj + ' ' + uid + ' 「' + l.raw + '」 (' + examIds(l, S.track, types[0]).join(',') + ')');
        const second = cands[1];
        // 유형 표시가 있으면 그 회차 안에서 고른 것이라 믿을 만하다. 문 번호를 고른 근거는 점수뿐이므로
        // 1·2위가 비슷하면 「추정」으로 둔다. 기록형은 회차가 곧 문제 한 벌이라 연결은 확실하지만,
        // 보여 주는 해설 발췌가 맞는 부분인지는 점수로만 안다 — 0.5 미만이면 발췌를 「추정」으로 둔다.
        // 모의인데 차수가 없으면 회차 자체가 추정이다.
        const roundGuess = l.kind === '모의' && !l.round;
        const sure = !roundGuess && (!!best.pinned ||
          (best.t === '기록' ? best.score >= 0.5 : best.score >= 0.35 && (!second || best.score - second.score >= 0.08)));
        const ptPinned = !!(best.pinned && best.byPt);
        const ref = makeRef(best);
        if (!pushLink(k, { r: addRef(ref), sure, typeGuess: !l.type && !l.group, roundGuess, ptPinned })) return;   // 「제1문의 4」까지 적혀 있으면 추정이 아니다
        // 1·2위가 비슷하면 점수만으로 못 가른다 — 2위도 같은 창에 「다른 후보」로 보여 주고 사용자가 고르게 한다
        if (!sure && second && second.score >= best.score * 0.7) pushLink(k, { r: addRef(makeRef(second)), sure: false, alt: true, typeGuess: !l.type, roundGuess });
        linked++; st.linked++;
        report.push((sure ? '✓' : '△') + (ptPinned ? '점' : '') + ' ' + subj + ' ' + uid + ' 「' + l.raw + '」 → ' + candName(best) +
          ' (' + best.score.toFixed(2) + (second ? ' / 2위 ' + candName(second) + ' ' + second.score.toFixed(2) : '') + ')' +
          '\n    줄: ' + text.slice(0, 110) + '\n    문: ' + (ref.asks.map(a => a.ask).join(' / ') || ref.answer.replace(/\s+/g, ' ')).slice(0, 150));
      });
    });
  });
}

REFS.forEach(r => delete r.excerptKey);

// ── 내보내기 ─────────────────────────────────────────────────────
// 과목마다 파일 하나. 그 과목에 들어갈 때만 받는다(index.html 의 __loadData).
// 번호(참조·지문)는 **전 과목에 걸친 번호** 그대로 쓰고 빠진 자리는 없는 채로 둔다 —
// 파일마다 번호를 다시 매기면 두 과목이 함께 쓰는 참조에서 어긋난다.
const sparse = (ids, arr) => {
  const o = {};
  [...ids].sort((a, b) => a - b).forEach(i => { if (arr[i]) o[i] = arr[i]; });
  return o;
};
const kb = s => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(0) + 'KB';
const HEAD = '// tools/build_examlinks.js 로 만든다 — 손으로 고치지 말 것\n';
const subjects = Object.keys(USE).filter(s => USE[s].keys.size);
const sizes = {}, map = {};
subjects.forEach(s => {
  const u = USE[s];
  const links = {};
  u.keys.forEach(k => { if (LINKS[k]) links[k] = LINKS[k]; });
  const body = HEAD +
    '// ' + s + ' — 열쇠 ' + Object.keys(links).length + ' · 참조 ' + u.refs.size + ' · 선택형 지문 ' + u.mcq.size + '\n' +
    'window.EXAM_LINKS = Object.assign(window.EXAM_LINKS || {}, ' + JSON.stringify(links) + ');\n' +
    'window.EXAM_REFS = Object.assign(window.EXAM_REFS || {}, ' + JSON.stringify(sparse(u.refs, REFS)) + ');\n' +
    'window.EXAM_MCQ = Object.assign(window.EXAM_MCQ || {}, ' + JSON.stringify(sparse(u.mcq, MCQT)) + ');\n';
  map[SUBJECTS[s].app] = slugOf(s);
  fs.writeFileSync(path.join(ROOT, 'data-examlinks-' + slugOf(s) + '.js'), body);
  sizes[s] = kb(body);
});
// 표시 정규식과 「어느 과목에 연결이 있나」만 담은 알맹이 — 어느 과목을 열든 이것부터 받는다(1KB 미만).
// 연결이 없는 과목(민소·최판)에 헛요청을 보내지 않으려고 목록을 여기 둔다.
const idx = HEAD +
  'window.EXAM_LABEL_SRC = ' + JSON.stringify(LABEL_SRC) + ';\n' +
  '// { 앱의 과목 이름: 파일 꼬리 } — index.html 이 data-examlinks-{꼬리}.js 를 받는다\n' +
  'window.EXAM_SUBJECTS = ' + JSON.stringify(map) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data-examlinks.js'), idx);

const empty = REFS.filter(r => r.site !== '선택형' && !r.answer).map(r => r.examId + ' ' + r.group);
const tbl = ['과목     단원  표시줄   표시   연결  선택형  못함     파일']
  .concat(Object.entries(STAT).map(([s, v]) => s.padEnd(7) + String(v.units).padStart(5) +
    String(v.lines).padStart(7) + String(v.found).padStart(7) + String(v.linked).padStart(7) +
    String(v.mcq).padStart(7) + String(v.miss).padStart(6) + (sizes[s] || '—').padStart(9))).join('\n');
const head = tbl + '\n\n' +
  '표시 있는 줄 ' + lines + ' · 표시 ' + found + ' · 연결 ' + linked +
  ' · 참조 ' + REFS.length + ' · 선택형 지문 ' + MCQT.length + ' · 알맹이 ' + kb(idx) + '\n' +
  '답안 자료 없는 참조 ' + empty.length + (empty.length ? ': ' + empty.join(', ') : '') + '\n' +
  '연결 못 함 ' + miss.length + (miss.length ? '\n  ' + miss.slice(0, 200).join('\n  ') + (miss.length > 200 ? '\n  …(' + (miss.length - 200) + '건 더)' : '') : '') + '\n';
fs.writeFileSync(path.join(__dirname, 'examlinks_report.txt'), head + '\n' + report.join('\n'));
console.log(head);
