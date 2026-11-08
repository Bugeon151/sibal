import { useState } from 'react'
import type { SuggestQuestionsOutput } from '@suhaengcut/engine'
import { TagInput } from '../components/TagInput'
import { CharCount, ErrorBox } from '../components/common'
import type { UiError } from '../engine/client'
import { cleanLine, LIMITS, lengthError } from '../lib/input'
import { MODE_LABEL, type Draft, type Query } from '../state'

type Props = {
  draft: Draft
  suggestion: SuggestQuestionsOutput
  /** 모드 전환 등으로 다시 들어올 때 이전 선택을 채워 둔다 */
  previous?: Query
  error: UiError | null
  onBack: () => void
  onSubmit: (q: Query) => void
}

export function QuestionScreen({ draft, suggestion, previous, error, onBack, onSubmit }: Props) {
  const first = suggestion.questions[0]
  const initialText = previous?.question ?? first?.text ?? ''
  const [selected, setSelected] = useState<string | null>(suggestion.questions.find((q) => q.text === initialText)?.id ?? null)
  const [text, setText] = useState(initialText)
  const [keywords, setKeywords] = useState(previous?.keywords ?? suggestion.keywords.slice(0, LIMITS.keywordsMax))
  const [keywordsEn, setKeywordsEn] = useState(previous?.keywordsEn ?? [])
  const [touched, setTouched] = useState(false)

  const cleaned = cleanLine(text)
  const qError = lengthError(cleaned, LIMITS.question.min, LIMITS.question.max)
  const kwError = keywords.length === 0 ? '키워드를 1개 이상 넣어 주세요.' : null

  function submit() {
    setTouched(true)
    if (qError || kwError) return
    onSubmit({ question: cleaned, keywords, keywordsEn })
  }

  return (
    <div className="screen">
      <div className="screen-top">
        <button type="button" className="back" onClick={onBack} aria-label="주제 다시 쓰기">
          ‹
        </button>
        <span className={`pill mode-${draft.mode}`}>{MODE_LABEL[draft.mode]}</span>
      </div>

      <section className="hero">
        <p className="kicker">📌 {draft.topic}</p>
        <h1 className="display sm">
          어떤 <mark className="mk">질문</mark>으로 파고들까요?
        </h1>
        <p className="sub">하나 고르고, 마음에 안 들면 직접 고쳐도 돼요.</p>
      </section>

      <section className="block">
        <div className="choices" role="radiogroup" aria-label="탐구 질문 후보">
          {suggestion.questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              role="radio"
              aria-checked={selected === q.id}
              className={`choice ${selected === q.id ? 'on' : ''}`}
              onClick={() => {
                setSelected(q.id)
                setText(q.text)
              }}
            >
              <span className="qn" aria-hidden>
                Q{i + 1}
              </span>
              {q.text}
            </button>
          ))}
        </div>
        <div className="field">
          <div className="field-label">
            <label htmlFor="question">내 탐구 질문</label>
            <CharCount value={cleaned.length} max={LIMITS.question.max} />
          </div>
          <textarea
            id="question"
            rows={2}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setSelected(null)
            }}
          />
          {(touched || cleaned.length > LIMITS.question.max) && qError && <p className="field-error">{qError}</p>}
        </div>
      </section>

      <section className="block">
        <h2 className="block-title">🔑 이 키워드로 찾을게요</h2>
        <TagInput
          id="kw"
          label="키워드"
          hint="주제에서 뽑았어요. 빼거나 더해도 돼요."
          tags={keywords}
          onChange={setKeywords}
          max={LIMITS.keywordsMax}
          maxLen={LIMITS.keywordMaxLen}
          placeholder="입력하고 Enter"
        />
        {touched && kwError && <p className="field-error">{kwError}</p>}
        {draft.sources.openalex && (
          <TagInput
            id="kw-en"
            label="영어 키워드 (선택)"
            hint="비워 두면 주제를 알아서 영어로 바꿔서 찾아요."
            tags={keywordsEn}
            onChange={setKeywordsEn}
            max={LIMITS.keywordsMax}
            maxLen={LIMITS.keywordMaxLen}
            placeholder="e.g. smartphone"
          />
        )}
      </section>

      {error && <ErrorBox error={error} />}

      <div className="cta-bar">
        <button type="button" className="btn primary cta" onClick={submit}>
          자료 찾으러 가기
        </button>
      </div>
    </div>
  )
}
