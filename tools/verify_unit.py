"""옮겨적은 단원 파일이 온전한지, 변환이 표기를 잃지 않는지 본다.

    python tools/verify_unit.py 21

검사 두 갈래:
  ① 원본 md — 꼬리(원문 대조 푸터)가 붙어 있는지, 표기가 몇 개인지.
     잘림은 여기서 잡힌다. 단어가 조용히 바뀐 것은 못 잡는다.
  ② md → html 변환 — 표기 개수가 그대로 넘어갔는지. 이건 기계적으로 판정된다.
"""
import io, json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import notion2civil as N

RAW = Path(__file__).resolve().parent / 'notion_raw'

# 원본 표기 → 변환 결과에서 대응되는 것
PAIRS = [
    ('★',          r'★',                        r'★'),
    ('(O)',        r'\(O\)',                    r'class="cs-o"'),
    ('(X)',        r'\(X\)',                    r'class="cs-x"'),
    ('【…】',       r'【[^】]*】',                r'class="cs-exam"'),
    ('正辯',        r'正辯',                      r'正辯'),
    ('밑줄',        r'<span underline="true">',   r'class="cs-u"'),
    ('형광펜',      r'<span color="[a-z]+_bg">(?!【)', r'class="cs-hl"'),
    ('####제목',    r'(?m)^#{2,4}\s',            r'class="cs-h"'),
]


def check(no, subject='채권총론'):
    path = RAW / ('%s-%s.md' % (subject, no))
    md = io.open(path, encoding='utf-8').read()
    body, _, footer = md.rpartition('---')
    tail_ok = '원문 대조' in footer
    case_ok = '## CASE' in md

    # 변환이 의도적으로 버리는 줄(푸터·자재표시자)만 빼고 전부 센다
    src = '\n'.join(l for l in md.split('\n')
                    if not l.strip().startswith('> 원문 대조')
                    and not re.match(r'^\*\(.*\)\*$', l.strip())
                    and not l.startswith('<!--'))
    html = N.convert(md)

    rows = []
    for name, sre, hre in PAIRS:
        a = len(re.findall(sre, src))
        b = len(re.findall(hre, html))
        if name == '####제목':          # CASE 제목 하나는 의도적으로 버린다
            a = len(re.findall(sre, src))
        rows.append((name, a, b, '=' if a == b else '≠'))

    # 표기 개수보다 강한 검사 — 원본 각 줄의 알맹이가 변환 결과 안에 그대로 있는가
    def plain(s):
        s = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', lambda m: m.group(1), s)
        s = re.sub(r'<[^>]+>', '', s)
        s = s.replace('\\[', '[').replace('\\]', ']').replace('\\~', '~')
        s = re.sub(r'\*\*|\*|`|^#{2,4}\s|^[\t]*[->]\s*', '', s)
        return re.sub(r'\s+', ' ', s).strip()

    # 띄어쓰기는 변환 과정에서 한두 칸 달라진다(★ 뒤 공백 등). 글자만 남겨 비교한다.
    squash = lambda s: re.sub(r'\s+', '', s)
    hp = squash(plain(html))
    missing = []
    for l in src.split('\n'):
        t = plain(l)
        if len(t) >= 4 and squash(t) not in hp:
            missing.append(t)

    lines = [l for l in src.split('\n') if l.strip() and not l.startswith('<!--')]
    print('%-4s %s' % (no, path.name))
    print('     원본 %d줄 %d자 · 변환 %d자 · 꼬리 %s · CASE %s'
          % (len(lines), len(src), len(html),
             'O' if tail_ok else 'X — 잘렸는지 확인!',
             'O' if case_ok else '없음'))
    print('     ' + ' | '.join('%s %d%s%d' % (n, a, s, b) for n, a, b, s in rows))
    bad = [n for n, a, b, s in rows if s == '≠']
    if bad:
        print('     ⚠ 변환에서 어긋난 표기: ' + ', '.join(bad))
    if missing:
        print('     ⚠ 변환에서 빠진 줄 %d개:' % len(missing))
        for t in missing[:3]:
            print('        · ' + t[:90])
    if not tail_ok:
        print('     ⚠ 푸터(원문 대조)가 없다 — 옮기다 끊겼을 수 있다')
    return not bad and not missing and tail_ok


if __name__ == '__main__':
    args = sys.argv[1:] or sorted(p.stem.split('-')[1] for p in RAW.glob('채권총론-*.md'))
    ok = all(check(a) for a in args)
    sys.exit(0 if ok else 1)
