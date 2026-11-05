# -*- coding: utf-8 -*-
"""각론 110단원: 새 변환 결과를 기존 데이터와 대조한다.

기존 html 은 옛 규칙(학설 줄 쪼개기 등)이라 마크업은 다르게 생겼다.
그래서 태그를 벗긴 '글자'로 비교한다 — 글자가 빠졌으면 변환기가 내용을
흘린 것이고, 그건 서식 차이와 달리 용납이 안 된다.
"""
import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import notion2criminal as n2c

ROOT = Path(__file__).resolve().parent.parent
K = 10


def strip(h):
    s = re.sub(r'<[^>]+>', '', h)
    return re.sub(r'[\s​]+', '', s)


def sh(s):
    return {s[i:i + K] for i in range(len(s) - K + 1)} if len(s) >= K else {s}


def main():
    s = io.open(ROOT / 'tools' / 'data-criminal.old.js', encoding='utf-8').read()
    old = {r[0]: r for r in json.loads(
        re.search(r'window\.CRIM_GAKRON_CONCEPT = (\[.*?\]);', s, re.S).group(1))}

    report = []
    for p in sorted(n2c.RAW.glob('형법-*.md')):
        no = p.stem.split('-', 1)[1]
        if no not in old:
            continue
        props, html = n2c.parse_unit(p)
        a, b = strip(old[no][2]), strip(html)
        sa, sb = sh(a), sh(b)
        # 옛 데이터에 있는데 새 데이터에 없는 조각 = 변환기가 흘린 내용
        lost = len(sa - sb) / max(1, len(sa))
        gained = len(sb - sa) / max(1, len(sb))
        report.append((lost, gained, no, len(a), len(b)))

    report.sort(reverse=True)
    bad = [r for r in report if r[0] > 0.05]
    print('대조 %d단원 / 소실률 5%% 초과 %d개' % (len(report), len(bad)))
    for lost, gained, no, la, lb in report[:12]:
        print('  %s  소실 %4.1f%%  신규 %4.1f%%  글자 %5d → %5d' % (no, lost * 100, gained * 100, la, lb))


if __name__ == '__main__':
    main()
