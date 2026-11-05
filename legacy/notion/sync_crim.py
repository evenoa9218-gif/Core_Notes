# -*- coding: utf-8 -*-
"""형법 논점 DB·형소 쟁점 DB → tools/notion_raw_crim/*.md.

    python tools/sync_crim.py           # 바뀐 페이지만
    python tools/sync_crim.py --full    # 전량

로민정과 파일만 다르고 방식은 같다 — last_edited_time 이 저장된 것과 같으면
본문 요청을 건너뛴다. 변환(notion2criminal)은 아직 없으므로 여기서는 받기만
한다. 파일 이름은 논점 키를 그대로 쓴다(형법-개인001.md, 형소-105.md).
"""
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sync_notion import RAW, call, prop, blocks  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAWC = ROOT / 'tools' / 'notion_raw_crim'
MANIFEST = RAWC / '_manifest.json'

# (표시명, DB id, 파일 키가 되는 속성, 정렬 속성)
DBS = [
    ('형법', '2fd6b247-3c80-47a3-b782-abcc80d987a8', '논점번호', '논점번호'),
    ('형소', 'a28420c6-170d-4efb-9d42-41a7c069a70c', '번호', '번호'),
]


def sync_db(name, did, key_prop, sort_prop, manifest, full):
    rows, cursor = [], None
    while True:
        res = call('POST', '/databases/%s/query' % did,
                   {'page_size': 100, **({'start_cursor': cursor} if cursor else {})})
        rows += res['results']
        if not res.get('has_more'):
            break
        cursor = res['next_cursor']

    props = [{k: prop(v) for k, v in r['properties'].items()}
             | {'_id': r['id'], '_edited': r.get('last_edited_time', '')} for r in rows]
    props.sort(key=lambda p: (str(p.get(sort_prop) or ''), p.get(key_prop) or ''))

    expected, changed = set(), 0
    for p in props:
        key = p.get(key_prop)
        key = ('%03d' % key) if isinstance(key, (int, float)) else str(key)
        out = RAWC / ('%s-%s.md' % (name, key))
        expected.add(out.name)
        if not full and manifest.get(p['_id']) == p['_edited'] and out.exists():
            continue
        body = '\n'.join(blocks(p['_id']))
        meta = {k: v for k, v in p.items() if not k.startswith('_')}
        io.open(out, 'w', encoding='utf-8', newline='\n').write(
            '<!-- notion-page: %s -->\n<!-- props: %s -->\n%s\n'
            % (p['_id'].replace('-', ''), json.dumps(meta, ensure_ascii=False), body))
        manifest[p['_id']] = p['_edited']
        # 페이지마다 바로 기록한다 — 끝에서 한 번만 쓰면 도중에 죽었을 때
        # 받아 둔 것까지 전부 다시 받는다 (레이트리밋으로 실제로 겪었다)
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding='utf-8')
        changed += 1
        print('  받음 %s %6.1fKB' % (out.stem, out.stat().st_size / 1024), flush=True)

    for old in RAWC.glob('%s-*.md' % name):
        if old.name not in expected:
            old.unlink()
            print('  삭제 %s (노션에 더 없음)' % old.name)
    print('%s: %d행 중 %d개 갱신' % (name, len(props), changed), flush=True)
    return changed


def main():
    full = '--full' in sys.argv
    RAWC.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    total = sum(sync_db(*db, manifest, full) for db in DBS)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding='utf-8')
    print('총 %d개 갱신' % total)


if __name__ == '__main__':
    main()
