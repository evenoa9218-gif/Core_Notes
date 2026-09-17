# -*- coding: utf-8 -*-
"""기출 연결(build_examlinks.js)이 쓸 원천 자료를 D 드라이브 책 PDF 에서 뽑아 둔다.

  python tools/extract_examlink_sources.py   → tools/examlinks_sources.json (저장소에 커밋)

D 드라이브가 있는 PC 에서만 돈다. 결과 JSON 을 커밋해 두면 CI(노션 동기화 뒤 재연결)는 D 없이 돈다.

뽑는 것
  record  변시 민사 기록형 1~15회 해설 원문 — 정연석 「로스쿨 기록형 기출문제집」(26.06).
          RECORD_Practice 의 commentaries 는 같은 책인데 줄바꿈이 다 뭉개져(「8813. 5.자」처럼 쪽번호·각주번호가
          본문에 박힘) 읽을 수가 없었다. PDF 에서 쪽 단위로 다시 뽑아 문단을 되살린다.
  extra   사례형 사이트에 해설·채점기준표가 없는 3개 문(文)의 해설 — 곽낙규 「변사기 민사연」·윤동환 「민법 기본사례맥」.
"""
import io, json, os, re, sys
import fitz

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
REC_BOOK = r'D:\pdf\기록\민사법\(26.06)[정연석] 로스쿨 기록형 기출문제집.pdf'
KWAK = r'D:\pdf\사례\민사법\(2026)[곽낙규] 변사기 민사연.pdf'
YUN = r'D:\pdf\사례\민사법\(26.01)[윤동환] 민법 기본사례맥 (1).pdf'

# ── 줄 이어 붙이기 ─────────────────────────────────────────────
# 이 책들은 글자 단위로 줄을 바꿔 「있\n어」처럼 낱말 한가운데서 끊긴다. 줄 끝 공백은 책마다 제각각이라 못 믿는다.
# 다음 줄 첫 글자가 조사·어미처럼 앞 글자에 붙어 쓰는 글자면 띄우지 않고 잇는다.
GLUE = set('다고어여서는은을를이가의에로터며면지게도만와과해하되된한할함음임있없습니라러려록께까씩간째들요죠야든던데니요')
HEAD = re.compile(r'^(?:[IVXⅠ-Ⅹ]+\s*[.．]|\d{1,2}\s*[.)．]|\(\d{1,2}\)|[가-하]\s*[.)．]|\([가-하]\)|[①-⑳]|[㉠-㉭]|※|\[|【|〈|<|■|▶|•|◦|○|-\s|청\s*구|피\s*고|원\s*고)')
END = re.compile(r'(?:[.。:」』)\]】〉>]|다|음|함|임|것)\s*$')


def reflow(lines):
    out = []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if not out or END.search(out[-1]) or HEAD.match(s):
            out.append(s)
            continue
        prev = out[-1]
        glue = re.search(r'[가-힣]$', prev) and s[0] in GLUE
        out[-1] = prev + ('' if glue else ' ') + s
    return '\n'.join(out)


# ── 기록형 해설 ───────────────────────────────────────────────
RUNHEAD = re.compile(r'^\s*(?:[〈<]\s*20\d\s?\d\s*년도\s*제\s*\d{1,2}\s*회\s*변호사시험\s*(?:해설|문제)\s*[〉>]|\d{1,4}\s*(?:로스쿨\s*민사\s*기록형\s*기출문제집)?|로스쿨\s*민사\s*기록형\s*기출문제집)\s*$')


def split_page(page):
    """본문 줄과 각주를 글자 크기로 가른다.

    ⚠ 글자로만 가르면 안 된다 — 각주 번호가 따로 한 줄(「48」)로 뽑혀 쪽번호 거르기에 함께 지워지고,
      각주 본문은 본문 문단에 섞이며, 본문에 박힌 각주 번호(「부터1」「원의3」)는 그대로 남았다.
      각주·각주 번호는 본문보다 글자가 작다(본문 ≈9.5pt, 각주 ≈7.5pt).
    """
    lines = []
    for b in page.get_text('dict')['blocks']:
        for ln in b.get('lines', []):
            spans = ln['spans']                              # 공백 span 도 둬야 낱말 사이가 붙지 않는다
            if ''.join(s['text'] for s in spans).strip():
                lines.append(spans)
    if not lines:
        return [], []

    def med(spans):
        ws = sorted((s['size'], len(s['text'].strip())) for s in spans if s['text'].strip())
        half, acc = sum(w for _, w in ws) / 2, 0
        for sz, w in ws:
            acc += w
            if acc >= half:
                return sz
        return ws[-1][0]

    # 중앙값을 쓰면 각주가 긴 쪽(각주가 본문보다 줄이 많다)에서 기준이 각주 크기로 내려간다 — 상위 25% 지점을 쓴다
    body_size = sorted(med(sp) for sp in lines)[int(len(lines) * 0.75)]
    # OCR 본이라 크기가 줄마다 흔들린다(본문 8.5~9.5, 각주 7.5~8.2). 각주는 「작은 숫자 한 줄」로 시작하므로
    # 그런 줄이 처음 나온 곳부터 쪽 끝까지를 각주로 본다.
    cut = len(lines)
    for k, sp in enumerate(lines):
        t = ''.join(s['text'] for s in sp).strip()
        if k > 3 and re.fullmatch(r'\d{1,3}', t) and med(sp) < body_size * 0.95:
            cut = k
            break
    body = []
    for sp in lines[:cut]:
        m = med(sp)
        # 본문에 박힌 각주 번호: 숫자만 든 작은 span
        t = ''.join('' if re.fullmatch(r'\d{1,3}\s*', s['text']) and s['size'] < m * 0.88 else s['text'] for s in sp)
        if not RUNHEAD.match(t):
            body.append(t)
    notes = []
    for sp in lines[cut:]:
        t = ''.join(s['text'] for s in sp).strip()
        if re.fullmatch(r'\d{1,3}', t):
            notes.append(t)
        elif notes:
            sep = ' ' if re.fullmatch(r'\d{1,3}', notes[-1]) or not (re.search(r'[가-힣]$', notes[-1]) and t[:1] in GLUE) else ''
            notes[-1] += sep + t
    return body, [n for n in notes if not re.fullmatch(r'\d{1,3}', n)]


def extract_records():
    d = fitz.open(REC_BOOK)
    marks = []
    for i in range(d.page_count):
        m = re.search(r'[〈<]\s*20\d\s?\d\s*년도\s*제\s*(\d{1,2})\s*회\s*변호사시험\s*(해설|문제)\s*[〉>]', d[i].get_text())
        if m:
            marks.append((i, int(m.group(1)), m.group(2)))
    out = {}
    for n in range(1, 16):
        sol = [i for i, r, k in marks if r == n and k == '해설']
        nxt = [i for i, r, k in marks if r == n + 1 and k == '문제']
        if not sol:
            continue
        a = sol[0] - 1                       # 머리글은 홀수 쪽에만 찍힌다 — 앞 쪽부터 본다
        b = (nxt[0] - 1) if nxt else sol[-1] + 1
        pages = []
        for i in range(a, b + 1):
            body, notes = split_page(d[i])
            text = reflow(body)
            if len(text) < 80:
                continue
            if notes:
                text += '\n\n[각주] ' + '\n[각주] '.join(notes)
            pages.append({'page': i + 1, 'text': text})
        out['민사법_변시_%d회_기록' % n] = pages
        print('기록 %2d회  p.%d~%d  %d쪽' % (n, a + 1, b + 1, len(pages)))
    return out


# ── 사례형 빈 해설 ────────────────────────────────────────────
# 곽낙규 책은 OCR 이 당사자 기호를 뒤바꾼다(乙→江·己·Z, 丙→內·因·西). 조사 앞에서만 되돌린다.
PARTY = [(re.compile(r'(?:江|ZL|Z、|己|7스)(?=[은는이가을를에의과와도만으,\s)．.])'), '乙'),
         (re.compile(r'(?<![가-힣A-Za-z])Z(?=[은는이가을를에의과와도만으])'), '乙'),
         (re.compile(r'(?:內|因|西|成)(?=[은는이가을를에의과와도만으,\s)．.])'), '丙')]
KWAK_HEAD = re.compile(r'(?:^|\n)\s*(?:\d{1,2}\s?[-—–]\s?\d{1,2}\s?\.|사\s?례\s?\d{1,2}\s)[^\n]{0,80}[:：][^\n]{0,40}[〔\[]')
KWAK_RUN = re.compile(r'^\s*(?:\d{1,4}\s*제\s?\d\s?편\s*[가-힣 ]+|사\s?례\s?\d{1,2}\s*[:：]\s*[가-힣 ]+\s*\d{1,4}|\d{1,4})\s*$')


def kwak_section(start):
    d = fitz.open(KWAK)
    buf = ''
    for i in range(start - 1, min(start + 8, d.page_count)):
        lines = [l for l in d[i].get_text().split('\n') if not KWAK_RUN.match(l)]
        buf += '\n'.join(lines) + '\n'
    # 첫 머리글부터 다음 머리글 전까지
    hs = list(KWAK_HEAD.finditer(buf))
    a = hs[0].start() if hs else 0
    b = hs[1].start() if len(hs) > 1 else len(buf)
    text = buf[a:b]
    for pat, rep in PARTY:
        text = pat.sub(rep, text)
    return reflow(text.split('\n'))


def yun_section(start):
    d = fitz.open(YUN)
    buf = ''
    for i in range(start - 1, min(start + 7, d.page_count)):
        lines = [l for l in d[i].get_text().split('\n') if not re.match(r'^\s*(?:민법 기본 사례의 脈|제\s?\d\s?편[^\n]{0,20}\d{1,4}|\d{1,4}|-)\s*$', l)]
        buf += '\n'.join(lines) + '\n'
    m = re.search(r'\n\s*[IⅠ]\s*[.．]\s*문제', buf)
    a = m.start() if m else 0
    e = re.search(r'\n\s*(?:【(?:기초적|공통되는|공통된)[^】]*】|\[(?:공통된|기초적)[^\]]*\]|20\d\d년\s*\d차\s*법전협)', buf[a + 200:])
    b = a + 200 + e.start() if e else len(buf)
    return reflow(buf[a:b].split('\n'))


EXTRA = {
    '민사법_모의_2019_3차_사례|제1문의4': [('윤동환 「민법 기본사례맥 (1)」', YUN, 170)],
    '민사법_모의_2021_2차_사례|제2문': [('윤동환 「민법 기본사례맥 (1)」(변형 문제)', YUN, 207),
                                  ('곽낙규 「변사기 민사연」', KWAK, 173), ('곽낙규 「변사기 민사연」', KWAK, 103),
                                  ('곽낙규 「변사기 민사연」', KWAK, 912), ('곽낙규 「변사기 민사연」', KWAK, 715),
                                  ('곽낙규 「변사기 민사연」', KWAK, 228)],
    '민사법_모의_2023_2차_사례|제2문의1': [('곽낙규 「변사기 민사연」', KWAK, 539), ('곽낙규 「변사기 민사연」', KWAK, 948),
                                    ('곽낙규 「변사기 민사연」', KWAK, 404)],
}


def extract_extra():
    out = {}
    for key, parts in EXTRA.items():
        texts, srcs = [], []
        for name, path, page in parts:
            t = yun_section(page) if path == YUN else kwak_section(page)
            texts.append(t)
            if name not in srcs:
                srcs.append(name)
            print('해설 %-34s %s p.%d  %d자' % (key, name[:8], page, len(t)))
        out[key] = {'src': ' · '.join(srcs) + ' 해설', 'text': '\n\n────────\n\n'.join(texts)}
    return out


if __name__ == '__main__':
    data = {'record': extract_records(), 'extra': extract_extra()}
    p = os.path.join(HERE, 'examlinks_sources.json')
    io.open(p, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=0))
    print(p, os.path.getsize(p) // 1024, 'KB')
