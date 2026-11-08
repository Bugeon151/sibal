// 배포용 한영 대응 사전 만들기 (개발 단계에서만 실행, 앱 사용 중에는 수집하지 않는다).
// KCI 논문의 한·영 저자 키워드를 같은 위치끼리 짝짓고, minCount번 이상 나온 쌍만 남긴다.

import type { RawPaper } from '../sources/types'
import { keywordPairs } from '../sources/kci'
import type { DictionaryData } from './dictionary'

export function buildKoEn(papers: RawPaper[], minCount = 3, maxPerKo = 3): DictionaryData['koEn'] {
  const counts = new Map<string, Map<string, number>>()
  for (const [koRaw, enRaw] of keywordPairs(papers)) {
    const ko = koRaw.trim().replace(/\s+/g, '')
    const en = enRaw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!/[가-힣]/.test(ko) || !/^[a-z0-9][a-z0-9\s-]*$/.test(en)) continue
    const m = counts.get(ko) ?? new Map<string, number>()
    m.set(en, (m.get(en) ?? 0) + 1)
    counts.set(ko, m)
  }
  const out: DictionaryData['koEn'] = {}
  for (const ko of [...counts.keys()].sort()) {
    const ens = [...counts.get(ko)!.entries()]
      .filter(([, n]) => n >= minCount)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, maxPerKo)
      .map(([en]) => en)
    if (ens.length > 0) out[ko] = ens
  }
  return out
}

/** 시드 사전과 생성 사전 합치기 (시드가 앞) */
export function mergeDictionaryData(...parts: DictionaryData[]): DictionaryData {
  const koEn: DictionaryData['koEn'] = {}
  for (const p of parts) {
    for (const [ko, ens] of Object.entries(p.koEn)) koEn[ko] = [...new Set([...(koEn[ko] ?? []), ...ens])]
  }
  return { synonyms: parts.flatMap((p) => p.synonyms), koEn }
}
