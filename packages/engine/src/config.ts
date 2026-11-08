// 가중치·임계값. 모두 초기값이며 판정 세트로 조정한다 (docs/데이터-입력-명세.md "처리 엔진 규칙과 수식").

export const config = {
  bm25: { k1: 1.2, b: 0.75 },

  paperScore: { keyword: 30, citation: 30, recency: 25, oa: 15, recencyYears: 10 },
  paperSelect: { min: 3, max: 5, highScore: 70, minSentences: 2 },

  newsScore: { keyword: 60, recency: 40, halfLifeDays: 30 },
  newsSelect: { min: 3, max: 5, dedupeJaccard: 0.6 },

  keySentence: { textrank: 0.5, query: 0.3, structure: 0.2, count: 3 },
  // 구조 점수: 역할이 있으면 역할 점수, 없으면 위치 점수. 배경 문장은 낮게.
  structure: { result: 1.0, conclusion: 0.9, purpose: 0.6, method: 0.3, background: 0.1, first: 0.5, last: 0.6, other: 0.3 },
  textrank: { damping: 0.85, maxIter: 30, tolerance: 1e-4 },

  compare: { maxConcepts: 5, minPapers: 2 },

  check: {
    coverageWeight: 0.6,
    bm25Weight: 0.4,
    noEvidenceBelow: 0.35,
    supportAtLeast: 0.5,
    /** 근거 어디에도 없는 학생 토큰의 IDF 비중이 이 이상이면 '지지'를 주지 않는다 */
    missingShareMax: 0.2,
    secondEvidenceAtLeast: 0.5,
    maxEvidence: 2,
    maxSentences: 10,
    maxChars: 1500,
    suggestCount: 2,
  },

  candidatePoolSize: 20,

  ttl: {
    researchMs: 24 * 60 * 60 * 1000,
    paperCacheMs: 7 * 24 * 60 * 60 * 1000,
    newsCacheMs: 6 * 60 * 60 * 1000,
  },

  limits: {
    topicMin: 2,
    topicMax: 200,
    questionMin: 5,
    questionMax: 200,
    keywordsMax: 5,
    keywordMaxLen: 40,
    extraPromptMax: 3000,
  },
} as const

export type Config = typeof config
