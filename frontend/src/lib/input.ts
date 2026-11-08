// 엔진 전체(XML 파서 등)가 화면 번들에 딸려오지 않도록 설정 파일만 가져온다
import { config } from '@suhaengcut/engine-config'

// 제한값은 엔진 설정을 그대로 쓴다 (엔진도 같은 값으로 INVALID_INPUT을 던진다).
const L = config.limits
export const LIMITS = {
  topic: { min: L.topicMin, max: L.topicMax },
  question: { min: L.questionMin, max: L.questionMax },
  keywordMaxLen: L.keywordMaxLen,
  keywordsMax: L.keywordsMax,
  checkText: config.check.maxChars,
  checkSentences: config.check.maxSentences,
  extraPrompt: L.extraPromptMax,
} as const

/** 한 줄 입력: 제어 문자 제거, 연속 공백 1개로, 앞뒤 공백 제거. */
export function cleanLine(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** 여러 줄 입력: 줄바꿈은 살리고 나머지는 한 줄 규칙과 같다. */
export function cleanMultiline(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 길이 초과는 잘라내지 않고 입력 칸에서 막는다. 문제가 없으면 null. (엔진과 같은 기준: string.length) */
export function lengthError(cleaned: string, min: number, max: number): string | null {
  const n = cleaned.length
  if (n === 0) return '내용을 입력해 주세요.'
  if (n < min) return `${min}자 이상 써 주세요.`
  if (n > max) return `${max}자까지 쓸 수 있어요. 지금 ${n}자예요.`
  return null
}
