import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BuildPackageOutput, Mode, RunResearchOutput, SourceKey } from '@suhaengcut/engine'
import { CheckTab } from '../components/CheckTab'
import { ComparisonTab } from '../components/ComparisonTab'
import { DisclosureTab } from '../components/DisclosureTab'
import { KeySentencesTab } from '../components/KeySentencesTab'
import { PackageTab } from '../components/PackageTab'
import { ReferencesTab } from '../components/ReferencesTab'
import { NewsCard, PaperCard } from '../components/SourceCards'
import { EmptyState, ErrorBox, Notice, type SentenceLookup } from '../components/common'
import { engine, toUiError, type UiError } from '../engine/client'
import { MODE_LABEL, SOURCE_LABEL, type Draft, type Query } from '../state'

type TabKey = 'sources' | 'key' | 'compare' | 'check' | 'package' | 'disclosure' | 'refs'

const TABS: { key: TabKey; label: string; aiOnly: boolean }[] = [
  { key: 'sources', label: '자료', aiOnly: false },
  { key: 'key', label: '핵심 문장', aiOnly: false },
  { key: 'compare', label: '비교표', aiOnly: false },
  { key: 'check', label: '내 문장 검사', aiOnly: false },
  { key: 'package', label: 'AI 프롬프트', aiOnly: true },
  { key: 'disclosure', label: 'AI 사용 내역', aiOnly: true },
  { key: 'refs', label: '참고문헌', aiOnly: false },
]

type Props = {
  draft: Draft
  query: Query
  research: RunResearchOutput
  error: UiError | null
  onSwitchMode: (m: Mode) => void
  onRerun: () => void
  onEditQuestion: () => void
  onNewTopic: () => void
}

type Loadable<T> = { data: T | null; loading: boolean; error: UiError | null }
const idle = <T,>(): Loadable<T> => ({ data: null, loading: false, error: null })

export function ResultScreen({ draft, query, research, error, onSwitchMode, onRerun, onEditQuestion, onNewTopic }: Props) {
  const isAi = research.mode === 'ai'
  const tabs = TABS.filter((t) => isAi || !t.aiOnly)
  const [tab, setTab] = useState<TabKey>('sources')
  const [expired, setExpired] = useState<UiError | null>(null)
  const id = research.researchId
  const { papers, news } = research

  const lookup: SentenceLookup = useMemo(() => {
    const m: SentenceLookup = new Map()
    for (const p of papers) for (const s of p.sentences) m.set(s.id, { text: s.text, from: `${p.id} · ${p.title}`, lang: p.language })
    for (const n of news) for (const s of n.sentences) m.set(s.id, { text: s.text, from: `${n.id} · ${n.press ?? '뉴스'} · ${n.title}`, lang: 'ko' })
    return m
  }, [papers, news])

  // 프롬프트 패키지: 탭을 처음 열 때, 또는 사용 내역을 만들기 직전에 한 번만
  const [pkg, setPkg] = useState<Loadable<BuildPackageOutput>>(idle)
  const pkgPromise = useRef<Promise<BuildPackageOutput> | null>(null)
  const ensurePackage = useCallback(() => {
    if (!pkgPromise.current) {
      setPkg({ data: null, loading: true, error: null })
      pkgPromise.current = engine.buildPackage({ researchId: id }).then(
        (data) => {
          setPkg({ data, loading: false, error: null })
          return data
        },
        (e) => {
          const err = toUiError(e)
          pkgPromise.current = null
          if (err.code === 'EXPIRED') setExpired(err)
          setPkg({ data: null, loading: false, error: err })
          throw err
        },
      )
    }
    return pkgPromise.current
  }, [id])

  const [refs, setRefs] = useState<Loadable<string[]>>(idle)
  const loadRefs = useCallback(() => {
    setRefs({ data: null, loading: true, error: null })
    engine.buildReferences({ researchId: id, style: 'apa' }).then(
      (r) => setRefs({ data: r.items, loading: false, error: null }),
      (e) => {
        const err = toUiError(e)
        if (err.code === 'EXPIRED') setExpired(err)
        setRefs({ data: null, loading: false, error: err })
      },
    )
  }, [id])

  useEffect(() => {
    if (tab === 'package' && !pkg.data && !pkg.loading && !pkg.error) ensurePackage().catch(() => {})
    if (tab === 'refs' && !refs.data && !refs.loading && !refs.error) loadRefs()
  }, [tab, pkg, refs, ensurePackage, loadRefs])

  // 소스 상태 안내
  const notices: string[] = []
  for (const k of ['kci', 'openalex', 'news'] as SourceKey[]) {
    if (research.sourceStatus[k] === 'failed') notices.push(`${SOURCE_LABEL[k]} 검색이 잠시 안 돼요. 나머지 자료로 보여 드려요.`)
  }
  if (draft.sources.openalex && research.sourceStatus.openalex === 'skipped') {
    notices.push('영어 키워드를 못 찾아서 해외 논문은 건너뛰었어요. 질문 고치기에서 영어 키워드를 넣어 보세요.')
  }

  return (
    <div className="screen">
      <div className="screen-top">
        <button type="button" className="back" onClick={onNewTopic} aria-label="처음으로">
          ‹
        </button>
        <div className="seg" role="group" aria-label="모드 바꾸기">
          {(['ai', 'search_only'] as Mode[]).map((m) => (
            <button key={m} type="button" className={research.mode === m ? 'on' : ''} aria-pressed={research.mode === m} onClick={() => research.mode !== m && onSwitchMode(m)}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <header className="result-head">
        <p className="kicker">{draft.topic}</p>
        <h1 className="display sm">{query.question}</h1>
        <div className="stats">
          <span>
            논문 <strong>{papers.length}</strong>편
          </span>
          <span>
            뉴스 <strong>{news.length}</strong>건
          </span>
          {research.keywordsEn.length > 0 && <span className="stats-en">{research.keywordsEn.join(', ')}</span>}
          <button type="button" className="link" onClick={onEditQuestion}>
            질문·키워드 고치기
          </button>
        </div>
      </header>

      {expired && <ErrorBox error={expired} onRetry={onRerun} retryLabel="같은 조건으로 다시 찾기" />}
      {error && <ErrorBox error={error} />}
      {notices.map((n) => (
        <Notice key={n} tone="warn">
          {n}
        </Notice>
      ))}
      {!isAi && <Notice>검색만 모드예요. AI 프롬프트와 사용 내역 탭은 숨겼어요.</Notice>}

      <nav className="tabs" role="tablist" aria-label="결과">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* 탭을 오가도 입력과 결과가 남도록 모두 마운트해 두고 숨긴다 */}
      <div role="tabpanel" hidden={tab !== 'sources'} className="stack">
        {papers.length > 0 && (
          <>
            <h2 className="list-title">논문</h2>
            {papers.map((p) => (
              <PaperCard key={p.id} paper={p} />
            ))}
          </>
        )}
        {news.length > 0 && (
          <>
            <h2 className="list-title">뉴스</h2>
            {news.map((n) => (
              <NewsCard key={n.id} news={n} />
            ))}
          </>
        )}
        {papers.length + news.length === 0 && <EmptyState title="자료가 없어요" />}
      </div>
      <div role="tabpanel" hidden={tab !== 'key'}>
        <KeySentencesTab papers={papers} />
      </div>
      <div role="tabpanel" hidden={tab !== 'compare'}>
        <ComparisonTab papers={papers} comparison={research.comparison} lookup={lookup} />
      </div>
      <div role="tabpanel" hidden={tab !== 'check'}>
        <CheckTab researchId={id} papers={papers} lookup={lookup} onExpired={setExpired} />
      </div>
      {isAi && (
        <>
          <div role="tabpanel" hidden={tab !== 'package'}>
            <PackageTab pkg={pkg.data} loading={pkg.loading} error={pkg.error} onRetry={() => ensurePackage().catch(() => {})} />
          </div>
          <div role="tabpanel" hidden={tab !== 'disclosure'}>
            <DisclosureTab researchId={id} ensurePackage={ensurePackage} onExpired={setExpired} />
          </div>
        </>
      )}
      <div role="tabpanel" hidden={tab !== 'refs'}>
        <ReferencesTab items={refs.data} loading={refs.loading} error={refs.error} onRetry={loadRefs} />
      </div>
    </div>
  )
}
