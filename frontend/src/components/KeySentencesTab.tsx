import { useState } from 'react'
import type { Paper, SentenceRole } from '@suhaengcut/engine'
import { Abstract } from './SourceCards'
import { EmptyState } from './common'

export const ROLE_LABEL: Record<SentenceRole, string> = {
  purpose: '목적',
  method: '방법',
  result: '결과',
  conclusion: '결론',
}

export function KeySentencesTab({ papers }: { papers: Paper[] }) {
  if (papers.length === 0) return <EmptyState title="고른 논문이 없어요">뉴스만 찾았어요. 키워드를 바꾸면 논문이 나올 수도 있어요.</EmptyState>
  return (
    <div className="stack">
      <p className="lead">초록에서 중요한 문장만 골랐어요. 고쳐 쓰지 않은 원문 그대로예요. 문장을 누르면 초록 어디에 있는지 보여줘요.</p>
      {papers.map((p) => (
        <PaperKeySentences key={p.id} paper={p} />
      ))}
    </div>
  )
}

function PaperKeySentences({ paper }: { paper: Paper }) {
  const [active, setActive] = useState<string | null>(null)
  const text = new Map(paper.sentences.map((s) => [s.id, s.text]))
  const toggle = (id: string) => setActive((cur) => (cur === id ? null : id))
  const keys = paper.keySentences.filter((k) => text.has(k.sentenceId))
  const defs = paper.definitions.filter((d) => text.has(d.sentenceId))

  return (
    <section className="card">
      <p className="card-kicker">
        <span className="pid">{paper.id}</span> {paper.source === 'kci' ? '국내' : '해외'} · {paper.year}
      </p>
      <h3 className="card-title">{paper.title}</h3>

      {keys.length === 0 ? (
        <p className="no-evidence">핵심 문장을 고르지 못했어요. 초록이 너무 짧을 수 있어요.</p>
      ) : (
        <ol className="key-list">
          {keys.map((k) => (
            <li key={k.sentenceId}>
              <button
                type="button"
                className={`key-btn ${active === k.sentenceId ? 'on' : ''}`}
                aria-pressed={active === k.sentenceId}
                onClick={() => toggle(k.sentenceId)}
                lang={paper.language === 'other' ? undefined : paper.language}
              >
                {k.role && <span className={`role ${k.role}`}>{ROLE_LABEL[k.role]}</span>}
                <span>{text.get(k.sentenceId)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {defs.length > 0 && (
        <div className="defs">
          <h4>용어 뜻</h4>
          <ul>
            {defs.map((d) => (
              <li key={d.term + d.sentenceId}>
                <button
                  type="button"
                  className={`key-btn ${active === d.sentenceId ? 'on' : ''}`}
                  aria-pressed={active === d.sentenceId}
                  onClick={() => toggle(d.sentenceId)}
                >
                  <strong className="term">{d.term}</strong>
                  <span>{text.get(d.sentenceId)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {active && (
        <div className="abstract-box">
          <h4>초록 전체</h4>
          <Abstract paper={paper} highlight={new Set([active])} />
        </div>
      )}
    </section>
  )
}
