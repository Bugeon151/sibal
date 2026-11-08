// 유사도·키워드 계산에서 빼는 말. 논문 상투어 중심.

export const KO_STOP = new Set([
  '연구', '본연구', '분석', '결과', '대상', '목적', '방법', '논문', '자료', '조사', '측정', '확인',
  '대한', '대해', '통해', '위해', '관한', '따른', '따라', '의한', '위한', '같은', '다른', '이런', '그런',
  '이러한', '그러한', '또한', '그리고', '하지만', '그러나', '따라서', '그러므로', '즉', '및', '등', '것', '수',
  '있다', '없다', '있는', '없는', '있으며', '있었다', '없었다', '있었으며', '없었으며', '있고', '없고', '하였다', '나타났다', '보였다', '밝혔다', '제시', '시사점',
  '때문', '경우', '정도', '측면', '부분', '이후', '이전', '동안', '사이', '가지', '하나', '여러', '각각',
  '미치', '미친', '미쳤', '살펴보', '알아보', '나타나', '보이', '결과적',
  // 흔한 부사 (바꿔 쓰기에 자주 나오지만 내용어가 아님)
  '오래', '함께', '매우', '아주', '자주', '계속', '특히', '주로', '다시', '서로', '더욱', '점점', '훨씬', '가장', '모두', '바로', '이미', '아직', '조금', '약간', '대부분',
])

/** 주제에서 키워드를 뽑을 때만 추가로 빼는 말 (관계·질문 표현) */
export const TOPIC_STOP = new Set([
  '영향', '관계', '미치는', '끼치는', '미치', '끼치', '미친', '주는', '비교', '차이', '방안', '현황', '원인', '문제', '탐구', '주제',
  '해결', '실태', '효과', '역할', '의미', '중요성', '필요성', '변화',
])

export const EN_STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'about',
  'as', 'into', 'through', 'over', 'between', 'among', 'during', 'after', 'before', 'than', 'this', 'that',
  'these', 'those', 'it', 'its', 'they', 'their', 'we', 'our', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'has', 'have', 'had', 'do', 'does', 'did', 'can', 'could', 'may', 'might', 'will', 'would',
  'should', 'also', 'which', 'who', 'whom', 'whose', 'what', 'when', 'where', 'how', 'not', 'no', 'such',
  'study', 'studies', 'result', 'results', 'paper', 'research', 'analysis', 'method', 'methods', 'data',
  'based', 'show', 'shows', 'showed', 'shown', 'found', 'find', 'findings',
  'present', 'aim', 'aims', 'purpose', 'however', 'therefore', 'thus', 'both', 'each', 'other', 'more',
  'most', 'well', 'one', 'two', 'three', 'there', 'here', 'all', 'any', 'some',
])
