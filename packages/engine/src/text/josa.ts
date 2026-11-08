// 받침 계산으로 조사 고르기. 가(0xAC00)부터 28개 종성 주기.

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3

// 영문 대문자 약어를 읽을 때의 받침 (L, M, N, R은 받침 있음)
const LATIN_BATCHIM = new Set(['L', 'M', 'N', 'R'])
// 숫자를 읽을 때의 받침: 0영 1일 3삼 6육 7칠 8팔 → 받침 있음
const DIGIT_BATCHIM = new Set(['0', '1', '3', '6', '7', '8'])

function lastSyllableInfo(word: string): { batchim: boolean; rieul: boolean } {
  const trimmed = word.replace(/[\s)\]}"'’”.,]+$/u, '')
  const ch = trimmed.at(-1)
  if (!ch) return { batchim: false, rieul: false }
  const code = ch.charCodeAt(0)
  if (code >= HANGUL_START && code <= HANGUL_END) {
    const jong = (code - HANGUL_START) % 28
    return { batchim: jong !== 0, rieul: jong === 8 }
  }
  if (/[A-Za-z]/.test(ch)) {
    const up = ch.toUpperCase()
    return { batchim: LATIN_BATCHIM.has(up), rieul: up === 'L' || up === 'R' }
  }
  if (/[0-9]/.test(ch)) {
    return { batchim: DIGIT_BATCHIM.has(ch), rieul: ch === '1' || ch === '7' || ch === '8' }
  }
  return { batchim: false, rieul: false }
}

export function hasBatchim(word: string): boolean {
  return lastSyllableInfo(word).batchim
}

export type JosaPair = '은/는' | '이/가' | '을/를' | '과/와' | '으로/로' | '이라/라'

/** word + 알맞은 조사 */
export function attach(word: string, pair: JosaPair): string {
  const { batchim, rieul } = lastSyllableInfo(word)
  const [withB, withoutB] = pair.split('/') as [string, string]
  if (pair === '으로/로') return word + (batchim && !rieul ? withB : withoutB)
  return word + (batchim ? withB : withoutB)
}
