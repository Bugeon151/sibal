import { useState, type KeyboardEvent } from 'react'
import { cleanLine } from '../lib/input'

type Props = {
  id: string
  label: string
  hint?: string
  tags: string[]
  onChange: (tags: string[]) => void
  max: number
  maxLen: number
  placeholder?: string
}

export function TagInput({ id, label, hint, tags, onChange, max, maxLen, placeholder }: Props) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const full = tags.length >= max

  function add() {
    const value = cleanLine(draft)
    if (!value) return
    if (full) return setError(`${max}개까지 넣을 수 있어요.`)
    if (value.length > maxLen) return setError(`하나에 ${maxLen}자까지예요.`)
    if (tags.includes(value)) return setError('이미 있는 키워드예요.')
    onChange([...tags, value])
    setDraft('')
    setError(null)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중 Enter는 무시해야 마지막 글자가 두 번 들어가지 않는다.
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && draft === '' && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        <span className="count">
          {tags.length}/{max}
        </span>
      </div>
      {hint && <p className="hint">{hint}</p>}
      <div className="tags">
        {tags.map((t) => (
          <span className="tag" key={t}>
            {t}
            <button type="button" aria-label={`${t} 빼기`} onClick={() => onChange(tags.filter((x) => x !== t))}>
              ×
            </button>
          </span>
        ))}
        {!full && (
          <input
            id={id}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            onKeyDown={onKeyDown}
            onBlur={add}
            placeholder={placeholder}
            enterKeyHint="done"
            autoComplete="off"
          />
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
