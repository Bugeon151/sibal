// 토크나이저. 규칙 기반(RuleTokenizer): 조사·어미 떼기 + 예외 사전.
// Kiwi 같은 형태소 분석기는 쓰지 않는다 (기본 모델이 신경망이고 약 110MB — docs 참고). 출력은 "내용어" 토큰 목록(중복 허용, 소문자).

import { EN_STOP, KO_STOP } from './stopwords'

export interface Tokenizer {
  /** 내용어 토큰. 한국어는 어간·명사형, 영어는 소문자 어간. 숫자는 단위 포함 그대로. */
  tokens(text: string): string[]
}

// ── 한국어 규칙 ──

// 서술어 어미 → 어간 (앞부분이 2글자 이상일 때만)
const KO_PREDICATE =
  /^(.{2,}?)(할수록|될수록|일수록|하자|되자|일\s?때는|일\s?때|하였으며|하였으나|하였다|하였고|했으며|했으나|했다|했고|한다|하는|하고|하여|해서|하며|하면|하기|하지|함|할|한|되었으며|되었다|되었고|됐다|된다|되는|되고|되며|되어|되지|됨|될|된|시켰다|시킨다|시키는|시키고|시켜)$/
const KO_ADJ_JEOK = /^(.{2,}적)(인|으로|이다|이며|이고|이었다)$/
const KO_COPULA = /^(.{2,}?)(이었다|였다|이다|이며|이고|이라는|이라고|이라|입니다|인)$/

// 조사 (긴 것부터)
const KO_JOSA = [
  '에서부터', '으로부터', '로부터', '에게서', '이라는', '이라고', '으로서', '으로써', '에서는', '에서도', '에서의',
  '에게는', '으로는', '으로의', '와의', '과의', '에는', '에도', '에의', '로서', '로써', '에서', '에게', '한테', '까지',
  '부터', '보다', '처럼', '만큼', '마다', '조차', '이나', '으로', '라는', '라고', '들의', '들이', '들은', '들을', '들',
  '은', '는', '을', '를', '의', '에', '와', '과', '로', '도', '만', '이', '가',
]

// 끝 글자가 조사처럼 보이지만 단어의 일부인 흔한 명사
const KO_KEEP = new Set([
  '전문가', '작가', '평론가', '예술가', '정치가', '증가', '평가', '참가', '추가', '부가', '물가', '대가',
  '차이', '나이', '놀이', '높이', '길이', '깊이', '넓이', '아이', '어린이', '사이', '거리', '도시', '교도',
  '시도', '정도', '제도', '속도', '태도', '온도', '빈도', '밀도', '강도', '지도', '용도', '각도', '의도',
  '만족도', '선호도', '이해도', '인식도', '참여도', '몰입도', '의존도', '노인', '원인', '요인', '개인', '확인',
  '인과', '효과', '결과', '성과', '교과', '과목', '분과', '외과', '학과', '사과', '의료', '의사', '의식',
  '의견', '의미', '의지', '의존', '의무', '회의', '정의', '주의', '자의', '동의',
])

// 한 글자지만 내용어인 명사 (잠, 책, 키 …)
export const KO_SINGLE = new Set([
  '잠', '책', '키', '꿈', '돈', '몸', '뇌', '병', '약', '술', '밥', '눈', '귀', '손', '발', '집', '땀', '빛', '물', '불',
  '숲', '산', '강', '비', '차', '배', '빵', '쌀', '옷', '폰', '앱', '글', '말', '꽃', '해', '달', '별', '질', '양',
])

// 방향·정도를 나타내는 형용사·동사 어근. 이것으로 시작하는 서술어는 내용어가 아니라 방향어이므로 버린다
// (방향은 단서어 사전으로 따로 판정한다).
const DIRECTION_ROOT =
  /^(높|낮|많|적|크|작|길|짧|늘|줄|좋|나쁘|떨어|오르|올라|올랐|커|빠르|느리|심하|심해|심|일찍|늦)(다|게|은|는|아|어|았다|었다|았고|었고|았으며|었으며|아서|어서|아지다|아진다|아졌다|아지는|아진|어지다|어진다|어졌다|어지는|어진|을수록|ㄹ수록|수록|고|며|으며|으면|면|인다|인|였다|였고|이는|일수록|어난다|어났다|어나는|어든다|어들었다|어드는|았던|었던|뜨린다|뜨렸다|뜨리는|뜨려|진다|졌다|지는)$|^(많이|높이는|높인|높였다|높인다|낮춘다|낮췄다|낮추는|줄인다|줄였다|줄이는|늘린다|늘렸다|늘리는)$/

// 파생 접미사 (성취도→성취, 우울감→우울, 집중력→집중, 공격성→공격, 성공률→성공). 앞이 2글자 이상일 때만.
const KO_DERIV = /^(.{2,}?)(도|율|률|감|력|성)$/
const KO_DERIV_KEEP = new Set(['청소년', '스트레스', '정체성', '사회성', '가능성', '중요성', '필요성'])

export function baseForm(token: string): string {
  if (KO_DERIV_KEEP.has(token)) return token
  const m = KO_DERIV.exec(token)
  return m ? m[1]! : token
}

function stemKorean(word: string): string {
  if (KO_KEEP.has(word)) return word
  if (DIRECTION_ROOT.test(word)) return ''
  let w = word
  let m = KO_ADJ_JEOK.exec(w)
  if (m) return m[1]!
  m = KO_PREDICATE.exec(w)
  if (m) w = m[1]!
  else {
    m = KO_COPULA.exec(w)
    if (m && !KO_KEEP.has(w)) w = m[1]!
  }
  if (KO_KEEP.has(w)) return w
  for (const j of KO_JOSA) {
    if (!w.endsWith(j) || w.length === j.length) continue
    const base = w.slice(0, -j.length)
    if (base.length >= 2 || KO_SINGLE.has(base)) return base
    // 조사를 떼면 한 글자만 남는 경우 ("명을", "것으로", "수는"): 내용어가 아니므로 버린다
    if (w.length <= 3) return ''
  }
  return w
}

// ── 영어 규칙 (가벼운 어간 추출) ──

export function stemEnglish(word: string): string {
  let w = word.toLowerCase()
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`
  if (w.endsWith('sses')) return w.slice(0, -2)
  if (w.endsWith('ness') && w.length > 6) w = w.slice(0, -4)
  else if (w.endsWith('ment') && w.length > 7) w = w.slice(0, -4)
  else if (w.endsWith('ingly') && w.length > 7) w = w.slice(0, -5)
  else if (w.endsWith('edly') && w.length > 6) w = w.slice(0, -4)
  else if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3)
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2)
  else if (w.endsWith('ly') && w.length > 4) w = w.slice(0, -2)
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1)
  // 겹자음 정리 (stopped → stopp → stop)
  if (/([^aeiouls])\1$/.test(w)) w = w.slice(0, -1)
  // 끝 e 제거로 표기 통일 (increase/increased → increas)
  if (w.endsWith('e') && w.length > 4) w = w.slice(0, -1)
  return w
}

// ── 숫자 ──

export const NUMBER_RE = /\d+(?:[.,]\d+)?\s*(?:%|퍼센트|배|명|시간|분|초|점|개|년|세|회|일|주|개월|kg|cm|km)?/gi

export function extractNumbers(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map((n) => n.replace(/\s+/g, '').replace(/,/g, '').toLowerCase())
}

// ── 기본 토크나이저 ──

const WORD_RE = /[가-힣]+|[A-Za-z][A-Za-z0-9-]*|\d+(?:\.\d+)?%?/g

export class RuleTokenizer implements Tokenizer {
  tokens(text: string): string[] {
    const out: string[] = []
    for (const raw of text.match(WORD_RE) ?? []) {
      if (/^[가-힣]+$/.test(raw)) {
        const stem = baseForm(stemKorean(raw))
        if ((stem.length >= 2 || KO_SINGLE.has(stem)) && !KO_STOP.has(stem)) out.push(stem)
      } else if (/^[A-Za-z]/.test(raw)) {
        const lower = raw.toLowerCase()
        if (EN_STOP.has(lower)) continue
        // 대문자 약어(SNS, ADHD)는 어간 추출 없이 소문자로
        const t = /^[A-Z0-9-]{2,}$/.test(raw) ? lower : stemEnglish(lower)
        if (t.length >= 2) out.push(t)
      } else {
        out.push(raw)
      }
    }
    return out
  }
}

export const defaultTokenizer: Tokenizer = new RuleTokenizer()

/** 순서를 유지한 중복 없는 토큰 */
export function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens)]
}
