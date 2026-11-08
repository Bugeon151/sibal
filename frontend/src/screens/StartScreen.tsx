import { useState, type FormEvent } from 'react'
import type { Mode, SourceKey } from '@suhaengcut/engine'
import { CharCount, ErrorBox } from '../components/common'
import { relayReady, type UiError } from '../engine/client'
import { cleanLine, LIMITS, lengthError } from '../lib/input'
import { loadRecent, type RecentItem } from '../lib/storage'
import { MODE_LABEL, SOURCE_LABEL, SUBJECTS, type Draft, type Sources, type Subject, type Years } from '../state'

type Props = {
  initial: Draft | null
  error: UiError | null
  onSubmit: (d: Draft) => void
  onOpenRecent: (r: RecentItem) => void
  onClearRecent: () => Promise<void>
}

const SOURCE_KEYS: SourceKey[] = ['kci', 'openalex', 'news']

export function StartScreen({ initial, error, onSubmit, onOpenRecent, onClearRecent }: Props) {
  // 모드는 기본값 없이 매번 고른다 (AI 금지 수업에서 실수로 AI용 기능을 쓰지 않도록).
  const [mode, setMode] = useState<Mode | null>(null)
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [subject, setSubject] = useState<Subject>(initial?.subject ?? '기타')
  // 중계 함수가 없으면 국내 논문·뉴스는 아직 검색할 수 없다 (해외 논문만)
  const [sources, setSources] = useState<Sources>(
    relayReady ? (initial?.sources ?? { kci: true, openalex: true, news: true }) : { kci: false, openalex: true, news: false },
  )
  const [years, setYears] = useState<Years>(initial?.years ?? 10)
  const [recent, setRecent] = useState(loadRecent)
  const [touched, setTouched] = useState(false)
  const [clearing, setClearing] = useState(false)

  const cleaned = cleanLine(topic)
  const topicError = lengthError(cleaned, LIMITS.topic.min, LIMITS.topic.max)
  const onCount = SOURCE_KEYS.filter((k) => sources[k]).length

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!mode || topicError) return
    onSubmit({ mode, topic: cleaned, subject, sources, years })
  }

  async function clear() {
    setClearing(true)
    await onClearRecent()
    setRecent([])
    setClearing(false)
  }

  return (
    <form className="screen" onSubmit={submit} noValidate>
      <section className="block">
        <h1 className="display">
          어떤 주제로
          <br />
          탐구해요?
        </h1>
        <p className="sub">논문이랑 뉴스를 찾아서, 믿을 수 있는 근거만 골라 줄게요.</p>
        <div className="field">
          <input
            id="topic"
            aria-label="탐구 주제"
            className="input xl"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 스마트폰 사용 시간과 수면"
            enterKeyHint="next"
            autoComplete="off"
          />
          <div className="field-foot">
            {touched && topicError ? <p className="field-error">{topicError}</p> : <span />}
            <CharCount value={cleaned.length} max={LIMITS.topic.max} />
          </div>
        </div>
      </section>

      <section className="block">
        <h2 className="block-title">이번 수행평가, AI 써도 돼요?</h2>
        <div className="mode-pick" role="radiogroup" aria-label="모드">
          <button type="button" role="radio" aria-checked={mode === 'ai'} className={`mode-card ${mode === 'ai' ? 'on' : ''}`} onClick={() => setMode('ai')}>
            <span className="mode-emoji" aria-hidden>
              🙆
            </span>
            <strong>네, 써도 돼요</strong>
            <span>자료 + AI용 프롬프트 + 사용 내역까지</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'search_only'}
            className={`mode-card ${mode === 'search_only' ? 'on' : ''}`}
            onClick={() => setMode('search_only')}
          >
            <span className="mode-emoji" aria-hidden>
              🙅
            </span>
            <strong>아니요, 검색만</strong>
            <span>자료·핵심 문장·근거 검사만</span>
          </button>
        </div>
        {touched && !mode && <p className="field-error">하나 골라 주세요.</p>}
        <p className="hint">어느 쪽이든 이 서비스는 AI를 쓰지 않아요. 검색 결과에서 원문 문장만 골라 보여줘요.</p>
      </section>

      <details className="block options">
        <summary>
          <span>검색 옵션</span>
          <span className="summary-val">
            {subject} · {SOURCE_KEYS.filter((k) => sources[k]).map((k) => SOURCE_LABEL[k]).join('·')} · {years === 0 ? '전체 기간' : `최근 ${years}년`}
          </span>
        </summary>
        <div className="options-body">
          <div className="field">
            <span className="field-label">과목</span>
            <div className="chips">
              {SUBJECTS.map((s) => (
                <button type="button" key={s} className={`chip ${subject === s ? 'on' : ''}`} aria-pressed={subject === s} onClick={() => setSubject(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">어디서 찾을까요?</span>
            <div className="chips">
              {SOURCE_KEYS.map((k) => {
                const last = sources[k] && onCount === 1
                const notReady = !relayReady && k !== 'openalex'
                return (
                  <button
                    type="button"
                    key={k}
                    className={`chip ${sources[k] ? 'on' : ''}`}
                    aria-pressed={sources[k]}
                    disabled={last || notReady}
                    title={notReady ? '준비 중이에요' : last ? '최소 1개는 켜져 있어야 해요' : undefined}
                    onClick={() => setSources({ ...sources, [k]: !sources[k] })}
                  >
                    {SOURCE_LABEL[k]}
                    {notReady && ' (준비 중)'}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="field">
            <span className="field-label">논문 기간</span>
            <div className="chips">
              {([0, 10, 5] as Years[]).map((y) => (
                <button type="button" key={y} className={`chip ${years === y ? 'on' : ''}`} aria-pressed={years === y} onClick={() => setYears(y)}>
                  {y === 0 ? '전체' : `최근 ${y}년`}
                </button>
              ))}
            </div>
            <p className="hint">뉴스는 항상 최신 기사부터 봐요.</p>
          </div>
        </div>
      </details>

      {recent.length > 0 && (
        <section className="block">
          <div className="row-between">
            <h2 className="block-title">최근 찾아본 주제</h2>
            <button type="button" className="btn sm ghost" onClick={clear} disabled={clearing}>
              기록 지우기
            </button>
          </div>
          <ul className="recent">
            {recent.map((r) => (
              <li key={r.at}>
                <button type="button" className="recent-row" onClick={() => onOpenRecent(r)}>
                  <span className="recent-text">
                    <strong>{r.question}</strong>
                    <span>
                      {MODE_LABEL[r.mode]} · {new Date(r.at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  <span aria-hidden className="chev">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">이 기기에만 저장돼요. 학교 태블릿이면 다 쓰고 지워 주세요.</p>
        </section>
      )}

      {error && <ErrorBox error={error} />}

      <div className="cta-bar">
        <button type="submit" className="btn primary cta">
          다음
        </button>
      </div>
    </form>
  )
}
