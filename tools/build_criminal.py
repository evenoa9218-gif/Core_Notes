# -*- coding: utf-8 -*-
"""notion_raw_crim/*.md → data-criminal.js 조립.

    python tools/build_criminal.py

전역 셋을 쓴다:
  CRIM_GAKRON_CONCEPT  형법 총론+각론 (기존 전역명 유지 — 앱 폴링이 이 이름을 기다린다)
  CRIM_CATS_DATA       형법 목차 [[key,이름],...] (총론 앞, 각론 뒤)
  CRIMPRO_UNITS / CRIMPRO_CATS_DATA  형사소송법

각론 110개의 id(개인001…)는 기존과 같게 유지한다 — 진도(lawmj_progress_v1)가
id 에 붙어 있다. 각론의 목차 배정도 기존 데이터를 정답지로 삼아 그대로 쓴다.
"""
import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import notion2criminal as n2c

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data-criminal.js'

# 총론 60논점의 목차 — 장 이름을 그대로 키로 쓰면 이름이 길어서 짧은 표시명을 단다
CHONG_LABEL = {}   # 장 → (key, 표시명), 등장 순서대로 만든다


def old_cat_map():
    """기존 데이터에서 각론 id → cat 을 읽는다.

    반드시 스냅샷(tools/data-criminal.old.js)에서 읽는다 — 조립기가
    data-criminal.js 자체를 덮어쓰므로 두 번째 실행부터는 원본이 없다."""
    s = io.open(ROOT / 'tools' / 'data-criminal.old.js', encoding='utf-8').read()
    m = re.search(r'window\.CRIM_GAKRON_CONCEPT = (\[.*?\]);', s, re.S)
    if not m:
        return {}, []
    rows = json.loads(m.group(1))
    order = []
    for r in rows:
        if r[5] not in order:
            order.append(r[5])
    return {r[0]: r[5] for r in rows}, order


GAK_NAMES = {'gak_생명신체': '생명·신체', 'gak_자유': '자유', 'gak_성범죄': '성범죄',
             'gak_명예주거': '명예·주거', 'gak_절도강도': '절도·강도', 'gak_사기공갈': '사기·공갈',
             'gak_횡령배임': '횡령·배임', 'gak_기타재산': '기타 재산', 'gak_사회': '사회적 법익',
             'gak_국가공무원': '국가·공무원', 'gak_국가공무방해': '공무방해'}


def crim_rows():
    old_cats, old_order = old_cat_map()
    files = sorted(n2c.RAW.glob('형법-*.md'))
    chong, gak = [], []
    chong_cats = []
    for p in files:
        props, html = n2c.parse_unit(p)
        no = props.get('논점번호') or p.stem.split('-', 1)[1]
        title = props.get('제목') or no
        tags = list(props.get('중요도') or []) + list(props.get('기출') or [])
        if no.startswith('형총'):
            chap = props.get('장') or '총론'
            if chap not in CHONG_LABEL:
                key = 'chong_%02d' % (len(CHONG_LABEL) + 1)
                CHONG_LABEL[chap] = (key, re.sub(r'^제\d+장\s*', '', chap))
                chong_cats.append([key, CHONG_LABEL[chap][1]])
            chong.append([no, title, html, tags, 1, CHONG_LABEL[chap][0]])
        else:
            cat = old_cats.get(no)
            if not cat:
                # 정답지에 없는 각론 논점 — 장으로 짐작하되 눈에 띄게 알린다
                cat = old_order[-1] if old_order else 'gak_기타'
                print('  ⚠ %s (%s) 기존 목차에 없음 → %s' % (no, title, cat))
            gak.append([no, title, html, tags, 1, cat])
    gak.sort(key=lambda r: (old_order.index(r[5]) if r[5] in old_order else 99, r[0]))
    cats = chong_cats + [[k, GAK_NAMES.get(k, k)] for k in old_order]
    return chong + gak, cats


def proc_rows():
    files = sorted(n2c.RAW.glob('형소-*.md'))
    rows, cats, seen = [], [], {}
    for p in files:
        props, html = n2c.parse_unit(p)
        no = int(props.get('번호') or 0)
        title = re.sub(r'^쟁점\s*\d+\.\s*', '', props.get('쟁점') or '')
        chap = (props.get('장') or props.get('편') or '기타').strip()
        if chap not in seen:
            key = 'pro_%02d' % (len(seen) + 1)
            seen[chap] = key
            cats.append([key, re.sub(r'^제\d+장\.?\s*', '', chap)])
        tags = [t for t in (props.get('중요도'), props.get('기출빈도')) if t]
        tags += [t.strip() for t in (props.get('기출') or '').split(',') if t.strip()]
        rows.append(['형소%03d' % no, title, html, tags, 1, seen[chap]])
    rows.sort(key=lambda r: r[0])
    return rows, cats


def main():
    crim, crim_cats = crim_rows()
    pro, pro_cats = proc_rows()
    body = ''.join('window.%s = %s;\n' % (k, json.dumps(v, ensure_ascii=False)) for k, v in [
        ('CRIM_CATS_DATA', crim_cats),
        ('CRIM_GAKRON_CONCEPT', crim),
        ('CRIMPRO_CATS_DATA', pro_cats),
        ('CRIMPRO_UNITS', pro),
    ])
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body)
    print('형법 %d(총론 %d) · 형소 %d → %s (%.1fMB)'
          % (len(crim), sum(1 for r in crim if r[0].startswith('형총')), len(pro),
             OUT.name, OUT.stat().st_size / 1e6))
    for k, name in crim_cats + pro_cats:
        n = sum(1 for r in crim + pro if r[5] == k)
        print('  %-16s %-14s %d' % (k, name, n))


if __name__ == '__main__':
    main()
