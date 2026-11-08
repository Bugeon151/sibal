# frontend (화면)

PRD의 "화면 (UI)" 부분. 판단 로직은 없고, `packages/engine`의 함수만 부른다.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 타입 체크 + 정적 PWA 빌드 (dist/)
```

## 구조

- `src/engine/worker.ts`: 처리 엔진(`@suhaengcut/engine`)을 Web Worker에서 실행
- `src/engine/client.ts`: 화면 → 워커 호출. 화면 코드는 여기 있는 `engine`만 쓴다.
- `src/screens/`: 시작 → 탐구 질문 → 결과 (탭 7개, 검색만 모드는 5개)
- 엔진 소스는 빌드 단계 없이 Vite alias로 그대로 번들한다 (`vite.config.ts`, `tsconfig.json`의 paths).

## 환경 변수 (`.env`)

| 변수 | 설명 |
| --- | --- |
| `VITE_RELAY_URL` | 키 중계 함수 주소 (절대 URL). **비우면 데모 모드**: 엔진 테스트 fixture(`packages/engine/test/fixtures.ts`)를 응답으로 쓴다. 주제와 상관없이 같은 예시 자료가 나오고, 화면 상단에 "데모" 표시가 뜬다. |
| `VITE_OPENALEX_DIRECT` | 개발용. `true`면 OpenAlex를 직접 호출만 한다. 기본은 직접 호출 후 한도에 걸리면 중계 함수로 넘어감 |
| `BASE_PATH` (빌드 시) | 하위 경로 배포용. GitHub Pages는 `/sibal-hehe/` |

## 디자인 원칙

- 주 사용자는 10대 고등학생. 친근한 해요체, 짧은 문장, 큰 터치 영역(48px 이상)
- 깔끔한 톤: 회색 바탕 + 흰 카드, 굵은 제목, 파란색 하나만 강조
- 태블릿 가로·세로·분할 화면(320px~) 대응, 다크 모드 대응
- 화면은 문장을 만들거나 고치지 않는다. 근거가 없으면 "근거 없음"으로 표시
