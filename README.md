# 수행평가 리서치 (가칭)

고등학생이 탐구 주제를 넣으면 국내외 논문·뉴스를 찾고, 내가 쓴 문장이 논문으로 뒷받침되는지 확인해 주는 리서치 도구.
서비스 안에서는 AI를 쓰지 않는다. 모든 처리는 학생 브라우저 안에서 수식·규칙으로 한다. 운영 서버 없음.

| 폴더 | 내용 |
| --- | --- |
| `docs/` | [PRD](docs/PRD.md), [데이터·입력 명세](docs/데이터-입력-명세.md) |
| `packages/engine` | 처리 엔진 (검색·선별·핵심 문장·비교표·문장 검사) — [사용법](packages/engine/README.md) |
| `packages/relay` | 키 중계 함수 (Cloudflare Workers): API 키를 붙여 전달만, 엣지 캐시 |
| `frontend` | 화면 (React + Vite PWA) — [README](frontend/README.md) |

```bash
npm ci && npm test        # 엔진·중계 함수 테스트
npm run eval:f6           # 문장 검사 판정 세트 채점
cd frontend && npm ci && npm run dev   # 화면 (중계 주소가 없으면 데모 모드)
```

배포는 `.github/workflows/`가 main에 올릴 때마다 한다: 화면 → GitHub Pages, 중계 함수 → Cloudflare Workers(토큰이 있을 때).
