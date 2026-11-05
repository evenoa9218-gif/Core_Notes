"""옮겨적기 단계(노션 → md)를 간접적으로 훑는 보강 검사.

verify_unit.py 는 'md → 변환 HTML' 손실만 본다. 내가 옮겨 적다가 흘린 것은
그쪽으로는 절대 안 잡히므로, 여기서는 파일 자체의 앞뒤가 맞는지를 본다.

  ① props 의 과목·번호가 파일명과 맞는가        — 헤더를 잘못 복사했는가
  ② <span> 여닫이가 줄마다 맞는가               — 줄 중간이 잘렸는가
  ③ 들여쓰기가 한 단계씩만 깊어지는가            — 부모 줄을 흘렸는가
  ④ 단원 번호가 빠짐없이 이어지는가
  ⑤ 원문 페이지 범위가 앞 단원 끝 + 1 로 이어지는가 — 단원을 통째로 건너뛰었는가

⑤가 가장 세다. 본문을 흘리면 못 잡지만, 단원 하나를 통째로 빠뜨리면 반드시 걸린다.
"""
import io, re, json, glob
from collections import defaultdict

SUBJECTS = ['채권총론', '채권각론', '민법총칙', '물권법']
RAW = 'tools/notion_raw/%s-*.md'
NO = re.compile(r'-(\d+)\.md$')
PROPS = re.compile(r'<!-- props: (\{.*\}) -->')
# 꼬리: 추출 txt `[p.84]`\~`[p.87]`  (물결 앞의 역슬래시는 md 이스케이프)
FOOT = re.compile(r'추출 txt `\[p\.(\d+)\]`(?:\s*\\?~\s*`\[p\.(\d+)\]`)?')


def units(subject):
    paths = glob.glob(RAW % subject)
    return sorted(paths, key=lambda p: int(NO.search(p).group(1)))


def main():
    bad = defaultdict(list)
    total = 0

    for s in SUBJECTS:
        seq = []
        for p in units(s):
            total += 1
            no = int(NO.search(p).group(1))
            text = io.open(p, encoding='utf-8').read()
            lines = text.split('\n')

            m = PROPS.search(text)
            if not m:
                bad['props 없음'].append(p)
            else:
                pr = json.loads(m.group(1))
                if pr.get('번호') != no or pr.get('과목') != s:
                    bad['props 불일치'].append('%s → %s %s' % (p, pr.get('과목'), pr.get('번호')))

            for i, l in enumerate(lines, 1):
                o, c = len(re.findall(r'<span\b', l)), l.count('</span>')
                if o != c:
                    bad['span 불균형'].append('%s:%d (<span %d, </span> %d)' % (p, i, o, c))

            prev = 0
            for i, l in enumerate(lines, 1):
                if not l.strip() or l.startswith('<!--'):
                    continue
                d = len(l) - len(l.lstrip('\t'))
                if d > prev + 1:
                    bad['들여쓰기 점프'].append('%s:%d (%d→%d)' % (p, i, prev, d))
                prev = d

            f = FOOT.search(text)
            seq.append((no, int(f.group(1)), int(f.group(2) or f.group(1))) if f
                       else (no, None, None))
        yield s, seq, bad, total


if __name__ == '__main__':
    result = list(main())
    bad = result[0][2]
    total = result[-1][3]
    print('검사 대상 %d단원\n' % total)
    for k in ['props 없음', 'props 불일치', 'span 불균형', '들여쓰기 점프']:
        v = bad[k]
        print('  %-12s %s' % (k, '이상 없음' if not v else '%d건' % len(v)))
        for x in v[:6]:
            print('       ·', x)

    print('\n[단원 번호·원문 페이지 연속성]')
    for s, seq, _, _ in result:
        nums = [n for n, _, _ in seq]
        holes = [n for n in range(nums[0], nums[-1] + 1) if n not in nums]
        gaps = ['%d(~p.%s) → %d(p.%s~)' % (n1, b1, n2, a2)
                for (n1, _, b1), (n2, a2, _) in zip(seq, seq[1:])
                if b1 is None or a2 is None or a2 != b1 + 1]
        print('  %-6s %2d단원  번호 %d~%d (빠진 번호: %s)  본문 p.%s~p.%s  %s'
              % (s, len(seq), nums[0], nums[-1], holes or '없음',
                 seq[0][1], seq[-1][2],
                 '페이지 연속' if not gaps else '끊김 %d곳 — %s' % (len(gaps), ', '.join(gaps))))
