# -*- coding: utf-8 -*-
"""『민소 단원』 DB → tools/notion_raw_minso/민소-NNN.md.

    python tools/sync_minso.py           # 바뀐 페이지만
    python tools/sync_minso.py --full    # 전량

형사법(sync_crim)과 방식이 같다 — last_edited_time 증분, 페이지별 매니페스트.
"""
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sync_notion import call, prop, blocks  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAWM = ROOT / 'tools' / 'notion_raw_minso'
MANIFEST = RAWM / '_manifest.json'
DB = '25172230-19e8-4814-86e7-2c729d3c78d7'


def main():
    full = '--full' in sys.argv
    RAWM.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}

    rows, cursor = [], None
    while True:
        res = call('POST', '/databases/%s/query' % DB,
                   {'page_size': 100, **({'start_cursor': cursor} if cursor else {})})
        rows += res['results']
        if not res.get('has_more'):
            break
        cursor = res['next_cursor']

    props = [{k: prop(v) for k, v in r['properties'].items()}
             | {'_id': r['id'], '_edited': r.get('last_edited_time', '')} for r in rows]
    props.sort(key=lambda p: p.get('논점번호') or 0)

    changed, expected = 0, set()
    for p in props:
        n = int(p.get('논점번호') or 0)
        out = RAWM / ('민소-%03d.md' % n)
        expected.add(out.name)
        if not full and manifest.get(p['_id']) == p['_edited'] and out.exists():
            continue
        body = '\n'.join(blocks(p['_id']))
        meta = {k: v for k, v in p.items() if not k.startswith('_')}
        io.open(out, 'w', encoding='utf-8', newline='\n').write(
            '<!-- notion-page: %s -->\n<!-- props: %s -->\n%s\n'
            % (p['_id'].replace('-', ''), json.dumps(meta, ensure_ascii=False), body))
        manifest[p['_id']] = p['_edited']
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding='utf-8')
        changed += 1
        print('  받음 %s %6.1fKB' % (out.stem, out.stat().st_size / 1024), flush=True)

    for old in RAWM.glob('민소-*.md'):
        if old.name not in expected:
            old.unlink()
            print('  삭제 %s (노션에 더 없음)' % old.name)
    print('민소: %d행 중 %d개 갱신' % (len(props), changed))
    return changed


if __name__ == '__main__':
    main()
