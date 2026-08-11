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

# 과목 → 전역 변수 이름
GLOBALS = {'채권총론': 'CIVIL_CHAECHONG', '채권각론': 'CIVIL_CHAEGAK',
           '민법총칙': 'CIVIL_MINCHONG', '물권법': 'CIVIL_MULGWON'}

INDENT = 16  # 들여쓰기 한 단계 = 16px (형사법 데이터와 같은 값)


# ── 인라인 ────────────────────────────────────────────
def inline(s):
    s = s.replace('\\[', '[').replace('\\]', ']')
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)

    # 밑줄
    s = re.sub(r'<span underline="true">(.*?)</span>', r'<span class="cs-u">\1</span>', s)
    # 형광펜(_bg 계열) — 인접한 조각이 여러 개로 쪼개져 오므로 하나씩 감싼다
    s = re.sub(r'<span color="[a-z]+_bg">(.*?)</span>', r'<span class="cs-hl">\1</span>', s)
    # 【…】 마커(判例·통설·암기)
    s = re.sub(r'<span color="[a-z]+">(【[^】]*】)</span>', r'<span class="cs-exam">\1</span>', s)
    # 결론 (O)/(X)
    s = re.sub(r'<span color="[a-z]+">\s*<strong>\((O)\)</strong>\s*</span>',
               r'<span class="cs-o"><strong>(O)</strong></span>', s)
    s = re.sub(r'<span color="[a-z]+">\s*<strong>\((X)\)</strong>\s*</span>',
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

    s = re.sub(r'^★\s*', '<span class="cs-star">★</span>', s)
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

    for raw in md.split('\n'):
        if not raw.strip() or raw.strip() == '---':
            continue
        if raw.startswith('<!--'):
            continue

        depth = len(raw) - len(raw.lstrip('\t'))
        line = raw.strip()

        m = HEAD_RE.match(line)
        if m:
            if m.group(1).strip() == 'CASE':      # 사례형 자리표시자는 싣지 않는다
                break
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
    return {
        'id': '채총%d' % props['번호'] if props.get('과목') == '채권총론' else str(props.get('번호')),
        'title': props.get('주제', path.stem),
        'html': convert(text),
        'tags': tags,
        'level': 1,
        'cat': props.get('장', ''),
        'no': props.get('번호', 0),
        'subject': props.get('과목', ''),
    }


def main():
    subject = sys.argv[1] if len(sys.argv) > 1 else '채권총론'
    rows = sorted((parse(p) for p in RAW.glob('%s-*.md' % subject)), key=lambda r: r['no'])
    if not rows:
        sys.exit('원본이 없다: %s/%s-*.md' % (RAW, subject))

    cats, seen = [], set()
    for r in rows:                                 # 장 순서는 번호순 등장 순서 그대로
        if r['cat'] and r['cat'] not in seen:
            seen.add(r['cat'])
            cats.append(r['cat'])

    data = [[r['id'], r['title'], r['html'], r['tags'], r['level'], r['cat']] for r in rows]
    var = GLOBALS[subject]
    body = 'window.%s_CATS = %s;\nwindow.%s = %s;\n' % (
        var, json.dumps(cats, ensure_ascii=False),
        var, json.dumps(data, ensure_ascii=False))
    out = ROOT / 'data-civil.js'
    io.open(out, 'w', encoding='utf-8', newline='\n').write(body)
    print('%s 단원 %d개 → %s (%.1fKB)' % (subject, len(rows), out.name, out.stat().st_size / 1024))
    for r in rows:
        print('  %-3s %-22s %s' % (r['no'], r['title'], r['cat']))


if __name__ == '__main__':
    main()
