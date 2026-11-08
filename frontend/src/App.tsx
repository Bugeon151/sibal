import { useState } from 'react'
import type { Mode, RunResearchOutput, SuggestQuestionsOutput } from '@suhaengcut/engine'
import { BusyOverlay } from './components/common'
import { engine, isDemo, scope, toUiError, type UiError } from './engine/client'
import { addRecent, clearRecent, type RecentItem } from './lib/storage'
import { QuestionScreen } from './screens/QuestionScreen'
import { ResultScreen } from './screens/ResultScreen'
import { StartScreen } from './screens/StartScreen'
import type { Draft, Query } from './state'

type View =
  | { kind: 'start' }
  | { kind: 'question'; draft: Draft; suggestion: SuggestQuestionsOutput; previous?: Query }
  | { kind: 'result'; draft: Draft; query: Query; research: RunResearchOutput }

const STEPS = ['주제 정하기', '질문 고르기', '자료 보기']

function Stepper({ now }: { now: number }) {
  return (
    <ol className="stepper" aria-label="진행 단계">
      {STEPS.map((s, i) => (
        <li key={s} className={i < now ? 'done' : i === now ? 'now' : undefined} aria-current={i === now ? 'step' : undefined}>
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  )
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'start' })
  const [lastDraft, setLastDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<UiError | null>(null)

  function go(next: View) {
    setError(null)
    setView(next)
    window.scrollTo({ top: 0 })
  }

  async function withBusy<T>(message: string, run: () => Promise<T>): Promise<T | undefined> {
    setBusy(message)
    setError(null)
    try {
      return await run()
    } catch (e) {
      setError(toUiError(e))
      return undefined
    } finally {
      setBusy(null)
    }
  }

  async function toQuestion(draft: Draft, previous?: Query) {
    setLastDraft(draft)
    const suggestion = await withBusy('주제를 살펴보고 있어요', () => engine.suggestQuestions({ topic: draft.topic, subject: draft.subject }))
    if (suggestion) go({ kind: 'question', draft, suggestion, previous })
  }

  async function runResearch(draft: Draft, query: Query) {
    setLastDraft(draft)
    const research = await withBusy('논문이랑 뉴스를 찾고 있어요', () =>
      engine.runResearch({
        mode: draft.mode,
        topic: draft.topic,
        question: query.question,
        keywords: query.keywords,
        keywordsEn: query.keywordsEn.length ? query.keywordsEn : undefined,
        sources: draft.sources,
        years: draft.years,
      }),
    )
    if (!research) return
    addRecent({ at: new Date().toISOString(), ...draft, ...query })
    go({ kind: 'result', draft, query, research })
  }

  function switchMode(mode: Mode) {
    if (view.kind !== 'result') return
    // 서비스는 두 모드 모두 AI를 쓰지 않으므로 같은 조건으로 다시 찾으면 된다 (기기 캐시에서 바로 나옴)
    runResearch({ ...view.draft, mode }, view.query)
  }

  async function clearAll() {
    clearRecent()
    try {
      await engine.clearAll() // IndexedDB의 리서치·캐시까지 함께 삭제
    } catch {
      /* 저장소가 없으면 지울 것도 없다 */
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => go({ kind: 'start' })}>
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={30} height={30} />
          수행평가 리서치
        </button>
        {isDemo && (
          <span className="demo-flag" title="개발용 데모 모드: 엔진 테스트용 예시 자료로 동작 중">
            데모 · 예시 자료
          </span>
        )}
        {scope === 'openalex' && (
          <span className="demo-flag" title="국내 논문과 뉴스 검색은 준비 중이에요">
            지금은 해외 논문만 검색돼요
          </span>
        )}
      </header>

      <main className="container">
        {view.kind !== 'result' && <Stepper now={view.kind === 'start' ? 0 : 1} />}
        {view.kind === 'start' && (
          <StartScreen
            initial={lastDraft}
            error={error}
            onSubmit={(d) => toQuestion(d)}
            onOpenRecent={(r: RecentItem) => {
              const { at: _at, question, keywords, keywordsEn, ...draft } = r
              runResearch(draft, { question, keywords, keywordsEn: keywordsEn ?? [] })
            }}
            onClearRecent={clearAll}
          />
        )}
        {view.kind === 'question' && (
          <QuestionScreen
            key={view.draft.topic}
            draft={view.draft}
            suggestion={view.suggestion}
            previous={view.previous}
            error={error}
            onBack={() => go({ kind: 'start' })}
            onSubmit={(q) => runResearch(view.draft, q)}
          />
        )}
        {view.kind === 'result' && (
          <ResultScreen
            key={view.research.researchId}
            draft={view.draft}
            query={view.query}
            research={view.research}
            error={error}
            onSwitchMode={switchMode}
            onRerun={() => runResearch(view.draft, view.query)}
            onEditQuestion={() => toQuestion(view.draft, view.query)}
            onNewTopic={() => go({ kind: 'start' })}
          />
        )}
      </main>

      {busy && <BusyOverlay message={busy} />}
    </div>
  )
}
