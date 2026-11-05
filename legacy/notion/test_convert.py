# -*- coding: utf-8 -*-
"""변환기를 한 단원에 돌려 결과를 눈으로 본다 (개발용)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import notion2criminal as n2c

key = sys.argv[1] if len(sys.argv) > 1 else '형법-개인001'
props, html = n2c.parse_unit(n2c.RAW / (key + '.md'))
print('제목:', props.get('제목') or props.get('쟁점'))
h = html.replace('<div', '\n<div').replace('<details', '\n<details').replace('</details>', '\n</details>')
print(h)
