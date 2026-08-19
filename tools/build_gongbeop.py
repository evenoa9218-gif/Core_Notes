# -*- coding: utf-8 -*-
"""units_{과목}.json → Core_Notes/data-public.js

암기장 사이트가 읽는 형태로 공법 두 과목을 조립한다.
민소·형사법은 노션 본문이 이미 사이트 방언(cs-* 클래스)이라 그대로 옮기면 됐지만,
공법은 지면 전사본이라 마크다운을 사이트 방언으로 옮겨야 한다.

행 형식은 기존과 같다: [id, title, html, tags, level, cat]
  cat = "제N편 · 제N장" (사이트가 ' · ' 로 갈라 편/장을 표시한다)

**글자 불변식**을 조립 안에 넣는다 — 마크다운에서 뽑은 글자와 html 에서 뽑은 글자가
다르면 그 자리에서 실패시킨다. 변환 규칙이 깨지면 배포 전에 멈춘다.
"""
import json, re, sys, os

BASE = r"D:\_gongbeop"
OUT = r"C:\Users\82109\Core_Notes\data-public.js"

# 과목 → (전역변수 접두어, 논점 id 접두어)
SUBJ = {"헌법": ("CONST", "헌법"), "행정법": ("ADMIN", "행정")}

ROMAN = {"I": "Ⅰ", "II": "Ⅱ", "III": "Ⅲ", "IV": "Ⅳ", "V": "Ⅴ", "VI": "Ⅵ",
         "VII": "Ⅶ", "VIII": "Ⅷ", "IX": "Ⅸ", "X": "Ⅹ", "XI": "Ⅺ", "XII": "Ⅻ",
         "XIII": "ⅩⅢ", "XIV": "ⅩⅣ", "XV": "ⅩⅤ", "XVI": "ⅩⅥ", "XVII": "ⅩⅦ"}

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def inline(s):
    """줄 안쪽 서식. 지면의 점선 밑줄(**…**)이 사이트의 형광펜(cs-hl)이 된다."""
    s = esc(s)
    s = re.sub(r"\*\*(.+?)\*\*", r'<span class="cs-hl">\1</span>', s, flags=re.S)
    # 판례 인용 괄호는 옅게 — 지면에서도 파란 작은 글씨다
    s = re.sub(r"(\((?:헌법재판소|헌재|대법원|대법)\s[^)]*\))",
               r'<span class="cs-stat">\1</span>', s)
    # 조문은 회색 꼬리표
    s = re.sub(r"(§\s?\d+[^\s,.)]*)", r'<span class="cs-statute">\1</span>', s)
    return s

def to_html(body):
    out = []
    for raw in body.split("\n"):
        t = raw.strip()
        if not t:
            continue
        if t == "[참조판례]":
            out.append('<div class="cs-glabel">참조 판례</div>'); continue
        m = re.match(r"^\[기출\]\s*(.+)$", t)
        if m:
            out.append('<div class="cs-li" style="margin-left:0px">'
                       f'<span class="cs-exam">{esc(m.group(1))}</span></div>'); continue
        if t.startswith(">"):
            out.append('<div class="cs-ans-in">' + inline(t.lstrip("> ").strip()) + "</div>")
            continue
        m = re.match(r"^(#{2,6})\s+(.+)$", t)
        if m:
            lvl, txt = len(m.group(1)), m.group(2)
            txt = re.sub(r"^([IVX]+)\.", lambda x: ROMAN.get(x.group(1), x.group(1)) + ".", txt)
            n = txt.count("★")
            txt = re.sub(r"\s*★+\s*$", "", txt)
            star = f'<span class="cs-star">{"★"*n}</span>' if n else ""
            # 전사 규약: I.=####  1.=#####  가.=######  (편/장/절은 속성으로 빠졌다)
            # 그래서 사이트의 큰 제목(cs-h)은 #### 가 맡는다.
            if lvl <= 4:
                out.append(f'<div class="cs-h">{star}{esc(txt)}</div>')
            else:
                pad = min((lvl - 4) * 16, 32)
                out.append(f'<div class="cs-li" style="margin-left:{pad}px">'
                           f'<strong>{star}{esc(txt)}</strong></div>')
            continue
        out.append('<div class="cs-li" style="margin-left:0px">' + inline(t) + "</div>")
    return "".join(out)

def chars(s):
    """불변식용 — 서식을 걷어낸 글자만."""
    s = re.sub(r"<[^>]*>", "", s)
    s = s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    for a, b in ROMAN.items():
        s = s.replace(b, a)
    s = re.sub(r"^[>#\-\s]+", "", s, flags=re.M)
    s = s.replace("**", "").replace("[참조판례]", "참조 판례").replace("[기출]", "")
    return re.sub(r"\s+", "", s)

def build(name):
    pre, idpre = SUBJ[name]
    units = json.load(open(os.path.join(BASE, f"units_{name}.json"), encoding="utf-8"))
    rows, cats, seen = [], [], set()
    bad = []
    for i, u in enumerate(units, 1):
        cat = f'{u["pyeon"]} · {u["jang"] or ""}'.rstrip(" ·")
        if cat not in seen:
            seen.add(cat); cats.append([cat, cat])
        html = to_html(u["body"])
        a, b = chars(u["body"]), chars(html)
        # ★ 는 제목 뒤(원문)에서 앞(사이트 방언)으로 자리를 옮긴다 — 자리는 달라도 개수는 같아야 한다.
        if sorted(a) != sorted(b):
            bad.append((i, u["title"], len(a), len(b)))
        tags = []
        if u["stars"]:
            tags.append("★" * u["stars"])
        tags.append(f'p.{u["book_from"]}-{u["book_to"]}')
        rows.append([f'{idpre}{i:03d}', u["title"], html, tags, u["stars"] or 1, cat])
    if bad:
        print(f"⚠ {name}: 글자 불변식 실패 {len(bad)}건")
        for x in bad[:5]:
            print("   ", x)
        return None, None
    print(f"{name}: {len(rows)}논점 / {len(cats)}개 장 — 글자 불변식 통과")
    return rows, cats

if __name__ == "__main__":
    parts, ok = [], True
    for name in ("헌법", "행정법"):
        rows, cats = build(name)
        if rows is None:
            ok = False; continue
        pre = SUBJ[name][0]
        parts.append(f"window.{pre}_CATS_DATA = " +
                     json.dumps(cats, ensure_ascii=False) + ";")
        parts.append(f"window.{pre}_UNITS = " +
                     json.dumps(rows, ensure_ascii=False) + ";")
    if not ok:
        sys.exit(1)
    open(OUT, "w", encoding="utf-8").write("\n".join(parts) + "\n")
    print(f"→ {OUT}  {os.path.getsize(OUT):,} bytes")
