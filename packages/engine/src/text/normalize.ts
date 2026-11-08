/** 입력 정리: 앞뒤 공백 제거, 연속 공백 1개, 제어 문자 제거 */
export function cleanInput(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  hellip: '…',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[body.toLowerCase()] ?? m
  })
}

/** HTML 태그 제거 + 엔티티 복원 (네이버 뉴스 <b> 강조 등) */
export function stripHtml(s: string): string {
  return cleanInput(decodeEntities(s.replace(/<[^>]*>/g, '')))
}

/** 제목 비교용 키: 소문자, 문자·숫자만 */
export function titleKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null
  const d = doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '')
  // DOI 형식: 10.<등록기관 번호 4~9자리>/<접미사>
  return /^10\.\d{4,9}\/\S+$/.test(d) ? d : null
}

export function hangulRatio(s: string): number {
  const letters = s.match(/[\p{L}]/gu)
  if (!letters || letters.length === 0) return 0
  const hangul = s.match(/[가-힣]/g)
  return (hangul?.length ?? 0) / letters.length
}

export function detectLang(s: string): 'ko' | 'en' | 'other' {
  if (!s) return 'other'
  const r = hangulRatio(s)
  if (r >= 0.3) return 'ko'
  if (/[a-z]/i.test(s)) return 'en'
  return 'other'
}
