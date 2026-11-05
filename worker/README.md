# 암기장 쓰기 Worker

앱에서 고친 단원을 `units/{과목}/{단원}.json` 으로 커밋하는 Cloudflare Worker.

## 왜 Worker 인가

2026-11-05부터 본문의 정본은 노션이 아니라 이 저장소의 `units/` 다.
앱에서 줄을 고치면 그게 저장소에 커밋돼야 하는데 —

- 앱은 GitHub Pages 에 정적으로 올라간다. 서버가 없다
- **저장소가 public 이다.** 쓰기 토큰을 브라우저(localStorage)에 두면,
  앱에 XSS 구멍이 하나 생기는 순간 저장소 전체를 쓸 수 있는 토큰이 샌다

그래서 토큰은 Worker 의 secret 에만 두고, 앱은 **비밀번호** 하나로 여기에 말한다.
비밀번호가 새도 피해가 `units/` 안이고 git 이력으로 전부 되돌아온다.

```
암기장 ──비밀번호──▶ Worker (토큰은 secret) ──▶ GitHub Contents/Git Data API
```

---

## 배포

준비물: Cloudflare 계정(무료 플랜으로 충분), GitHub 계정.

### 1. GitHub 토큰 만들기

**fine-grained** PAT 를 쓴다. classic 토큰은 범위를 못 좁힌다.

1. GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained tokens** → Generate new token
2. **Repository access**: Only select repositories → **`Core_Notes` 하나만**
3. **Permissions → Repository permissions → Contents: Read and write**
   (다른 건 전부 No access 로 둔다. Metadata 는 자동으로 Read 가 붙는다)
4. 만료일은 90일쯤으로 두고 달력에 적어 둔다 — 만료되면 저장이 401 로 막힌다

### 2. 올리기

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

### 3. 비밀값 두 개 넣기

```bash
npx wrangler secret put GH_TOKEN
```

```bash
npx wrangler secret put APP_PASSWORD
```

`GH_TOKEN` 은 1번에서 만든 토큰, `APP_PASSWORD` 는 **앱에서 기기마다 한 번 입력할 비밀번호**다.
둘 다 붙여넣어도 화면에 안 보인다. 아무 데도 적지 말고 비밀번호 관리자에 넣는다.

### 4. 주소를 앱에 넣기

배포되면 `https://core-notes-writer.<계정>.workers.dev` 같은 주소가 나온다.
그 주소를 `index.html` 의 `WRITER_URL` 에 넣고 커밋하면 저장 단추가 켜진다.

살아 있는지 먼저 본다 (비밀번호 없이도 되는 길이다):

```bash
curl https://core-notes-writer.<계정>.workers.dev/health
```

---

## 길

| | |
|---|---|
| `POST /save` | 단원 여러 개를 **커밋 하나**로 저장 |
| `GET /history?subj=민법&id=채총20` | 그 단원의 커밋 30개 |
| `GET /history?subj=민법&id=채총20&sha=…` | 그 시점의 단원 내용 (되돌리기) |
| `GET /health` | 살아 있는지 (비밀번호 필요 없음) |

`/save` 가 받는 것:

```json
{ "units": [ { "subj": "민법", "id": "채총20", "unit": { "id": "채총20", … } } ],
  "message": "암기장: 채총20 형광펜",
  "allowDrop": false, "confirmShrink": false }
```

커밋을 하나로 묶는 이유는 이력 때문이다. Contents API 는 파일마다 커밋을 하나씩
만들어서, 읽기 세션 하나가 커밋 수십 개를 남긴다. Git Data API 로 트리를 직접 짜면
단원 몇 개를 고쳐도 커밋이 하나다.

---

## 여기가 마지막 방어선이다

노션이 정본이던 때는 `verify_fidelity.py`(raw 글자 = html 글자)가 누락을 잡았고,
무엇이 잘못돼도 노션에 원본이 남아 있었다. **이제 그 바깥이 없다.**
CI 의 `tools/verify_ids.js` 는 커밋이 **된 뒤에** 도는 그물이라 쓰기 자체를 막지 못한다.

그래서 같은 검사를 여기서 먼저 한다.

| | 검사 | 넘기려면 |
|---|---|---|
| ① | 경로가 `units/{아는 과목}/{단원id}.json` 인가 | 못 넘긴다 |
| ② | 단원 모양 — `id`·`t`·`b`, 블록마다 `i`·`o`, id 중복 없음 | 못 넘긴다 |
| ③ | **블록 id 가 사라지지 않는가** (지금 올라간 파일과 대조) | `allowDrop: true` |
| ④ | 글자가 한 번에 20% 넘게 줄지 않는가 | `confirmShrink: true` |

③ 은 409 와 함께 사라지는 id 목록을 돌려준다. 지울 생각이면 **블록에 `"x":1` 을 달아
숨기는 쪽**이 맞다 — 진도·오답·기출연결이 전부 블록 id 에 붙어 있어서,
id 를 지우면 그 기록이 같이 끊긴다.

④ 는 줄여야 할 때도 있으니 막지 않고 **되묻는다.** 앱이 「−37%, 계속할까」를 보여 주고
사람이 누르면 그때 `confirmShrink` 를 켜서 다시 보낸다.

---

## 손볼 때

- 과목을 더하면 `src/index.js` 의 `SUBJECTS` 에 넣는다 (경로 검사에 쓰인다)
- 앱 주소가 바뀌면 `ALLOWED_ORIGINS`
- 분당 쓰기 제한은 `wrangler.toml` 의 `WRITE_LIMIT` (기본 20/분)
- 토큰이 만료되면 저장이 401 로 막힌다. 새로 만들어 `wrangler secret put GH_TOKEN` 다시

## 시험

```bash
cp worker/src/index.js worker/src/index.mjs && node worker/test.mjs && rm worker/src/index.mjs
```

GitHub 을 가짜로 세우고 ①~④ 가 실제로 막는지 본다(16건).
배포하기 전에 한 번, `src/index.js` 를 고칠 때마다 한 번 돌린다.
