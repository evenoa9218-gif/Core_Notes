# -*- coding: utf-8 -*-
"""notion_raw_minso/*.md → data-minso.js 조립 + 글자 불변식 검증.

    python tools/build_minso.py

변환 규칙은 형사법 변환기(notion2criminal)를 그대로 쓴다 — 민소 방언은
형사법과 같은 계열(회색 껍데기 callout·span 색·(O)(X))이고, 로마자 제목이
heading 블록으로 온다는 점만 다르다(변환기에 반영됨).

검증을 조립 안에 내장한다: raw 글자 ≠ html 글자면 그 자리에서 실패시킨다.
CI 에서도 돌므로 변환 규칙이 깨지면 배포 전에 멈춘다.
"""
import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import notion2criminal as n2c

ROOT = Path(__file__).resolve().parent.parent
RAWM = ROOT / 'tools' / 'notion_raw_minso'
OUT = ROOT / 'data-minso.js'

PYEON = ['제1편 총론', '제2편 소송의 주체', '제3편 제1심의 소송절차',
         '제4편 소송의 종료', '제5편 상소심절차', '제6편 병합소송']


def strip_raw(text):
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    s = re.sub(r'</?(?:callout|details|summary|table|tr|td)[^>]*>', '', text)
    s = re.sub(r'</?span[^>]*>', '', s)
    s = s.replace('*', '').replace('`', '')
    s = re.sub(r'^\s*#+\s*', '', s, flags=re.M)
    s = re.sub(r'^\s*-\s*$', '', s, flags=re.M)
    s = re.sub(r'^\s*-\s', '', s, flags=re.M)
    return re.sub(r'[\s​]+', '', s)


def strip_html(h):
    s = re.sub(r'<[^>]+>', '', h)
    s = s.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    return re.sub(r'[\s​]+', '', s)


def main():
    rows, cats, seen = [], [], set()
    bad = 0
    for p in sorted(RAWM.glob('민소-*.md')):
        text = io.open(p, encoding='utf-8').read()
        props, html = n2c.parse_unit(p)
        if strip_raw(text) != strip_html(html):
            print('✗ %s 글자 불변식 실패' % p.stem)
            bad += 1
            continue
        n = int(props.get('논점번호') or 0)
        pyeon = props.get('편') or ''
        key = 'mp_%d' % (PYEON.index(pyeon) + 1 if pyeon in PYEON else 9)
        if key not in seen:
            seen.add(key)
            cats.append([key, pyeon or '기타'])
        tags = [t for t in (props.get('중요도'),) if t]
        rows.append(['민소%03d' % n, props.get('주제') or p.stem, html, tags, 1, key])
    if bad:
        sys.exit('불변식 실패 %d건 — 배포 중단' % bad)
    rows.sort(key=lambda r: r[0])
    cats.sort(key=lambda c: c[0])

    body = ('window.MINSO_CATS_DATA = %s;\nwindow.MINSO_UNITS = %s;\n'
            % (json.dumps(cats, ensure_ascii=False), json.dumps(rows, ensure_ascii=False)))
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body)
    print('민소 %d논점 → %s (%.1fKB)' % (len(rows), OUT.name, OUT.stat().st_size / 1024))
    for k, name in cats:
        print('  %-6s %-18s %d' % (k, name, sum(1 for r in rows if r[5] == k)))


if __name__ == '__main__':
    main()
