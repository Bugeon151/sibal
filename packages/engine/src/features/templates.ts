// F7 프롬프트 패키지, F8 AI 사용 내역, F10 참고문헌 (고정 템플릿)

import type { Disclosure, News, Paper } from '../types'

/** 패키지 지시문에 들어가면 안 되는 표현 (본문 대필 요청). 템플릿 단위 테스트로 검사한다. */
export const FORBIDDEN_REQUESTS = [/써\s*줘/, /작성해\s*줘/, /완성해\s*줘/, /대신\s*써/, /write\s+(it|the|my)\b/i]

export function apaReference(p: Paper): string {
  const authors = p.authors.length === 0 ? '' : p.etAl ? `${p.authors[0]} 외` : p.authors.join(', ')
  const parts = [
    authors ? `${authors} (${p.year}).` : `(${p.year}).`,
    `${p.title}.`,
    p.journal ? `${p.journal}.` : '',
    p.doi ? `https://doi.org/${p.doi}` : p.url,
  ]
  return parts.filter(Boolean).join(' ')
}

/** ISO 일시 → 한국 날짜 (YYYY-MM-DD). UTC로 자르면 00~09시 기사가 전날로 나온다 */
export function kstDate(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso.slice(0, 10)
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10)
}

export function newsReference(n: News): string {
  const date = kstDate(n.publishedAt)
  return `${n.press ?? '언론사 미상'} (${date}). ${n.title}. ${n.url}`
}

export function buildPackageText(input: {
  question: string
  papers: Paper[]
  news: News[]
  sentenceText: (id: string) => string | undefined
}): string {
  const lines: string[] = []
  lines.push('너는 고등학생의 탐구 보고서 작성을 돕는 코치야.')
  lines.push('아래 규칙을 꼭 지켜 줘.')
  lines.push('1. 보고서 문장이나 문단을 대신 만들어 주지 마. 내가 쓴 글에 대한 피드백과 질문만 해 줘.')
  lines.push('2. 아래 [자료]에 있는 내용만 근거로 써. 자료에 없는 논문이나 통계를 새로 꺼내지 마.')
  lines.push('3. 어려운 개념은 고등학생이 이해할 수 있게 설명해 줘.')
  lines.push('4. 내가 근거와 맞지 않게 쓴 부분이 있으면 어떤 자료의 어느 문장과 다른지 알려 줘.')
  lines.push('')
  lines.push(`[탐구 질문] ${input.question}`)
  lines.push('')
  lines.push('[자료]')
  input.papers.forEach((p, i) => {
    lines.push(`(${i + 1}) ${apaReference(p)}`)
    for (const k of p.keySentences) {
      const t = input.sentenceText(k.sentenceId)
      if (t) lines.push(`  - ${t}`)
    }
  })
  if (input.news.length > 0) {
    lines.push('')
    lines.push('[참고 뉴스]')
    input.news.forEach((n, i) => lines.push(`(뉴스 ${i + 1}) ${newsReference(n)}`))
  }
  lines.push('')
  lines.push('먼저 이 자료로 탐구 질문에 답하려면 어떤 순서로 생각하면 좋을지 질문으로 안내해 줘.')
  return lines.join('\n')
}

export function buildDisclosureText(d: Disclosure): string {
  const lines: string[] = []
  lines.push('[AI 사용 내역]')
  lines.push(`- 사용 일시: ${formatKst(d.usedAt)}`)
  lines.push(`- 사용한 AI: ${d.tools.join(', ')}`)
  lines.push(`- 활용 범위: ${d.scope.join(', ')}`)
  lines.push('- 자료 검색 도구: 본 서비스(논문·뉴스 검색). 이 도구는 AI를 사용하지 않음')
  lines.push('')
  lines.push('[입력한 프롬프트 원문]')
  d.prompts.forEach((p, i) => {
    lines.push(`(${i + 1}) ${p.label}`)
    lines.push(p.text)
    lines.push('')
  })
  if (d.papers.length > 0) {
    lines.push('[참고 자료]')
    for (const r of d.papers) lines.push(`- ${r}`)
  }
  return lines.join('\n').trimEnd()
}

function formatKst(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return iso
  const kst = new Date(t.getTime() + 9 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())} (KST)`
}
