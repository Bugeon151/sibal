// 문장 분리. 한국어는 종결어미+마침표, 영어는 마침표·물음표 기준.
// et al., e.g., i.e., 소수점, 흔한 약어는 분리하지 않는다. 10자 미만 조각은 앞 문장에 붙인다.

const PLACEHOLDER = '\u0000'

const ABBREVIATIONS = [
  'et al.',
  'e.g.',
  'i.e.',
  'vs.',
  'etc.',
  'Fig.',
  'fig.',
  'No.',
  'no.',
  'Dr.',
  'Mr.',
  'Ms.',
  'cf.',
  'approx.',
  'p.',
  'pp.',
  'Vol.',
  'U.S.',
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// 약어는 단어 시작에서만 (sleep. 의 "p." 같은 오인 방지)
const ABBREVIATION_RES = ABBREVIATIONS.map((ab) => ({
  re: new RegExp(`(?<![\\p{L}])${escapeRe(ab)}`, 'gu'),
  to: ab.replace(/\./g, PLACEHOLDER),
}))

function protect(text: string): string {
  let t = text
  for (const { re, to } of ABBREVIATION_RES) t = t.replace(re, to)
  // 소수점, 버전 번호 (3.5, p.05)
  t = t.replace(/(\d)\.(\d)/g, `$1${PLACEHOLDER}$2`)
  // 이니셜 (J. Smith)
  t = t.replace(/\b([A-Z])\.(?=\s?[A-Z])/g, `$1${PLACEHOLDER}`)
  return t
}

function restore(text: string): string {
  return text.split(PLACEHOLDER).join('.')
}

export function splitSentences(text: string, minLength = 10): string[] {
  if (!text) return []
  const t = protect(text.replace(/\s+/g, ' ').trim())
  // 1) 문장부호 뒤 공백  2) 한국어 종결 '다.' 뒤에 공백 없이 이어지는 경우
  const parts = t
    // 문장부호 뒤 공백 + 문장 시작으로 볼 수 있는 글자(대문자·한글·숫자·따옴표·괄호)일 때만 나눈다.
    // ("Spearman's ? = -0.337"처럼 깨진 기호 뒤에서 나뉘지 않게)
    .split(/(?<=[.?!。])\s+(?=[A-Z가-힣0-9"'“‘(\[])|(?<=[다요음임함됨]\.)(?=[가-힣A-Za-z])/)
    .map((s) => restore(s).trim())
    .filter((s) => s.length > 0)

  const merged: string[] = []
  for (const p of parts) {
    if (p.length < minLength && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${p}`
    } else {
      merged.push(p)
    }
  }
  // 첫 조각이 짧아서 앞에 붙일 곳이 없었다면 다음 문장과 합친다
  if (merged.length > 1 && merged[0]!.length < minLength) {
    merged[1] = `${merged[0]} ${merged[1]}`
    merged.shift()
  }
  return merged
}
