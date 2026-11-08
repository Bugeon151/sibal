import { useState } from 'react'
import type { CandidatePaper, CheckSentencesOutput, Paper, ReasonCode, Verdict } from '@suhaengcut/engine'
import { engine, toUiError, type UiError } from '../engine/client'
import { cleanMultiline, LIMITS } from '../lib/input'
import { CharCount, ErrorBox, EvidenceQuotes, Spinner, type SentenceLookup } from './common'

const VERDICT: Record<Verdict, { label: string; term: string }> = {
  supported: { label: '근거 있어요', term: '지지' },
  partial: { label: '일부만 맞아요', term: '부분 지지' },
  unsupported: { label: '근거를 못 찾았어요', term: '미지지' },
}

/** 미지지라도 "반대 결과"는 근거를 찾은 경우라 문구를 다르게 보여준다 */
function verdictLabel(verdict: Verdict, reasonCode: ReasonCode): string {
  if (verdict === 'unsupported' && reasonCode === 'direction_conflict') return '논문은 반대로 말해요'
  if (verdict === 'partial' && reasonCode === 'number_mismatch') return '숫자를 확인해 주세요'
  return VERDICT[verdict].label
}

type Props = {
  researchId: string
  papers: Paper[]
  lookup: SentenceLookup
  onExpired: (e: UiError) => void
}

export function CheckTab({ researchId, papers, lookup, onExpired }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UiError | null>(null)
  const [result, setResult] = useState<CheckSentencesOutput | null>(null)

  const cleaned = cleanMultiline(text)
  const tooLong = cleaned.length > LIMITS.checkText
  const canSubmit = cleaned.length > 0 && !tooLong && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      setResult(await engine.checkSentences({ researchId, text: cleaned }))
    } catch (e) {
      const err = toUiError(e)
      if (err.code === 'EXPIRED') onExpired(err)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  const candidates = new Map<string, CandidatePaper>(result?.candidates.map((c) => [c.id, c]))
  const selectedPaper = new Map(papers.map((p) => [p.id, p]))
  const counts = result
    ? (['supported', 'partial', 'unsupported'] as Verdict[]).map((v) => [v, result.results.filter((r) => r.verdict === v).length] as const)
    : []

  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <h3 className="section-title">내가 쓴 문장, 근거 있을까?</h3>
          <p className="hint">문장을 붙여 넣으면 고른 논문에 진짜 그런 내용이 있는지 문장마다 확인해요.</p>
        </div>
        <div className="field">
          <div className="field-label">
            <label htmlFor="check-text">내 문장</label>
            <CharCount value={cleaned.length} max={LIMITS.checkText} />
          </div>
          <textarea
            id="check-text"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="예: 스마트폰을 오래 쓸수록 수면 시간이 줄어든다."
          />
          {tooLong && <p className="field-error">{LIMITS.checkText.toLocaleString()}자까지 검사할 수 있어요. 나눠서 넣어 주세요.</p>}
          <p className="hint">🔒 내 문장은 이 기기 밖으로 나가지 않아요. 한 번에 {LIMITS.checkSentences}문장까지 검사해요.</p>
        </div>
        <button type="button" className="btn primary block" onClick={submit} disabled={!canSubmit}>
          근거 확인하기
        </button>
      </section>

      {busy && <Spinner label="문장마다 근거를 찾고 있어요" />}
      {error && <ErrorBox error={error} onRetry={submit} />}

      {result && !busy && (
        <>
          <div className="tally" aria-label="검사 결과 요약">
            {counts.map(([v, n]) => (
              <div key={v} className={`tally-item ${v}`}>
                <span className="tally-n">{n}</span>
                <span>{VERDICT[v].label}</span>
              </div>
            ))}
          </div>
          {result.truncated && <div className="notice warn">앞의 {LIMITS.checkSentences}문장만 검사했어요. 나머지는 따로 넣어 주세요.</div>}

          <ol className="stack plain">
            {result.results.map((r, i) => {
              // 근거가 비었는데 지지로 오면 화면에서도 미지지로 내린다 (판정에는 항상 근거 문장이 붙어야 함)
              const verdict: Verdict = r.verdict !== 'unsupported' && r.evidence.length === 0 ? 'unsupported' : r.verdict
              return (
                <li key={i} className={`card verdict-card ${verdict}`}>
                  <div className="verdict-head">
                    <span className={`verdict ${verdict}`}>{verdictLabel(verdict, r.reasonCode)}</span>
                    <span className="verdict-term">{VERDICT[verdict].term}</span>
                  </div>
                  <p className="my-sentence">{r.sentence}</p>
                  <p className="reason">{r.reason}</p>
                  {r.crossLanguage && <p className="cross">해외 논문(영어) 근거예요. 뜻이 맞는지 직접 확인해 보세요.</p>}
                  {r.evidence.length > 0 && (
                    <div>
                      <h4>근거 문장</h4>
                      <EvidenceQuotes ids={r.evidence} lookup={lookup} />
                    </div>
                  )}
                  {r.newsReference.length > 0 && (
                    <details className="news-ref">
                      <summary>뉴스에서도 비슷한 내용이 있어요 (참고용)</summary>
                      <EvidenceQuotes ids={r.newsReference} lookup={lookup} />
                      <p className="hint">뉴스는 판정 근거로 쓰지 않아요.</p>
                    </details>
                  )}
                  {verdict === 'unsupported' && r.suggestPaperIds.length > 0 && (
                    <div className="suggest">
                      <h4>이 논문을 찾아보면 도움이 될 수 있어요</h4>
                      <ul>
                        {r.suggestPaperIds.map((id) => {
                          const c = candidates.get(id) ?? selectedPaper.get(id)
                          if (!c) return null
                          return (
                            <li key={id}>
                              {c.url ? (
                                <a href={c.url} target="_blank" rel="noopener noreferrer">
                                  {c.title} ↗
                                </a>
                              ) : (
                                c.title
                              )}
                              <span className="meta">
                                {' '}
                                · {c.authors.join(', ')}
                                {c.etAl ? ' 외' : ''} · {c.year}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}
