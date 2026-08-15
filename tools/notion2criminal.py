# -*- coding: utf-8 -*-
"""노션 형법 논점 DB·형소 쟁점 DB 본문 → 암기장 데이터(data-criminal.js).

입력  tools/notion_raw_crim/{형법|형소}-{키}.md
출력  data-criminal.js
      window.CRIM_GAKRON_CONCEPT = 형법 (총론+각론, 기존 전역명 유지 — 앱이 이 이름을 기다린다)
      window.CRIMPRO_UNITS       = 형사소송법

민법(notion2civil)과 달리 형사법 노션은 서식이 훨씬 진하다 — 배경색 6종,
글자색 대비축(red/green), 조문 파랑, 조문박스 callout, CASE 토글. 정규식
연쇄로는 중첩 span 이 깨져서, 줄을 런(run) 단위로 파싱해 속성을 계산한 뒤
다시 조립한다.
"""
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'tools' / 'notion_raw_crim'
INDENT = 16

# 배경색 → 사이트 클래스. pink_bg 는 [사안] 태그라 결론이 (X)면 neg 로 바뀐다(후처리)
BG = {'pink_bg': 'cs-fact-tag', 'brown_bg': 'cs-def', 'gray_bg': 'cs-glabel',
      'orange_bg': 'cs-sub', 'green_bg': 'cs-gbg', 'yellow_bg': 'cs-hl',
      'blue_bg': 'cs-statute', 'red_bg': 'cs-hl', 'purple_bg': 'cs-hl'}
# 글자색 → 클래스. brown 은 기출 마커일 때만 cs-exam (후판정)
FG = {'red': 'cs-red', 'green': 'cs-green', 'blue': 'cs-blue', 'gray': 'cs-stat',
      'orange': 'cs-red', 'purple': 'cs-blue', 'brown': None}

O_MARK, X_MARK = '\x03', '\x04'
HEAD_RE = re.compile(r'^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+\.\s')
LABEL_RE = re.compile(r'^(?:[가나다라마바사]\.|\(\d+\)|\d+\))\s')
TAG_RE = re.compile(r'(</?span[^>]*>|</?b>)')
EXAM_RE = re.compile(r'^【[^】]*】\s*$')


def esc(s):
    # 본문에 부등호가 진짜 글자로 온다 — "고의범 법정형 < 부진정결과적가중범"
    # (형총041). 안 벗기면 브라우저가 태그로 읽고 뒷문장을 삼킨다
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def runs_of(line):
    """줄을 (텍스트, 색, 굵게, 밑줄) 런 목록으로 편다."""
    line = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', line)
    # 이탤릭은 사이트에 대응이 없다. 짝이 맞든 아니든 별표는 전부 벗긴다 —
    # 짝만 지우면 span 경계에 걸린 홀별표가 화면에 그대로 남는다
    line = line.replace('*', '')
    out, stack, bold, ul = [], [], 0, 0   # stack: 각 span 이 기여한 것 ('c:색'|'u')
    for tok in TAG_RE.split(line):
        if not tok:
            continue
        if tok == '<b>':
            bold += 1
        elif tok == '</b>':
            bold = max(0, bold - 1)
        elif tok.startswith('<span'):
            m = re.search(r'color="([a-z_]+)"', tok)
            if m:
                stack.append('c:' + m.group(1))
            elif 'underline' in tok:
                stack.append('u')
                ul += 1
            else:
                stack.append('?')
        elif tok == '</span>':
            if stack:
                if stack.pop() == 'u':
                    ul = max(0, ul - 1)
        else:
            color = next((s[2:] for s in reversed(stack) if s.startswith('c:')), None)
            out.append([tok, color, bold > 0, ul > 0])
    return out


def cls_of(color, text):
    if color is None:
        return ''
    if color in BG:
        return BG[color]
    if color in FG:
        c = FG[color]
        if c is None:                       # brown — 기출 마커면 exam, 아니면 무색
            return 'cs-exam' if '【' in text else ''
        return c
    return ''


def inline(line):
    line = re.sub(r'\((O|X)\)', lambda m: O_MARK if m.group(1) == 'O' else X_MARK, line)
    rs = runs_of(line)
    # 같은 클래스가 이어지면 span 하나로 합친다 — pink_bg 가 굵기 경계에서
    # 여러 조각으로 갈라져 와서, 안 합치면 알약이 세 토막 난다
    groups = []
    for text, color, bold, ul in rs:
        cls = cls_of(color, text)
        # (O)/(X)만 담은 조각은 색·굵게를 다 벗긴다 — 결론 알약이 이중 포장된다
        if not text.replace(O_MARK, '').replace(X_MARK, '').strip():
            cls, bold, ul = '', False, False
        if groups and groups[-1][0] == cls:
            groups[-1][1].append((text, bold, ul))
        else:
            groups.append([cls, [(text, bold, ul)]])
    parts = []
    for cls, seg in groups:
        inner = ''
        for text, bold, ul in seg:
            t = esc(text)
            if bold:
                t = '<strong>%s</strong>' % t
            if ul and cls != 'cs-exam':
                t = '<span class="cs-u">%s</span>' % t
            inner += t
        if cls and inner.strip():
            parts.append('<span class="%s">%s</span>' % (cls, inner))
        else:
            parts.append(inner)
    s = ''.join(parts)
    s = s.replace(O_MARK, '<span class="cs-o"><strong>(O)</strong></span>')
    s = s.replace(X_MARK, '<span class="cs-x"><strong>(X)</strong></span>')
    # [사안] 태그의 결론이 (X)면 붉은 계열로 — 기존 각론과 같은 규칙
    def negify(m):
        rest = s[m.end():m.end() + 130]
        if 'cs-x' in rest and 'cs-o' not in rest[:rest.find('cs-x')]:
            return m.group(0).replace('cs-fact-tag', 'cs-neg-tag')
        return m.group(0)
    s = re.sub(r'<span class="cs-fact-tag">.*?</span>', negify, s)
    return s.strip()


# ── 블록 ──────────────────────────────────────────────
def depth_of(raw):
    return len(raw) - len(raw.lstrip('\t'))


def parse_blocks(lines, i, base):
    """i 부터 같은 층위 블록들을 html 로. (html, 다음 i) 반환."""
    out = []
    n = len(lines)
    while i < n:
        raw = lines[i]
        if not raw.strip():
            i += 1
            continue
        d = depth_of(raw) - base
        line = raw.strip()

        if line in ('-', '') :                # 주석만 담겼던 불릿의 잔재
            i += 1
            continue
        if line.startswith('</'):             # 닫는 표식은 호출한 쪽이 소비한다
            break

        if line.startswith('<callout'):
            color = (re.search(r'color="([a-z_]*)"', line).group(1) or '').replace('_background', '')
            inner, i = collect(lines, i + 1, '</callout>')
            body, _ = parse_blocks(inner, 0, min((depth_of(x) for x in inner if x.strip()), default=0))
            # 갈색 박스 = 학설·이론 묶음(기존 사이트의 cs-theory), 파랑 = 조문박스
            cls = 'cs-theory' if color == 'brown' else 'cs-callout'
            out.append('<div class="%s">%s</div>' % (cls, body))
            continue

        if line == '<details>':
            summary = ''
            j = i + 1
            if j < n and lines[j].strip().startswith('<summary>'):
                summary = re.sub(r'</?summary>', '', lines[j].strip())
                j += 1
            inner, i = collect(lines, j, '</details>')
            out.append(render_toggle(summary, inner))
            continue

        if line.startswith('<table'):
            buf = [line]
            i += 1
            while i < n:
                buf.append(lines[i].strip())
                if '</table>' in lines[i]:
                    i += 1
                    break
                i += 1
            tbl = '\n'.join(buf)
            head = 'header-row="true"' in tbl
            tbl = re.sub(r'<table[^>]*>', '<table class="sub">', tbl)
            if head:
                first = re.search(r'<tr>.*?</tr>', tbl, re.S)
                if first:
                    tbl = (tbl[:first.start()]
                           + first.group(0).replace('<td>', '<th>').replace('</td>', '</th>')
                           + tbl[first.end():])
            out.append('<div class="cs-tbl" style="overflow-x:auto">%s</div>' % tbl)
            continue

        i += 1
        if line.startswith('- '):
            out.append('<div class="cs-li cs-bul" style="margin-left:%dpx">%s</div>'
                       % (max(0, d) * INDENT, inline(line[2:])))
        elif HEAD_RE.match(line):
            out.append('<div class="cs-h">%s</div>' % inline(line))
        elif LABEL_RE.match(line):
            out.append('<div class="cs-li cs-issue" style="margin-left:%dpx">%s</div>'
                       % (max(0, d) * INDENT, inline(line)))
        else:
            out.append('<div class="cs-li" style="margin-left:%dpx">%s</div>'
                       % (max(0, d) * INDENT, inline(line)))
    return ''.join(out), i


def collect(lines, i, closer):
    """i 부터 closer 짝을 찾을 때까지 안쪽 줄들을 모은다 (중첩 지원)."""
    inner, depth = [], 1
    opener = closer.replace('/', '')
    n = len(lines)
    while i < n:
        s = lines[i].strip()
        if s.startswith(opener[:-1]):     # '<callout' / '<details'
            depth += 1
        elif s == closer:
            depth -= 1
            if depth == 0:
                return inner, i + 1
        inner.append(lines[i])
        i += 1
    return inner, i


def render_toggle(summary, inner):
    """토글 → CASE 상자.

    구조가 둘이다.
      ① 이중 토글: 바깥 [CASE] 토글 안에 summary 가 '모범답안'인 토글이 또 있다.
         안쪽 토글의 표식 줄을 글자로 흘리면 안 되므로 구조로 갈라낸다.
      ② 평면: '모범답안' 이라는 줄 뒤에 답안이 이어진다.
    """
    base = min((depth_of(x) for x in inner if x.strip()), default=0)

    # ① 안쪽 모범답안 토글을 찾는다
    for k, x in enumerate(inner):
        if x.strip() != '<details>':
            continue
        if k + 1 < len(inner) and '모범답안' in inner[k + 1] and inner[k + 1].strip().startswith('<summary>'):
            ans_lines, after = collect(inner, k + 2, '</details>')
            fact, _ = parse_blocks(inner[:k], 0, base)
            tail = inner[after:]
            ans_base = min((depth_of(y) for y in ans_lines if y.strip()), default=0)
            ans, _ = parse_blocks(ans_lines + tail, 0, ans_base)
            return _case(summary, fact, ans)

    # ② 평면 표기
    for k, x in enumerate(inner):
        if '모범답안' in x and depth_of(x) - base <= 1:
            fact, _ = parse_blocks(inner[:k], 0, base)
            ans, _ = parse_blocks(inner[k + 1:], 0, base)
            return _case(summary, fact, ans)

    body, _ = parse_blocks(inner, 0, base)
    return ('<details class="cs-case"><summary>%s</summary>'
            '<div class="cs-case-in">%s</div></details>' % (inline(summary), body))


def _case(summary, fact, ans):
    return ('<details class="cs-case"><summary>%s</summary>'
            '<div class="cs-case-in"><div class="cs-fact">%s</div>'
            '<div class="cs-ans-in"><div class="cs-li"><strong>모범답안</strong></div>%s</div>'
            '</div></details>' % (inline(summary), fact, ans))


# ── 단원 ──────────────────────────────────────────────
def parse_unit(path):
    text = io.open(path, encoding='utf-8').read()
    props = {}
    for line in text.split('\n')[:3]:
        m = re.match(r'<!--\s*props:\s*(\{.*\})\s*-->', line.strip())
        if m:
            props = json.loads(m.group(1))
    # 본문 속 작업 메모(<!--원문p285…-->)는 편집 기록이지 내용이 아니다.
    # 줄 걸침이 있어 통짜 텍스트에서 지운다 (헤더 주석 두 줄은 이미 읽었다)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    body_lines = [l for l in text.split('\n') if l.strip()]
    # 본문 전체를 감싼 껍데기 callout 은 벗긴다 — 로민정과 같은 패턴이다.
    # 안 벗기면 단원 전체가 회색 상자 하나에 갇힌다
    while (body_lines and body_lines[0].strip().startswith('<callout')
           and body_lines[-1].strip() == '</callout>'
           and collect(body_lines, 1, '</callout>')[1] == len(body_lines)):
        body_lines = body_lines[1:-1]
    base = min((depth_of(l) for l in body_lines), default=0)
    html, _ = parse_blocks(body_lines, 0, base)
    return props, html


def main():
    print('parse-only 모듈 — build_criminal.py 를 실행하라')


if __name__ == '__main__':
    main()
