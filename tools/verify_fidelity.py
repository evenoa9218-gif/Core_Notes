# -*- coding: utf-8 -*-
"""변환 불변식: raw 의 글자가 변환 후에도 전부 남아 있는가.

기존 사이트와의 대조는 원문 진화(7월 C-10 재정리) 때문에 판정이 안 된다.
변환기가 책임질 것은 하나 — 입력 글자를 흘리지 않는 것. raw 에서 마크업을
벗긴 글자와 html 에서 태그를 벗긴 글자를 비교한다.
"""
import io
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import notion2criminal as n2c


def strip_raw(text):
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    s = text
    s = re.sub(r'</?(?:callout|details|summary|table|tr|td)[^>]*>', '', s)
    s = re.sub(r'</?span[^>]*>', '', s)
    s = s.replace('*', '').replace('`', '')
    s = re.sub(r'^\s*-\s*$', '', s, flags=re.M)
    s = re.sub(r'^\s*-\s', '', s, flags=re.M)
    return re.sub(r'[\s​]+', '', s)


def strip_html(h):
    s = re.sub(r'<[^>]+>', '', h)
    s = s.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    return re.sub(r'[\s​]+', '', s)


def main():
    pats = sys.argv[1:] or ['형법-*.md', '형소-*.md']
    bad = total = 0
    for pat in pats:
        for p in sorted(n2c.RAW.glob(pat)):
            text = io.open(p, encoding='utf-8').read()
            try:
                props, html = n2c.parse_unit(p)
            except Exception as e:
                print('✗ %s 변환 예외: %s' % (p.stem, e))
                bad += 1
                continue
            a, b = strip_raw(text), strip_html(html)
            total += 1
            if a == b:
                continue
            # 어긋난 첫 지점을 보여 준다
            i = 0
            while i < min(len(a), len(b)) and a[i] == b[i]:
                i += 1
            print('✗ %-12s raw %5d ≠ html %5d | …%s → …%s'
                  % (p.stem, len(a), len(b), a[max(0, i - 15):i + 25], b[max(0, i - 15):i + 25]))
            bad += 1
    print('총 %d단원 / 불일치 %d' % (total, bad))


if __name__ == '__main__':
    main()
