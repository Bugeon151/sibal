import { useState } from 'react'
import type { Comparison, Direction, Paper } from '@suhaengcut/engine'
import { EmptyState, EvidenceQuotes, type SentenceLookup } from './common'

export const DIRECTION_LABEL: Record<Direction, string> = {
  increase: '↑ 증가',
  decrease: '↓ 감소',
  no_effect: '효과 없음',
  conditional: '조건부',
  none: '언급 없음',
}

const AGREEMENT_LABEL: Record<Comparison['concepts'][number]['agreement'], string> = {
  agree: '같은 방향',
  conflict: '서로 엇갈려요',
  mixed: '제각각',
  single: '1편만 언급',
}

type Props = { papers: Paper[]; comparison: Comparison; lookup: SentenceLookup }

export function ComparisonTab({ papers, comparison, lookup }: Props) {
  const [sel, setSel] = useState<{ row: number; paperId: string } | null>(null)

  if (papers.length < 2) return <EmptyState title="비교하려면 논문이 2편 이상 필요해요">검색 범위를 넓히거나 키워드를 바꿔 보세요.</EmptyState>
  if (comparison.concepts.length === 0) return <EmptyState title="여러 논문에 공통으로 나온 개념이 없어요">논문마다 다루는 내용이 달라서 비교표를 만들지 않았어요.</EmptyState>

  const cellOf = (row: number, paperId: string) => comparison.concepts[row]?.cells.find((c) => c.paperId === paperId)
  const selected = sel ? cellOf(sel.row, sel.paperId) : undefined

  return (
    <div className="stack">
      <p className="lead">개념마다 논문이 어느 쪽 결과를 말하는지 정리했어요. 결론이 아니라 “어떤 문장끼리 비교해 보면 되는지” 알려주는 표예요. 칸을 누르면 근거 문장이 나와요.</p>
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">개념</th>
              {papers.map((p) => (
                <th scope="col" key={p.id} title={p.title}>
                  {p.id}
                  <span className="th-sub">
                    {p.source === 'kci' ? '국내' : '해외'} · {p.year}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.concepts.map((c, row) => (
              <tr key={c.concept}>
                <th scope="row">
                  {c.concept}
                  <span className={`agree ${c.agreement}`}>{AGREEMENT_LABEL[c.agreement]}</span>
                </th>
                {papers.map((p) => {
                  const cell = cellOf(row, p.id)
                  const dir: Direction = cell && cell.evidence.length > 0 ? cell.direction : 'none'
                  const on = sel?.row === row && sel.paperId === p.id
                  return (
                    <td key={p.id}>
                      <button
                        type="button"
                        className={`dir ${dir} ${on ? 'on' : ''}`}
                        disabled={dir === 'none'}
                        aria-pressed={on}
                        onClick={() => setSel(on ? null : { row, paperId: p.id })}
                      >
                        {DIRECTION_LABEL[dir]}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && selected && (
        <section className="card">
          <p className="card-kicker">
            {comparison.concepts[sel.row]?.concept} · {sel.paperId}
          </p>
          <h4 className="dir-title">{DIRECTION_LABEL[selected.direction]}</h4>
          <EvidenceQuotes ids={selected.evidence} lookup={lookup} />
        </section>
      )}
    </div>
  )
}
