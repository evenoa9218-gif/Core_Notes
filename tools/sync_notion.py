"""노션 「로민정 단원」 DB → tools/notion_raw/*.md → data-civil.js.

    setx NOTION_TOKEN ntn_...       (한 번만, 새 터미널부터 적용)
    python tools/sync_notion.py             # 4과목 전부, 바뀐 페이지만
    python tools/sync_notion.py 채권총론     # 한 과목만
    python tools/sync_notion.py --full      # 전량 다시 받기

노션 페이지 하나를 고치면 그 페이지만 다시 받는다. 페이지 목록 조회가
과목당 1회이고, last_edited_time 이 저장된 것과 같으면 본문 요청을 건너뛴다.
그래서 "노션에서 한 단원 수정 → 실행" 이 몇 초로 끝난다.

토큰은 노션 통합(Integration)의 시크릿이다. 저장소에 넣지 말 것 —
환경변수 또는 GitHub Actions Secret 으로만 넘긴다.

받아쓰는 마크다운은 노션 MCP 가 보여주는 것과 같은 방언이다(색·밑줄 span 보존).
그래야 notion2civil.py 가 형광펜·【判例】·(O)/(X) 를 그대로 옮길 수 있다.
"""
import io, json, os, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'tools' / 'notion_raw'
DB = '29845dc4-3c49-4355-8a75-9465db957ec3'          # 로민정 단원
API = 'https://api.notion.com/v1'
TOKEN = os.environ.get('NOTION_TOKEN', '')


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + TOKEN,
                 'Notion-Version': '2022-06-28',
                 'Content-Type': 'application/json',
                 'User-Agent': 'core-notes-sync/1.0'})   # UA 없으면 앞단에서 막힌다
    for attempt in range(8):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                time.sleep(0.34)     # 초당 3회 제한을 애초에 안 밟는다
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 7:
                # 분당 제한에 걸리면 "몇 분 뒤에 다시" 수준으로 길게 기다려야 한다.
                # 짧은 지수 백오프(최대 8초)로는 같은 창에 다시 부딪혀 죽는다.
                wait = max(int(e.headers.get('Retry-After') or 0), 20 * (attempt + 1))
                print('  429 — %d초 대기' % wait, flush=True)
                time.sleep(wait)
                continue
            sys.exit('%s %s → %s\n%s' % (method, path, e.code, e.read().decode()[:400]))
    return None


# ── rich_text → 마크다운 방언 ─────────────────────────
def rt(items):
    out = []
    for it in items or []:
        t = it.get('plain_text', '')
        if not t:
            continue
        a = it.get('annotations') or {}
        if a.get('code'):      t = '`%s`' % t
        if a.get('bold'):      t = '**%s**' % t
        if a.get('italic'):    t = '*%s*' % t
        if a.get('underline'): t = '<span underline="true">%s</span>' % t
        color = a.get('color', 'default')
        if color != 'default':
            # API 는 yellow_background, MCP 방언(notion2civil 이 아는 쪽)은 yellow_bg.
            # 이걸 안 맞추면 형광펜 규칙이 못 알아보고 색만 벗겨 낸다 — 실제로
            # 첫 동기화에서 형광펜 수천 개가 통째로 사라졌었다.
            t = '<span color="%s">%s</span>' % (color.replace('_background', '_bg'), t)
        if it.get('href'):
            t = '[%s](%s)' % (t, it['href'])
        out.append(t)
    return ''.join(out)


HEADS = {'heading_1': '##', 'heading_2': '##', 'heading_3': '####'}


def blocks(bid, depth=0, acc=None):
    acc = [] if acc is None else acc
    cursor = None
    while True:
        q = '/blocks/%s/children?page_size=100' % bid + (('&start_cursor=' + cursor) if cursor else '')
        res = call('GET', q)
        for b in res['results']:
            t = b['type']
            data = b.get(t) or {}
            text = rt(data.get('rich_text'))
            pad = '\t' * depth
            if t == 'toggle':
                # 형사법 CASE 가 토글이다. 여는/닫는 표시를 잃으면 변환기가
                # 접이식 구조를 복원할 수 없어서 details 로 감싸 보존한다
                acc.append('%s<details>' % pad)
                acc.append('%s<summary>%s</summary>' % (pad, text))
                if b.get('has_children'):
                    blocks(b['id'], depth + 1, acc)
                acc.append('%s</details>' % pad)
                continue
            if t in HEADS:
                acc.append('%s %s' % (HEADS[t], text))
            elif t == 'bulleted_list_item' or t == 'numbered_list_item':
                acc.append('%s- %s' % (pad, text))
            elif t == 'quote':
                acc.append('%s> %s' % (pad, text))
            elif t == 'to_do':
                acc.append('%s- %s' % (pad, text))
            elif t == 'divider':
                acc.append('---')
            elif t == 'code':
                acc.append('%s`%s`' % (pad, text))
            elif t == 'table':
                # 행은 children(table_row)으로 온다. MCP 방언과 같은 HTML 로 펴서
                # notion2civil 의 표 처리(<table class="sub">, 첫 행 th 승격)에 태운다
                rows, tcur = [], None
                while True:
                    tq = '/blocks/%s/children?page_size=100' % b['id'] + (('&start_cursor=' + tcur) if tcur else '')
                    tres = call('GET', tq)
                    for row in tres['results']:
                        cells = (row.get('table_row') or {}).get('cells') or []
                        rows.append('<tr>' + ''.join(
                            '<td>%s</td>' % ''.join(x.get('plain_text', '') for x in c)
                            for c in cells) + '</tr>')
                    if not tres.get('has_more'):
                        break
                    tcur = tres['next_cursor']
                acc.append('<table%s>' % (' header-row="true"' if data.get('has_column_header') else ''))
                acc += rows
                acc.append('</table>')
            elif text:
                acc.append(pad + text)
            if b.get('has_children') and t != 'table':
                blocks(b['id'], depth + 1, acc)
        if not res.get('has_more'):
            break
        cursor = res['next_cursor']
    return acc


def prop(p):
    t = p['type']
    v = p[t]
    if t == 'title' or t == 'rich_text': return rt(v)
    if t == 'number':      return v
    if t == 'select':      return v['name'] if v else ''
    if t == 'multi_select':return [o['name'] for o in v]
    if t == 'checkbox':    return v
    if t == 'formula':     return v.get('string') or v.get('number')
    return None


MANIFEST = RAW / '_manifest.json'   # 페이지 id → 마지막으로 받은 last_edited_time


def sync_subject(subject, manifest, full):
    rows, cursor = [], None
    while True:
        res = call('POST', '/databases/%s/query' % DB,
                   {'filter': {'property': '과목', 'select': {'equals': subject}},
                    'page_size': 100, **({'start_cursor': cursor} if cursor else {})})
        rows += res['results']
        if not res.get('has_more'):
            break
        cursor = res['next_cursor']

    props = [{k: prop(v) for k, v in r['properties'].items()}
             | {'_id': r['id'], '_edited': r.get('last_edited_time', '')} for r in rows]
    props.sort(key=lambda p: p.get('번호') or 0)

    expected, changed = set(), 0
    for p in props:
        out = RAW / ('%s-%s.md' % (subject, p.get('번호')))
        expected.add(out.name)
        # 속성만 바꿔도 last_edited_time 이 바뀌므로 놓치는 수정은 없다
        if not full and manifest.get(p['_id']) == p['_edited'] and out.exists():
            continue
        body = '\n'.join(blocks(p['_id']))
        meta = {k: p[k] for k in ('과목', '번호', '주제', '장', '절', '관', '원본 p.', '판례태그') if k in p}
        io.open(out, 'w', encoding='utf-8', newline='\n').write(
            '<!-- notion-page: %s -->\n<!-- props: %s -->\n%s\n'
            % (p['_id'].replace('-', ''), json.dumps(meta, ensure_ascii=False), body))
        manifest[p['_id']] = p['_edited']
        changed += 1
        print('  받음 %-3s %-24s %6.1fKB' % (p.get('번호'), p.get('주제'), out.stat().st_size / 1024))

    # 번호가 바뀌거나 페이지가 빠지면 옛 파일이 남는다 — 남겨두면 사이트에 유령 단원이 생긴다
    for old in RAW.glob('%s-*.md' % subject):
        if old.name not in expected:
            old.unlink()
            print('  삭제 %s (노션에 더 없음)' % old.name)
    print('%s: %d단원 중 %d개 갱신' % (subject, len(props), changed))
    return changed


def main():
    if not TOKEN:
        sys.exit('NOTION_TOKEN 환경변수가 없다.')
    args = [a for a in sys.argv[1:] if a != '--full']
    full = '--full' in sys.argv
    RAW.mkdir(parents=True, exist_ok=True)
    # --full 이어도 기록은 남긴다 — 지우면 다음 증분 실행이 전량을 다시 받는다
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}

    import notion2civil
    subjects = args or notion2civil.SUBJECTS
    total = sum(sync_subject(s, manifest, full) for s in subjects)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding='utf-8')

    if total == 0:
        print('바뀐 페이지 없음 — data-civil.js 그대로')
        return
    notion2civil.main.__globals__['sys'].argv = ['notion2civil']   # 전 과목으로 다시 빌드
    notion2civil.main()


if __name__ == '__main__':
    main()
