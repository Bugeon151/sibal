// 문장 역할 태그와 정의 문장 (F4)

import type { SentenceRole } from '../types'

const ROLE_CUES: [SentenceRole, RegExp][] = [
  ['purpose', /(본\s*연구[는의]|목적[은으이]|목적으로|알아보고자|규명하고자|살펴보고자|밝히고자|\baim(s|ed)?\b|\bpurpose\b|\bobjective\b|\bwe\s+(examine|investigate)d?\b)/i],
  ['method', /(대상으로|설문|실험|면담|인터뷰|분석하였다|분석을\s*실시|회귀분석|조사하였다|수집하였다|\bsurvey\w*|\bexperiment\w*|\bparticipants?\b|\bregression\b|\bwe\s+(used|conducted|collected)\b|\bmethod\w*)/i],
  ['result', /(나타났다|확인되었다|밝혀졌다|드러났다|유의|증가|감소|높았|낮았|상관|\bfound\b|\bshowed\b|\brevealed\b|\bsignificant\w*|\bresults?\s+(indicate|show|suggest)\w*|\b(was|were|is|are)\s+(positively|negatively)?\s*(associated|correlated)\b|\b(negative|positive)\s+(relationship|correlation|association)\b)/i],
  ['conclusion', /(시사|제언|필요하다|필요성|함의|기대된다|해야\s*한다|하여야\s*한다|바람직하다|\bshould\b|\bsuggest\w*|\bimplication\w*|\bconclud\w*|\brecommend\w*)/i],
]

// 구조화 초록 머리말: "RESULTS:", "(3) Results:", "결과:", "【결론】" 등
const HEADINGS: [SentenceRole | 'background', RegExp][] = [
  ['background', /^(?:[(【[]?\d{0,2}[)】\].]?\s?)?(background|introduction|context|배경|서론)\s*[:：】\]]/i],
  ['purpose', /^(?:[(【[]?\d{0,2}[)】\].]?\s?)?(objectives?|aims?|purpose|goals?|목적|연구\s*목적)\s*[:：】\]]/i],
  ['method', /^(?:[(【[]?\d{0,2}[)】\].]?\s?)?(methods?|materials?\s+and\s+methods|design|participants|방법|연구\s*방법|대상\s*및\s*방법)\s*[:：】\]]/i],
  ['result', /^(?:[(【[]?\d{0,2}[)】\].]?\s?)?(results?|findings|결과|연구\s*결과)\s*[:：】\]]/i],
  ['conclusion', /^(?:[(【[]?\d{0,2}[)】\].]?\s?)?(conclusions?|discussion|implications?|결론|논의|시사점)\s*[:：】\]]/i],
]

/** 머리말이 있으면 그 역할 ('background'는 배경). 없으면 undefined */
export function headingRole(sentence: string): SentenceRole | 'background' | undefined {
  const head = sentence.trimStart().slice(0, 40)
  return HEADINGS.find(([, re]) => re.test(head))?.[0]
}

// 권고 문장 ("~해야 한다", "should")은 결과 단서어가 있어도 결론으로 본다
const RECOMMENDATION = /(해야\s*한다|하여야\s*한다|바람직하다|필요가\s*있다|\bshould\b|\bneed\s+to\b|\brecommend\w*)/i

export function detectRole(sentence: string): SentenceRole | null {
  const h = headingRole(sentence)
  if (h) return h === 'background' ? null : h
  if (RECOMMENDATION.test(sentence)) return 'conclusion'
  for (const [role, re] of ROLE_CUES) {
    if (re.test(sentence)) return role
  }
  return null
}

// "X란 …이다", "X는 …을 의미한다/말한다/뜻한다", "X is defined as"
const DEFINITION_PATTERNS: RegExp[] = [
  /^\s*([가-힣A-Za-z0-9\s()·-]{2,20}?)(이)?란\s+.+(이다|말한다|의미한다|뜻한다|가리킨다)\.?$/,
  /^\s*([가-힣A-Za-z0-9\s()·-]{2,20}?)[은는]\s+.+(을|를)\s*(의미한다|말한다|뜻한다|가리킨다)\.?$/,
  /^\s*([A-Za-z][A-Za-z\s-]{1,40}?)\s+(is|are)\s+defined\s+as\b/i,
  /^\s*([A-Za-z][A-Za-z\s-]{1,40}?)\s+refers\s+to\b/i,
]

export function detectDefinition(sentence: string): string | null {
  for (const re of DEFINITION_PATTERNS) {
    const m = re.exec(sentence)
    if (m?.[1]) return m[1].trim()
  }
  return null
}
