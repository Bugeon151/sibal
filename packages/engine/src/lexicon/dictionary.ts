// 동의어 사전과 한영 대응 사전.
// 현재는 시드 데이터. 배포용 사전은 개발 스크립트로 KCI 한·영 저자 키워드 쌍에서 수집해 JSON으로 만든다.
// 매칭은 토크나이저와 같은 형태(한국어 어간, 영어 소문자 어간)로 한다.

import { baseForm, stemEnglish } from '../text/tokenizer'
import academic from './data/academic-ko-en.json'
import generated from './data/generated.json'

export type DictionaryData = {
  /** 같은 뜻 묶음 */
  synonyms: string[][]
  /** 한국어 → 영어 원문 표현 */
  koEn: Record<string, string[]>
}

export const seedDictionary: DictionaryData = {
  synonyms: [
    ['스마트폰', '휴대전화', '휴대폰', '핸드폰'],
    ['청소년', '십대'],
    ['수면', '잠'],
    ['sns', '소셜미디어'],
    ['우울', '우울감', '우울증'],
    ['성적', '학업성취', '학업성적'],
    ['기후변화', '지구온난화'],
    ['미세먼지', '초미세먼지'],
    ['인공지능', 'ai'],
  ],
  koEn: {
    스마트폰: ['smartphone', 'mobile phone'],
    청소년: ['adolescent', 'teenager', 'youth'],
    수면: ['sleep'],
    sns: ['social media'],
    우울: ['depression'],
    스트레스: ['stress'],
    불안: ['anxiety'],
    성적: ['academic performance', 'academic achievement'],
    기후변화: ['climate change'],
    미세먼지: ['particulate matter', 'fine dust'],
    인공지능: ['artificial intelligence'],
    운동: ['exercise', 'physical activity'],
    비만: ['obesity'],
    게임: ['video game', 'gaming'],
    독서: ['reading'],
    교육: ['education'],
    학생: ['student'],
    사용: ['use', 'usage'],
    시간: ['time', 'duration'],
  },
}

/** 앱 기본 사전: 시드 + 생성 사전 (scripts/build-dictionary.ts) */
export function defaultDictionaryData(): DictionaryData {
  const g = generated as DictionaryData
  const koEn: DictionaryData['koEn'] = { ...seedDictionary.koEn }
  for (const src of [(academic as { koEn: DictionaryData['koEn'] }).koEn, g.koEn]) {
    for (const [ko, ens] of Object.entries(src)) koEn[ko] = [...new Set([...(koEn[ko] ?? []), ...ens])]
  }
  return { synonyms: [...seedDictionary.synonyms, ...g.synonyms], koEn }
}

/** 사전 항목을 매칭용 키로 바꾼다 (한국어는 공백 제거, 영어는 단어별 어간) */
export function keyOf(term: string): string[] {
  const t = term.trim().toLowerCase()
  if (/^[a-z0-9\s-]+$/.test(t)) return t.split(/[\s-]+/).filter(Boolean).map((w) => (w.length <= 3 ? w : stemEnglish(w)))
  return [baseForm(t.replace(/\s+/g, ''))]
}

export class Dictionary {
  private readonly synonymOf = new Map<string, Set<string>>()
  /** 한국어 키 → 영어 원문 표현 (검색어용) */
  private readonly enPhrases = new Map<string, Set<string>>()
  /** 한국어 키 → 영어 어간 (매칭용) */
  private readonly enStems = new Map<string, Set<string>>()
  /** 영어 어간 → 대표 한국어 키 */
  private readonly koOfEn = new Map<string, string>()
  /** 동의어 묶음의 대표형 (묶음의 첫 항목) */
  private readonly headOf = new Map<string, string>()

  constructor(data: DictionaryData = defaultDictionaryData()) {
    for (const group of data.synonyms) {
      const keys = new Set(group.flatMap(keyOf))
      const head = [...keys][0]!
      for (const k of keys) {
        if (!this.headOf.has(k)) this.headOf.set(k, head)
        const set = this.synonymOf.get(k) ?? new Set<string>()
        for (const other of keys) if (other !== k) set.add(other)
        this.synonymOf.set(k, set)
      }
    }
    for (const [ko, ens] of Object.entries(data.koEn)) {
      for (const en of ens) this.addKoEn(ko, en)
    }
  }

  addKoEn(ko: string, en: string): void {
    for (const k of keyOf(ko)) {
      const phrases = this.enPhrases.get(k) ?? new Set<string>()
      phrases.add(en.trim().toLowerCase())
      this.enPhrases.set(k, phrases)
      const stems = this.enStems.get(k) ?? new Set<string>()
      const enKeys = keyOf(en)
      for (const s of enKeys) stems.add(s)
      this.enStems.set(k, stems)
      // 한 단어 영어 표현만 역방향 대표형으로 등록 (social media → sns 같은 다어절은 오매칭 위험)
      if (enKeys.length === 1 && !this.koOfEn.has(enKeys[0]!)) this.koOfEn.set(enKeys[0]!, k)
    }
  }

  /** 비교표 개념 묶기용 대표형: 동의어는 묶음 대표, 영어 어간은 대응 한국어 */
  canonical(token: string): string {
    const ko = this.koOfEn.get(token)
    const base = ko ?? token
    return this.headOf.get(base) ?? base
  }

  /** 토큰 하나의 동치 집합: 자신 + 동의어 + 영어 대응 어간 */
  expand(token: string): Set<string> {
    const out = new Set<string>([token])
    for (const s of this.synonymOf.get(token) ?? []) out.add(s)
    for (const base of [...out]) {
      for (const st of this.enStems.get(base) ?? []) out.add(st)
    }
    return out
  }

  /** 검색어용 영어 표현 (자신과 동의어의 대응 표현) */
  englishPhrases(token: string): string[] {
    const forms = [token, ...(this.synonymOf.get(token) ?? [])]
    const out = new Set<string>()
    for (const f of forms) for (const p of this.enPhrases.get(f) ?? []) out.add(p)
    return [...out]
  }
}
