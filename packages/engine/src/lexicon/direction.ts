// 방향 단서어 사전과 판정 규칙 (F5 비교표, F6 방향 충돌).
// 순서: 효과 없음 → 증가·감소 집계(부정어 뒤집기) → 조건부 → 없음

import type { Direction } from '../types'

const NO_EFFECT: RegExp[] = [
  /유의(미)?하지\s*않/,
  /유의미한\s*(차이|관계|영향|효과)[가이]?\s*(없|나타나지\s*않)/,
  /(차이|관계|영향|효과|상관|변화)[가이는]?\s*(없|나타나지\s*않|발견되지\s*않)/,
  /변화[가는]?\s*유의하지\s*않/,
  /\bno\s+significant\b/i,
  /\bnot\s+significant(ly)?\b/i,
  /\bno\s+(difference|association|effect|relationship|correlation)\b/i,
  /\bnot\s+(associated|related|correlated)\b/i,
  /\bdid\s+not\s+(differ|affect|change)\b/i,
  /\bremain(s|ed)?\s+(the\s+same|unchanged|stable)\b/i,
  /\b(were|was)\s+not\s+affected\b/i,
  /\bunchanged\b/i,
]

const INCREASE_KO: RegExp[] = [
  /증가/, /향상/, /높아/, /높게/, /높았/, /높은\s*(것으로|수준)/, /늘어/, /늘었/, /늘리/, /상승/, /강화/,
  /긍정적/, /(?<!부)정적\s*(상관|관계|영향)/, /(?<!부)정적인/, /개선/, /촉진/, /커지/, /커졌/, /많아/,
  /높이(?!는\s*데)/, /높인/, /높였/, /높다/, /올라/, /올랐/, /오르/, /길어/, /길었/, /늘린/, /늘렸/, /늘다/, /많았/, /많다/,
]
const DECREASE_KO: RegExp[] = [
  /감소/, /저하/, /낮아/, /낮게/, /낮았/, /낮은\s*(것으로|수준)/, /줄어/, /줄었/, /줄이/, /하락/, /약화/,
  /부정적/, /부적\s*(상관|관계|영향)/, /부적인/, /악화/, /억제/, /작아/, /작아졌/, /적어/,
  /낮추/, /낮춘/, /낮췄/, /낮다/, /떨어/, /짧아/, /짧았/, /짧다/, /짧게/, /짧은\s*(것으로|수준)/, /줄인/, /줄였/, /줄다/, /적었/,
]
const INCREASE_EN: RegExp[] = [
  /\bincreas\w*/i, /\bimprov\w*/i, /\bhigher\b/i, /\benhanc\w*/i, /\bpositive(ly)?\b/i, /\braise[sd]?\b/i,
  /\bboost\w*/i, /\bgreater\b/i, /\bgrow(th|s|n)?\b/i, /\bpromot\w*/i,
]
const DECREASE_EN: RegExp[] = [
  /\bdecreas\w*/i, /\breduc\w*/i, /\blower\b/i, /\bdeclin\w*/i, /\bnegative(ly)?\b/i, /\bworsen\w*/i,
  /\bimpair\w*/i, /\bdiminish\w*/i, /\bsuppress\w*/i, /\bshorter\b/i,
]

const CONDITIONAL: RegExp[] = [
  /경우에(만|는)/, /때에만/, /집단에서(만|는)/, /에\s*따라\s*(다르|달라)/, /조건에서/, /한해서/, /만\s*유의/,
  /\bonly\s+(when|in|among|for)\b/i, /\bdepending\s+on\b/i, /\bmoderat\w*/i, /\bin\s+some\b/i,
]

// 효과·차이·관계가 "있다"는 주장 (방향은 없어도 '효과 없음'과는 충돌한다)
const EFFECT_PRESENT: RegExp[] = [
  /(효과|영향|차이|관계|상관)[가이]?\s*(있|나타났|확인되었|발견)/,
  /더\s*(효과적|높|크|많|좋|낫|우수)/,
  /보다\s*(더\s*)?(효과적|높|크|많|좋|낫|우수)/,
  /\b(significant(ly)?\s+(effect|association|difference|relationship)|more\s+effective)\b/i,
]

/** 효과·차이·관계가 있다는 주장인지 (증가·감소 포함) */
export function claimsEffect(text: string): boolean {
  const d = detectDirection(text)
  if (d === 'increase' || d === 'decrease') return true
  if (d === 'no_effect') return false
  return EFFECT_PRESENT.some((r) => r.test(outcomeClause(text)))
}

/** "A할수록 B" 문장은 결과 쪽(B)만 본다. 조건 쪽의 '길수록', '많을수록'이 방향으로 세지지 않게. */
export function outcomeClause(text: string): string {
  const i = text.lastIndexOf('수록')
  return i >= 0 ? text.slice(i + 2) : text
}

const KO_NEGATION_AFTER = /^[^\s,.;]*(\s+[^\s,.;]+){0,4}/ // 단서어 뒤 최대 5어절, 쉼표·마침표에서 끊음
const KO_NEG = /(않|못|없)/
const EN_NEG_BEFORE = /\b(not|no|never|without|n't|neither|nor)\b[^.]{0,25}$/i

function countDirection(text: string, cues: RegExp[], lang: 'ko' | 'en'): { plain: number; negated: number } {
  let plain = 0
  let negated = 0
  for (const cue of cues) {
    const re = new RegExp(cue.source, cue.flags.includes('g') ? cue.flags : `${cue.flags}g`)
    for (const m of text.matchAll(re)) {
      const idx = m.index ?? 0
      let neg = false
      if (lang === 'ko') {
        const after = text.slice(idx + m[0].length)
        const window = KO_NEGATION_AFTER.exec(after)?.[0] ?? ''
        neg = KO_NEG.test(window)
      } else {
        neg = EN_NEG_BEFORE.test(text.slice(Math.max(0, idx - 30), idx))
      }
      if (neg) negated++
      else plain++
    }
  }
  return { plain, negated }
}

export function detectDirection(fullText: string): Direction {
  if (NO_EFFECT.some((r) => r.test(fullText))) return 'no_effect'
  const text = outcomeClause(fullText)

  const isKo = /[가-힣]/.test(text)
  const lang = isKo ? 'ko' : 'en'
  const inc = countDirection(text, isKo ? INCREASE_KO : INCREASE_EN, lang)
  const dec = countDirection(text, isKo ? DECREASE_KO : DECREASE_EN, lang)
  // 부정된 증가 = 감소 쪽, 부정된 감소 = 증가 쪽
  const up = inc.plain + dec.negated
  const down = dec.plain + inc.negated

  const conditional = CONDITIONAL.some((r) => r.test(fullText))
  if (up === 0 && down === 0) return 'none'
  if (conditional) return 'conditional'
  if (up > down) return 'increase'
  if (down > up) return 'decrease'
  return 'conditional'
}

/** 대조 연결어로 절 나누기 ("수학은 하락하였으나 국어는 변화가 없었다") */
export function splitClauses(text: string): string[] {
  const parts = text
    .split(/(?:하였으나|했으나|으나|지만|반면에?|그러나|그런데|(?<=(?:었|았|였|없었|있었))고\s+|,?\s+but\s+|,?\s+whereas\s+|;\s*however,?\s*|,\s*while\s+|,\s*and\s+when\s+)/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 4)
  return parts.length > 0 ? parts : [text]
}

// 부정적 결과를 나타내는 말. "수면 장애가 증가" = 수면에는 나쁜 쪽이므로, 한쪽만 이런 말을 쓰면 방향을 뒤집어 비교한다
const NEGATIVE_OUTCOME = /(장애|문제|부족|결핍|질환|위험|disturbance|disorder|problem|deprivation|insufficien|risk|impairment)/i

export function hasNegativeOutcome(text: string): boolean {
  return NEGATIVE_OUTCOME.test(text)
}

/** 한쪽만 부정적 결과를 말하면 상대 방향을 뒤집는다 */
export function alignPolarity(evidenceDir: Direction, evidenceText: string, claimText: string): Direction {
  if (evidenceDir !== 'increase' && evidenceDir !== 'decrease') return evidenceDir
  if (hasNegativeOutcome(evidenceText) === hasNegativeOutcome(claimText)) return evidenceDir
  return evidenceDir === 'increase' ? 'decrease' : 'increase'
}

/** "여학생에게서 더 높게", "higher in girls compared to boys" → 더 높은(강한) 쪽 집단 */
export function favoredGroup(text: string): string | null {
  const words = GROUP_OPPOSITES.flat()
  const alt = words.join('|')
  const ko = new RegExp(`(${alt})(?:에게서|에서|이|가|의)?\\s*(?:더|가장)\\s*(?:높|크|강|많|낮|작|약|적)`).exec(text)
  if (ko) return ko[1]!
  const en = new RegExp(`(?:higher|greater|stronger|more|lower|weaker)\\s+(?:in|among|for)\\s+(${alt})\\b`, 'i').exec(text)
  if (en) return en[1]!.toLowerCase()
  return null
}

/** 서로 바꿔 쓰면 틀리는 집단 쌍 */
export const GROUP_OPPOSITES: [string, string][] = [
  ['남학생', '여학생'],
  ['남성', '여성'],
  ['남자', '여자'],
  ['boys', 'girls'],
  ['male', 'female'],
  ['men', 'women'],
]

/** 전칭 표현 (모든, 항상 …): 논문이 조건부일 때 범위 확대를 잡는다 */
const UNIVERSAL = /(모든|항상|반드시|누구나|언제나|모두|전부|\ball\b|\balways\b|\bevery(one)?\b)/i
export function isUniversal(text: string): boolean {
  return UNIVERSAL.test(text)
}

/** 두 방향이 서로 충돌하는지 (F6) */
export function directionsConflict(a: Direction, b: Direction): boolean {
  if (a === 'none' || b === 'none' || a === 'conditional' || b === 'conditional') return false
  if (a === b) return false
  return true // increase↔decrease, no_effect↔increase/decrease
}

/** 여러 문장의 방향을 다수결로 합친다. 동률이면 조건부. */
export function voteDirection(dirs: Direction[]): Direction {
  const counted = dirs.filter((d) => d !== 'none')
  if (counted.length === 0) return 'none'
  const tally = new Map<Direction, number>()
  for (const d of counted) tally.set(d, (tally.get(d) ?? 0) + 1)
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1])
  if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return 'conditional'
  return sorted[0]![0]
}
