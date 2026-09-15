# -*- coding: utf-8 -*-
"""한 파일에 두 과목이 들어 있던 데이터를 과목별로 가른다.

    python tools/split_data.py

왜 —
  data-criminal.js 는 형법(1,148KB)과 형소(1,012KB)를 같이 담고 있었다.
  형법에 들어가기만 해도 형소를 통째로 받아 파싱했다. data-public.js 도 같다.
  과목 하나가 제 몫만 받게 가른다.

어떻게 —
  `window.NAME = ` 경계에서 **글자를 그대로 잘라** 옮긴다. 다시 만들지 않는다.
  그래서 내용이 달라질 여지가 없다(검증: tools/verify_split.js).
"""
import io, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = {
    'data-criminal.js': {'data-crim.js':    ['CRIM_CATS_DATA', 'CRIM_GAKRON_CONCEPT'],
                         'data-crimpro.js': ['CRIMPRO_CATS_DATA', 'CRIMPRO_UNITS']},
    'data-public.js':   {'data-const.js':   ['CONST_CATS_DATA', 'CONST_UNITS'],
                         'data-admin.js':   ['ADMIN_CATS_DATA', 'ADMIN_UNITS']},
}

def blocks(text):
    """window.NAME = ... ; 를 이름 → 글자토막 으로 가른다 (자르기만 한다)."""
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'^window\.([A-Z_0-9]+)\s*=', text, re.M)]
    out = {}
    for i, (pos, name) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out[name] = text[pos:end]
    return out

def main():
    for src, targets in PLAN.items():
        p = ROOT / src
        if not p.exists():
            print('건너뜀(없음) %s' % src); continue
        text = io.open(p, encoding='utf-8', newline='').read()
        have = blocks(text)
        for out_name, names in targets.items():
            missing = [n for n in names if n not in have]
            if missing:
                print('✗ %s 에 %s 가 없다' % (src, missing)); sys.exit(1)
            body = ''.join(have[n] for n in names)
            io.open(ROOT / out_name, 'w', encoding='utf-8', newline='').write(body)
            print('  %-18s %8.0f KB  (%s)' % (out_name, len(body.encode('utf-8')) / 1024, ', '.join(names)))
        # 옮기지 않은 덩어리가 있으면 알린다 — 조용히 빠지는 일이 없게
        moved = {n for ns in targets.values() for n in ns}
        left = [n for n in have if n not in moved]
        if left:
            print('⚠ %s 에 안 옮긴 덩어리: %s' % (src, left)); sys.exit(1)

if __name__ == '__main__':
    main()
