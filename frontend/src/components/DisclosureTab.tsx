import { useState } from 'react'
import type { BuildDisclosureOutput } from '@suhaengcut/engine'
import { engine, toUiError, type UiError } from '../engine/client'
import { cleanLine, cleanMultiline, LIMITS } from '../lib/input'
import { CharCount, CopyButton, ErrorBox, Spinner } from './common'

const TOOLS = ['ChatGPT', 'Gemini', 'Claude', '뤼튼'] as const
const SCOPES = ['자료 수집', '개념 이해', '구성 점검', '문장 피드백', '기타'] as const

type Props = {
  researchId: string
  /** 사용 내역 전에 패키지가 있어야 엔진이 프롬프트 원문을 넣을 수 있다 */
  ensurePackage: () => Promise<unknown>
  onExpired: (e: UiError) => void
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function DisclosureTab({ researchId, ensurePackage, onExpired }: Props) {
  const [tools, setTools] = useState<string[]>([])
  const [otherOn, setOtherOn] = useState(false)
  const [otherTool, setOtherTool] = useState('')
  const [prompts, setPrompts] = useState<string[]>([])
  const [scope, setScope] = useState<string[]>(['자료 수집'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UiError | null>(null)
  const [result, setResult] = useState<BuildDisclosureOutput | null>(null)

  const other = cleanLine(otherTool)
  const allTools = [...tools, ...(otherOn && other ? [other] : [])]
  const cleanedPrompts = prompts.map(cleanMultiline)
  const promptTooLong = cleanedPrompts.some((p) => p.length > LIMITS.extraPrompt)
  const otherTooLong = other.length > LIMITS.keywordMaxLen

  const problems: string[] = []
  if (allTools.length === 0) problems.push('사용한 AI를 1개 이상 골라 주세요.')
  if (otherOn && !other) problems.push('기타 AI 이름을 적어 주세요.')
  if (scope.length === 0) problems.push('어디에 썼는지 1개 이상 골라 주세요.')
  const canSubmit = problems.length === 0 && !promptTooLong && !otherTooLong && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await ensurePackage()
      setResult(await engine.buildDisclosure({ researchId, tools: allTools, extraPrompts: cleanedPrompts.filter(Boolean), scope }))
    } catch (e) {
      const err = toUiError(e)
      if (err.code === 'EXPIRED') onExpired(err)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <h3 className="section-title">AI 쓴 거, 이렇게 밝히면 돼요</h3>
          <p className="hint">
            2026학년도부터 수행평가에서 AI를 쓰면 어떤 AI를, 어떤 프롬프트로, 어디에 썼는지 밝혀야 해요. 아래만 고르면 제출용 내역을 만들어 줘요.
          </p>
        </div>

        <fieldset className="field">
          <legend>어떤 AI를 썼어요?</legend>
          <div className="chips">
            {TOOLS.map((t) => (
              <label key={t} className={`chip ${tools.includes(t) ? 'on' : ''}`}>
                <input type="checkbox" checked={tools.includes(t)} onChange={() => setTools(toggle(tools, t))} />
                {t}
              </label>
            ))}
            <label className={`chip ${otherOn ? 'on' : ''}`}>
              <input type="checkbox" checked={otherOn} onChange={() => setOtherOn(!otherOn)} />
              기타
            </label>
          </div>
          {otherOn && (
            <>
              <input className="input" aria-label="기타 AI 이름" value={otherTool} onChange={(e) => setOtherTool(e.target.value)} placeholder="AI 이름" />
              {otherTooLong && <p className="field-error">{LIMITS.keywordMaxLen}자까지 쓸 수 있어요.</p>}
            </>
          )}
        </fieldset>

        <fieldset className="field">
          <legend>어디에 썼어요?</legend>
          <div className="chips">
            {SCOPES.map((s) => (
              <label key={s} className={`chip ${scope.includes(s) ? 'on' : ''}`}>
                <input type="checkbox" checked={scope.includes(s)} onChange={() => setScope(toggle(scope, s))} />
                {s}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>직접 더 물어본 게 있어요? (선택)</legend>
          <p className="hint">복사한 프롬프트는 자동으로 들어가요. 그 외에 AI에 직접 입력한 질문만 넣어 주세요. 이 기기 밖으로 나가지 않아요.</p>
          {prompts.map((p, i) => {
            const n = cleanedPrompts[i]?.length ?? 0
            return (
              <div key={i} className="prompt-row">
                <div className="field-label">
                  <label htmlFor={`extra-${i}`}>추가 질문 {i + 1}</label>
                  <CharCount value={n} max={LIMITS.extraPrompt} />
                </div>
                <textarea id={`extra-${i}`} rows={3} value={p} onChange={(e) => setPrompts(prompts.map((x, j) => (j === i ? e.target.value : x)))} />
                {n > LIMITS.extraPrompt && <p className="field-error">{LIMITS.extraPrompt.toLocaleString()}자까지 넣을 수 있어요.</p>}
                <button type="button" className="btn sm ghost" onClick={() => setPrompts(prompts.filter((_, j) => j !== i))}>
                  빼기
                </button>
              </div>
            )
          })}
          <div>
            <button type="button" className="btn sm" onClick={() => setPrompts([...prompts, ''])}>
              + 질문 추가
            </button>
          </div>
        </fieldset>

        {problems.length > 0 && (
          <ul className="problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <button type="button" className="btn primary wide" onClick={submit} disabled={!canSubmit}>
          사용 내역 만들기
        </button>
      </section>

      {busy && <Spinner label="사용 내역을 만들고 있어요" />}
      {error && <ErrorBox error={error} onRetry={submit} />}
      {result && !busy && (
        <section className="stack">
          <CopyButton text={result.text} label="제출용 내역 복사하기" block />
          <pre className="preview" tabIndex={0} aria-label="AI 사용 내역 미리보기">
            {result.text}
          </pre>
          <p className="hint">학교마다 양식이 다를 수 있어요. 선생님이 정한 양식이 있으면 거기에 옮겨 적어 주세요.</p>
        </section>
      )}
    </div>
  )
}
