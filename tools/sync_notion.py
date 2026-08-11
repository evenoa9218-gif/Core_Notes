"""노션 「로민정 단원」 DB → tools/notion_raw/*.md → data-civil.js.

    set NOTION_TOKEN=ntn_...        (한 번만)
    python tools/sync_notion.py 채권총론

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
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:            # 초당 3회 제한
                time.sleep(2 ** attempt)
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
            t = '<span color="%s">%s</span>' % (color, t)
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
                acc.append('<!-- table: %d행 — 확인 필요 -->' % (data.get('table_width') or 0))
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


def main():
    if not TOKEN:
        sys.exit('NOTION_TOKEN 환경변수가 없다.')
    subject = sys.argv[1] if len(sys.argv) > 1 else '채권총론'
    RAW.mkdir(parents=True, exist_ok=True)

    rows, cursor = [], None
    while True:
        res = call('POST', '/databases/%s/query' % DB,
                   {'filter': {'property': '과목', 'select': {'equals': subject}},
                    'page_size': 100, **({'start_cursor': cursor} if cursor else {})})
        rows += res['results']
        if not res.get('has_more'):
            break
        cursor = res['next_cursor']

    props = [{k: prop(v) for k, v in r['properties'].items()} | {'_id': r['id']} for r in rows]
    props.sort(key=lambda p: p.get('번호') or 0)
    print('%s %d단원' % (subject, len(props)))

    for p in props:
        body = '\n'.join(blocks(p['_id']))
        meta = {k: p[k] for k in ('과목', '번호', '주제', '장', '절', '관', '원본 p.', '판례태그') if k in p}
        out = RAW / ('%s-%s.md' % (subject, p.get('번호')))
        io.open(out, 'w', encoding='utf-8', newline='\n').write(
            '<!-- notion-page: %s -->\n<!-- props: %s -->\n%s\n'
            % (p['_id'].replace('-', ''), json.dumps(meta, ensure_ascii=False), body))
        print('  %-3s %-24s %6.1fKB' % (p.get('번호'), p.get('주제'), out.stat().st_size / 1024))

    import notion2civil
    notion2civil.main.__globals__['sys'].argv = ['notion2civil', subject]
    notion2civil.main()


if __name__ == '__main__':
    main()
