import type { BuildPackageOutput } from '@suhaengcut/engine'
import type { UiError } from '../engine/client'
import { CopyButton, ErrorBox, Spinner } from './common'

type Props = {
  pkg: BuildPackageOutput | null
  loading: boolean
  error: UiError | null
  onRetry: () => void
}

export function PackageTab({ pkg, loading, error, onRetry }: Props) {
  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <h3 className="section-title">AI한테 이렇게 물어봐</h3>
          <p className="hint">
            찾은 자료와 질문 방법을 한 번에 묶었어요. ChatGPT, Gemini 등 쓰고 싶은 AI에 그대로 붙여 넣으면 돼요. 이 프롬프트는 AI가 글을 대신 써 주지 않고,
            내 글을 점검하고 개념을 설명하도록 시켜요.
          </p>
        </div>
        {loading && <Spinner label="프롬프트를 만들고 있어요" />}
        {error && <ErrorBox error={error} onRetry={onRetry} />}
        {pkg && <CopyButton text={pkg.text} label="프롬프트 복사하기" block />}
      </section>
      {pkg && (
        <>
          <pre className="preview" tabIndex={0} aria-label="프롬프트 미리보기">
            {pkg.text}
          </pre>
          <p className="hint">이 프롬프트 원문은 ‘AI 사용 내역’에 자동으로 들어가요.</p>
        </>
      )}
    </div>
  )
}
