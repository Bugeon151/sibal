import { useState } from 'react'
import type { News, Paper } from '@suhaengcut/engine'

export function Abstract({ paper, highlight }: { paper: Paper; highlight?: Set<string> }) {
  if (paper.sentences.length === 0) return <p className="muted">초록이 없어요.</p>
  return (
    <p className="abstract" lang={paper.language === 'other' ? undefined : paper.language}>
      {paper.sentences.map((s) => (
        <span key={s.id} className={highlight?.has(s.id) ? 'hl' : undefined}>
          {s.text}{' '}
        </span>
      ))}
    </p>
  )
}

export function PaperCard({ paper }: { paper: Paper }) {
  const [open, setOpen] = useState(false)
  const authors = paper.authors.join(', ') + (paper.etAl ? ' 외' : '')

  return (
    <article className="card paper">
      <div className="card-top">
        <span className="pid">{paper.id}</span>
        <span className={`pill ${paper.source}`}>{paper.source === 'kci' ? '국내' : '해외'}</span>
        {paper.isOa && <span className="pill oa">원문 무료</span>}
        <span className="score">{Math.round(paper.score)}점</span>
      </div>
      <h3 className="card-title">{paper.title}</h3>
      <p className="meta">
        {authors}
        {paper.journal && <> · {paper.journal}</>} · {paper.year}
        {paper.citedBy !== null && <> · 인용 {paper.citedBy.toLocaleString()}회</>}
      </p>
      {paper.selectReasons.length > 0 && (
        <ul className="reasons" aria-label="고른 이유">
          {paper.selectReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="card-actions">
        <button type="button" className="btn sm ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? '초록 접기' : '초록 보기'}
        </button>
        {paper.url && (
          <a className="btn sm ghost" href={paper.url} target="_blank" rel="noopener noreferrer">
            {paper.isOa ? '원문 보기' : '논문 페이지'} ↗
          </a>
        )}
      </div>
      {open && <Abstract paper={paper} />}
    </article>
  )
}

export function NewsCard({ news }: { news: News }) {
  const date = new Date(news.publishedAt)
  const dateText = isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  return (
    <article className="card news">
      <div className="card-top">
        <span className="pid">{news.id}</span>
        <span className="pill news">뉴스</span>
        <span className="meta">{[news.press, dateText].filter(Boolean).join(' · ')}</span>
      </div>
      <h3 className="card-title">{news.title}</h3>
      {news.sentences.length > 0 && <p className="news-desc">{news.sentences.map((s) => s.text).join(' ')}</p>}
      {news.url && (
        <div className="card-actions">
          <a className="btn sm ghost" href={news.url} target="_blank" rel="noopener noreferrer">
            기사 보기 ↗
          </a>
        </div>
      )}
    </article>
  )
}
