// F1 키워드 추출과 탐구 질문 후보 (질문 틀 + 받침 계산)

import { config } from '../config'
import { attach } from '../text/josa'
import { cleanInput } from '../text/normalize'
import { TOPIC_STOP } from '../text/stopwords'
import type { Tokenizer } from '../text/tokenizer'
import { uniqueTokens } from '../text/tokenizer'

export type TopicShape =
  | { kind: 'effect'; cause: string; target: string }
  | { kind: 'relation'; a: string; b: string }
  | { kind: 'single'; subject: string }

const SUBJECT_MARK = /^(.+?)(이|가|은|는)$/
const TRAILING = /\s*(에\s*(대한|관한)\s*(연구|탐구|분석|조사)?|의\s*(관계|비교|차이|영향|효과)|관계|비교|차이|연구|탐구|분석|조사)\s*$/

function stripJosa(phrase: string): string {
  return phrase.replace(/(이|가|은|는|을|를|의|과|와|및)$/, '').trim()
}

export function parseTopic(rawTopic: string): TopicShape {
  const topic = cleanInput(rawTopic).replace(/[?.!]+$/, '')

  // 영향형: "A이/가 B에 미치는(끼치는/주는) 영향"
  const effect = /^(.+?)\s*에\s*(미치는|끼치는|주는)\s*(영향|효과)/.exec(topic)
  if (effect) {
    const left = effect[1]!.trim().split(/\s+/)
    // 주격 조사(이/가/은/는)로 끝나는 어절에서 원인과 대상을 나눈다
    let cut = left.findIndex((w) => SUBJECT_MARK.test(w) && w.length > 1)
    if (cut === -1) cut = 0
    const cause = stripJosa(left.slice(0, cut + 1).join(' '))
    const target = left.slice(cut + 1).join(' ').trim()
    if (cause && target) return { kind: 'effect', cause, target }
  }

  // 관계형: "A와/과 B (의 관계)"
  const words = topic.split(/\s+/)
  const join = words.findIndex((w, i) => i < words.length - 1 && /^(.+)(와|과|및)$/.test(w) && w.length > 1)
  if (join !== -1) {
    const a = stripJosa(words.slice(0, join + 1).join(' ').replace(/(와|과|및)$/, ''))
    const b = words.slice(join + 1).join(' ').replace(TRAILING, '').trim()
    if (a && b) return { kind: 'relation', a, b: stripJosa(b) }
  }

  return { kind: 'single', subject: topic.replace(TRAILING, '').trim() || topic }
}

export function questionsFor(shape: TopicShape): string[] {
  switch (shape.kind) {
    case 'effect': {
      const { cause: A, target: B } = shape
      return [
        `${attach(A, '은/는')} ${B}에 어떤 영향을 미치는가?`,
        `${attach(A, '과/와')} ${B}의 관계는 어떠한가?`,
        `${B}에 영향을 주는 ${A} 외의 요인은 무엇인가?`,
      ]
    }
    case 'relation': {
      const { a: A, b: B } = shape
      return [
        `${attach(A, '과/와')} ${attach(B, '은/는')} 어떤 관계가 있는가?`,
        `${attach(A, '이/가')} 높을수록 ${attach(B, '은/는')} 어떻게 달라지는가?`,
        `${attach(A, '과/와')} ${B}의 관계를 설명하는 요인은 무엇인가?`,
      ]
    }
    case 'single': {
      const A = shape.subject
      return [`${A}의 현황은 어떠한가?`, `${A}의 원인은 무엇인가?`, `${A} 문제를 줄이는 방안은 무엇인가?`]
    }
  }
}

export function extractKeywords(text: string, tokenizer: Tokenizer): string[] {
  return uniqueTokens(tokenizer.tokens(text))
    .filter((t) => !TOPIC_STOP.has(t))
    .filter((t) => !/^\d/.test(t))
    .slice(0, config.limits.keywordsMax)
}
