# @suhaengcut/engine

수행컷 처리 엔진. 학생 기기의 브라우저 안에서 검색·선별·요약·비교표·문장 검사를 수식과 규칙으로 처리한다. AI·LLM 호출은 없다.
명세: [docs/데이터-입력-명세.md](../../docs/데이터-입력-명세.md)

## 프론트에서 쓰는 법

```ts
import { createEngine, EngineError } from '@suhaengcut/engine'

// 기기 ID는 localStorage에 한 번 만들어 계속 쓴다 (중계 함수 호출 제한용)
const deviceId = localStorage.getItem('deviceId') ?? crypto.randomUUID()
localStorage.setItem('deviceId', deviceId)

const engine = createEngine({
  relayBaseUrl: import.meta.env.VITE_RELAY_URL, // 키 중계 함수 주소
  deviceId,
  // openAlexRoute: 'auto' (기본) — OpenAlex는 브라우저에서 직접, 막히면 중계로
})

// 1. 탐구 질문 후보
const { questions, keywords } = await engine.suggestQuestions({ topic: '스마트폰 사용이 청소년 수면에 미치는 영향' })

// 2. 검색 → 결과 화면 (논문·뉴스·핵심 문장·비교표)
const research = await engine.runResearch({
  mode: 'ai', // 또는 'search_only'
  topic,
  question: questions[0].text,
  keywords,
  sources: { kci: true, openalex: true, news: true },
  years: 10,
})

// 3. 내 문장 검사 (두 모드 모두)
const { results, candidates } = await engine.checkSentences({ researchId: research.researchId, text })

// 4·5. AI 허용 모드에서만 (검색만 모드면 MODE_FORBIDDEN)
const pkg = await engine.buildPackage({ researchId })
const { text: disclosureText } = await engine.buildDisclosure({ researchId, tools: ['ChatGPT'], extraPrompts: [], scope: ['자료 수집'] })

// 기록 지우기 버튼
await engine.clearAll()
```

### 오류 처리

모든 함수는 실패 시 `EngineError`를 던진다. `e.message`는 학생에게 그대로 보여줄 수 있는 한국어다.

```ts
try { ... } catch (e) {
  if (e instanceof EngineError) showToast(e.message) // e.code: INVALID_INPUT | MODE_FORBIDDEN | NO_RESULTS | EXPIRED | RATE_LIMITED | SOURCES_DOWN | OFFLINE
}
```

### 화면 표시 규칙

- 근거·핵심 문장은 `paper.sentences`에서 ID로 찾아 **그대로** 보여준다. 문장을 고치거나 만들지 않는다.
- `evidence`가 빈 배열이면 "근거 없음"으로 표시한다.
- `sourceStatus`에 `failed`가 있으면 "국내 논문 검색이 잠시 안 돼요" 같은 안내를 띄운다. 결과는 나머지 소스로 나온다.
- `crossLanguage: true`면 "해외 논문 근거, 직접 확인 필요"를 함께 표시한다.
- `suggestPaperIds`의 서지는 `checkSentences` 반환의 `candidates`에 있다.
- 무거운 계산이 있으므로 Web Worker 안에서 `createEngine`을 만들고 Comlink 등으로 함수를 노출하는 것을 권장한다.

## 개발

```bash
npm test          # 루트에서. 엔진 + 중계 함수 테스트
npm run typecheck
```

## 평가

```bash
npm run eval:f6   # F6 판정 세트 채점 + 임계값 격자 탐색
```

`eval/f6-set.json`에 문장을 추가하면 된다. 정확도·미지지 탐지가 기준(`eval/f6.test.ts`의 FLOOR) 아래로 내려가면 `npm test`가 실패한다.

## 사전 만들기

```bash
npm run build:dict <KCI XML 폴더> [최소 등장 수=3]   # src/lexicon/data/generated.json 생성
```

## 아직 확정 전인 것

- **KCI XML 요소 이름:** `src/sources/kci.ts`의 `FIELD_CANDIDATES`가 후보 이름으로 찾는다. 키를 받으면 실제 응답을 `test/fixtures.ts`에 넣고 이름을 확정한다.
- **토크나이저:** 규칙 기반 `RuleTokenizer`를 계속 쓴다. Kiwi는 기본 모델이 신경망이고 약 110MB라 제외했다. 오분석은 `src/text/tokenizer.ts`의 예외 사전(`KO_KEEP`)으로 보강한다.
- **가중치·임계값:** `src/config.ts`의 값은 모두 초기값. 판정 세트로 조정한다.
- **사전:** `src/lexicon/dictionary.ts`는 시드 데이터. 배포용은 KCI 한·영 키워드 쌍에서 스크립트로 만든다.
