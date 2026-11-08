import type { UiError } from '../engine/client'
import { CopyButton, ErrorBox, Spinner } from './common'

type Props = {
  items: string[] | null
  loading: boolean
  error: UiError | null
  onRetry: () => void
}

export function ReferencesTab({ items, loading, error, onRetry }: Props) {
  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <h3 className="section-title">참고문헌</h3>
          <p className="hint">APA 형식이에요. 검색으로 받은 서지 정보만 썼어요.</p>
        </div>
        {loading && <Spinner label="참고문헌을 정리하고 있어요" />}
        {error && <ErrorBox error={error} onRetry={onRetry} />}
        {items && <CopyButton text={items.join('\n')} label="전체 복사하기" block />}
      </section>
      {items && (
        <ol className="refs">
          {items.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
