"""노션 「로민정 단원」 페이지 본문 → 암기장 사이트 데이터(data-civil.js).

입력  tools/notion_raw/{과목}-{번호}.md
      맨 앞 두 줄이 <!-- notion-page: ID --> 와 <!-- props: {...} --> 인 노션 마크다운.
출력  data-civil.js
      window.CIVIL_{과목키} = [[id, 제목, html, 태그[], 중요도, 장], ...]
      형사법(data-criminal.js)과 같은 6-튜플이라 사이트가 같은 경로로 렌더한다.

노션 쪽 표기를 사이트 CSS 클래스로 옮기는 것이 전부다. 대응은 아래 한 곳에만 있다.
"""
import io, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'tools' / 'notion_raw'

# 민법 네 과목을 한 파일에 담는다 — 사이트에서는 '민법' 하나로 보이므로
VAR = 'CIVIL_UNITS'
SUBJECTS = ['채권총론', '채권각론', '민법총칙', '물권법']   # 책 순서
ID_PREFIX = {'채권총론': '채총', '채권각론': '채각', '민법총칙': '민총', '물권법': '물권'}

INDENT = 16  # 들여쓰기 한 단계 = 16px (형사법 데이터와 같은 값)


# ── 인라인 ────────────────────────────────────────────
def inline(s):
    s = s.replace('\\[', '[').replace('\\]', ']')
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    # 사례 링크 — 대괄호 처리보다 먼저 걷어내야 링크 제목이 사실관계로 오인되지 않는다
    s = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',
               r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)

    # 밑줄
    s = re.sub(r'<span underline="true">(.*?)</span>', r'<span class="cs-u">\1</span>', s)
    # 【…】 마커(判例·통설·암기·객빈·변모) — 형광펜 규칙보다 먼저다.
    # 【객빈】처럼 배경색으로 칠해진 것도 있어서 뒤로 두면 형광펜으로 먹힌다.
    # 【변10 기록】처럼 볼드까지 걸린 것이 있어 <strong> 를 함께 받는다
    s = re.sub(r'<span color="[a-z_]+">(<strong>)?(【[^】]*】)(</strong>)?</span>',
               lambda m: '<span class="cs-exam">%s%s%s</span>'
                         % (m.group(1) or '', m.group(2), m.group(3) or ''), s)
    # 형광펜(_bg 계열) — 인접한 조각이 여러 개로 쪼개져 오므로 하나씩 감싼다
    s = re.sub(r'<span color="[a-z]+_bg">(.*?)</span>', r'<span class="cs-hl">\1</span>', s)
    # 결론 (O)/(X)
    # 굵게 안쪽에 공백이 끼기도 한다 — <strong>(O) </strong> 도 결론 표기다
    s = re.sub(r'<span color="[a-z]+">\s*<strong>\s*\(O\)\s*</strong>\s*</span>',
               r'<span class="cs-o"><strong>(O)</strong></span>', s)
    s = re.sub(r'<span color="[a-z]+">\s*<strong>\s*\(X\)\s*</strong>\s*</span>',
               r'<span class="cs-x"><strong>(X)</strong></span>', s)
    # 남은 색 span은 색만 버리고 글자는 남긴다
    s = re.sub(r'<span color="[a-z_]+">(.*?)</span>', r'\1', s)

    # 사실관계 대괄호 → 결론이 (X)면 neg, 아니면 fact
    def bracket(m):
        body = m.group(1)
        rest = s[m.end():m.end() + 120]
        cls = 'cs-neg-tag' if 'cs-x' in rest[:80] else 'cs-fact-tag'
        return '<span class="%s">[%s]</span>' % (cls, body)
    s = re.sub(r'\[([^\[\]]{4,})\]', bracket, s)

    s = re.sub(r'^(★+)\s*', r'<span class="cs-star">\1</span>', s)
    return s.strip()


# ── 블록 ──────────────────────────────────────────────
HEAD_RE = re.compile(r'^#{2,4}\s+(.*)$')
LABEL_RE = re.compile(r'^(?:[가-힣]\.|\(\d+\)|\d+\))\s')


def convert(md):
    out, in_theory = [], False

    def close_theory():
        nonlocal in_theory
        if in_theory:
            out.append('</div>')
            in_theory = False

    lines = md.split('\n')
    i = -1
    while i + 1 < len(lines):
        i += 1
        raw = lines[i]

        # 표는 손대지 않고 그대로 흘려보낸다 (사이트의 table.sub 서식을 쓴다)
        if raw.lstrip().startswith('<table'):
            buf = []
            while i < len(lines):
                buf.append(lines[i])
                if '</table>' in lines[i]:
                    break
                i += 1
            close_theory()
            tbl = '\n'.join(buf)
            head = 'header-row="true"' in tbl
            tbl = re.sub(r'<table[^>]*>', '<table class="sub">', tbl)
            if head:                                   # 첫 행은 머리행으로
                first = re.search(r'<tr>.*?</tr>', tbl, re.S)
                if first:
                    tbl = (tbl[:first.start()]
                           + first.group(0).replace('<td>', '<th>').replace('</td>', '</th>')
                           + tbl[first.end():])
            out.append('<div class="cs-tbl" style="overflow-x:auto">%s</div>' % tbl)
            continue

        if not raw.strip() or raw.strip() == '---':
            continue
        if raw.startswith('<!--'):
            continue

        depth = len(raw) - len(raw.lstrip('\t'))
        line = raw.strip()

        if re.match(r'^\*\(.*\)\*$', line):       # *(사례형 정리 — 추가 예정)* 자리표시자
            continue

        m = HEAD_RE.match(line)
        if m:
            close_theory()
            out.append('<div class="cs-h">%s</div>' % inline(m.group(1)))
            continue

        if line.startswith('>'):                  # 正辯·보충 인용
            body = inline(line.lstrip('> ').strip())
            if body.startswith('원문 대조'):
                continue
            out.append('<div class="cs-ans-in" style="margin-left:%dpx">%s</div>'
                       % (depth * INDENT, body))
            continue

        if line.startswith('- '):
            out.append('<div class="cs-li cs-bul" style="margin-left:%dpx">%s</div>'
                       % (depth * INDENT, inline(line[2:])))
            continue

        if LABEL_RE.match(line):                  # 가. 나. (1) 1) — 논점 소제목
            close_theory()
            out.append('<div class="cs-li cs-issue" style="margin-left:%dpx">%s</div>'
                       % (depth * INDENT, inline(line)))
            continue

        out.append('<div class="cs-li" style="margin-left:%dpx">%s</div>'
                   % (depth * INDENT, inline(line)))

    close_theory()
    return ''.join(out)


def parse(path):
    text = io.open(path, encoding='utf-8').read()
    props = {}
    for line in text.split('\n')[:3]:
        m = re.match(r'<!--\s*props:\s*(\{.*\})\s*-->', line.strip())
        if m:
            props = json.loads(m.group(1))
    tags = [t for t in (props.get('절'), props.get('관')) if t]
    tags += props.get('판례태그') or []
    subject = props.get('과목', '')
    return {
        'id': '%s%s' % (ID_PREFIX.get(subject, ''), props.get('번호')),
        'title': props.get('주제', path.stem),
        'html': convert(text),
        'tags': tags,
        'level': 1,
        'chap': props.get('장', ''),
        'sec': props.get('절', ''),
        'no': props.get('번호', 0),
        'subject': subject,
    }


def group_of(rows):
    """목차를 어느 층위로 묶을지 — 장이 하나뿐이면(채권각론) 절로 내려간다."""
    chaps = set(r['chap'] for r in rows if r['chap'])
    key = 'sec' if len(chaps) <= 1 else 'chap'
    for r in rows:
        r['cat'] = '%s · %s' % (r['subject'], r[key] or r['chap'] or r['subject'])


def main():
    want = sys.argv[1:]
    data, cats, seen, tally = [], [], set(), []
    for subject in SUBJECTS:
        if want and subject not in want:
            continue
        rows = sorted((parse(p) for p in RAW.glob('%s-*.md' % subject)), key=lambda r: r['no'])
        if not rows:
            continue
        group_of(rows)
        for r in rows:
            if r['cat'] not in seen:
                seen.add(r['cat'])
                cats.append(r['cat'])
            data.append([r['id'], r['title'], r['html'], r['tags'], r['level'], r['cat']])
        tally.append((subject, len(rows)))
    if not data:
        sys.exit('원본이 없다: %s' % RAW)

    body = 'window.%s_CATS = %s;\nwindow.%s = %s;\n' % (
        VAR, json.dumps(cats, ensure_ascii=False),
        VAR, json.dumps(data, ensure_ascii=False))
    out = ROOT / 'data-civil.js'
    io.open(out, 'w', encoding='utf-8', newline='\n').write(body)
    print('%s → %s (%.1fKB)' % (' · '.join('%s %d단원' % t for t in tally),
                                out.name, out.stat().st_size / 1024))
    for c in cats:
        print('  %-30s %d단원' % (c, sum(1 for d in data if d[5] == c)))


if __name__ == '__main__':
    main()
