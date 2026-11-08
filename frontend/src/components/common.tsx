import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { UiError } from '../engine/client'

export function ErrorBox({ error, onRetry, retryLabel = '다시 해보기' }: { error: UiError; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="notice error" role="alert">
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" className="btn sm" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={`notice ${tone}`}>{children}</div>
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner-row" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 일부 태블릿 브라우저·http 출처에서 clipboard API가 막힘
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function CopyButton({ text, label = '복사하기', block }: { text: string; label?: string; block?: boolean }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle')
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function onClick() {
    const ok = await copyText(text)
    setState(ok ? 'done' : 'fail')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button type="button" className={`btn primary ${block ? 'wide' : ''}`} onClick={onClick} disabled={!text}>
      {state === 'done' ? '복사했어요' : state === 'fail' ? '복사가 안 돼요. 길게 눌러 직접 복사해 주세요' : label}
    </button>
  )
}

export function CharCount({ value, max }: { value: number; max: number }) {
  return (
    <span className={`count ${value > max ? 'over' : ''}`}>
      {value.toLocaleString()} / {max.toLocaleString()}
    </span>
  )
}

/** 문장 ID → 원문 문장과 출처 이름 */
export type SentenceLookup = Map<string, { text: string; from: string; lang: 'ko' | 'en' | 'other' }>

/** 근거 문장 목록. 화면은 문장을 만들지 않고, 받은 ID의 원문만 찾아 보여준다. */
export function EvidenceQuotes({ ids, lookup, empty = '근거 없음' }: { ids: string[]; lookup: SentenceLookup; empty?: string }) {
  const quotes = ids.map((id) => ({ id, s: lookup.get(id) })).filter((x) => x.s)
  if (quotes.length === 0) return <p className="no-evidence">{empty}</p>
  return (
    <ul className="quotes">
      {quotes.map(({ id, s }) => (
        <li key={id}>
          <blockquote lang={s!.lang === 'other' ? undefined : s!.lang}>{s!.text}</blockquote>
          <cite>{s!.from}</cite>
        </li>
      ))}
    </ul>
  )
}

export function BusyOverlay({ message }: { message: string }) {
  return (
    <div className="overlay" role="status" aria-live="polite">
      <div className="overlay-card">
        <span className="marker-load" aria-hidden />
        <p>{message}</p>
      </div>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
    </div>
  )
}
