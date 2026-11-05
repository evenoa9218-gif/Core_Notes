# 노션 동기화 — 2026-11-05 중단

본문의 정본이 노션에서 **암기장 저장소(`units/`)** 로 옮겨졌다.
여기 있는 것들은 그 전까지 쓰던 것이고, 돌리면 안 된다 —
`sync_*.py` 는 `data-*.js` 를 통째로 덮어쓰므로 블록 id 가 날아간다.

| 파일 | 하던 일 |
|---|---|
| `notion-sync.yml` | 매일 05:00 KST 노션 → 번들 |
| `sync_notion.py` · `sync_crim.py` · `sync_minso.py` | 노션 API 로 raw 받기 |
| `verify_fidelity.py` | raw 글자 수 = html 글자 수 (불변식) |

`verify_fidelity.py` 의 자리는 **`tools/verify_ids.js`** 가 이었다 —
비교할 바깥(노션)이 없어졌으므로 직전 커밋을 기준으로
「블록 id 는 사라지지 않는다」를 본다.

노션 본문의 동결본은 전환 시점 번들, 즉 커밋 `f923746` 의 `data-*.js` 다.
되돌릴 일이 있으면 거기서 꺼낸다.

GitHub 저장소 설정의 `NOTION_TOKEN` 시크릿은 더 쓰지 않는다 — 지워도 된다.

## 번들 조립기도 같이 내렸다

`notion2*.py` · `build_criminal.py` · `build_minso.py` · `build_gongbeop.py` ·
`test_convert.py` · `verify_criminal.py` — 전부 `notion_raw*/` 를 읽어
`data-*.js` 를 통째로 쓰던 것들이다. 그 자리는 `tools/build_bundle.js` 가 이었다.
