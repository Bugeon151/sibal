// 테스트용 가짜 응답. KCI XML 구조는 추정치이므로 실제 응답을 받으면 교체한다.

export const KCI_XML = `<?xml version="1.0" encoding="UTF-8"?>
<MetaData>
  <outputData>
    <result><total>3</total></result>
    <record>
      <journalInfo>
        <journal-name>한국청소년연구</journal-name>
        <pub-year>2023</pub-year>
      </journalInfo>
      <articleInfo article-id="ART0001">
        <title-group>
          <article-title lang="original">청소년의 스마트폰 사용 시간과 수면의 관계</article-title>
          <article-title lang="english">Smartphone use time and sleep in adolescents</article-title>
        </title-group>
        <author-group><author>김민수</author><author>이지은</author></author-group>
        <abstract-group>
          <abstract lang="original">본 연구는 청소년의 스마트폰 사용 시간과 수면의 관계를 알아보고자 하였다. 고등학생 520명을 대상으로 설문을 실시하였다. 분석 결과 스마트폰 사용 시간이 길수록 수면 시간은 감소하는 것으로 나타났다. 특히 취침 전 스마트폰 사용은 수면의 질을 낮추는 것으로 나타났다. 따라서 청소년의 스마트폰 사용 시간 관리 교육이 필요하다.</abstract>
          <abstract lang="english">This study examined smartphone use and sleep among adolescents.</abstract>
        </abstract-group>
        <keyword-group>
          <keyword lang="original">스마트폰; 수면; 청소년</keyword>
          <keyword lang="english">smartphone; sleep; adolescent</keyword>
        </keyword-group>
        <citation-count>12</citation-count>
        <doi>10.1000/kci.0001</doi>
      </articleInfo>
    </record>
    <record>
      <journalInfo>
        <journal-name>수면의학</journal-name>
        <pub-year>2021</pub-year>
      </journalInfo>
      <articleInfo article-id="ART0002">
        <title-group>
          <article-title lang="original">고등학생의 수면 부족과 학업 스트레스</article-title>
        </title-group>
        <author-group><author>박서준</author></author-group>
        <abstract-group>
          <abstract lang="original">이 연구는 고등학생의 수면 부족 실태를 분석하였다. 학업 스트레스가 높을수록 수면 시간이 감소하였다. 스마트폰 사용 시간은 수면 시간과 유의한 관계가 없었다. 수면 교육 프로그램이 필요하다.</abstract>
        </abstract-group>
        <keyword-group>
          <keyword lang="original">수면; 스트레스</keyword>
          <keyword lang="english">sleep; stress</keyword>
        </keyword-group>
        <citation-count>3</citation-count>
      </articleInfo>
    </record>
    <record>
      <journalInfo>
        <journal-name>교육연구</journal-name>
        <pub-year>2008</pub-year>
      </journalInfo>
      <articleInfo article-id="ART0003">
        <title-group><article-title lang="original">초록 없는 오래된 논문</article-title></title-group>
        <author-group><author>최우식</author></author-group>
      </articleInfo>
    </record>
  </outputData>
</MetaData>`

export const OPENALEX_JSON = {
  results: [
    {
      id: 'https://openalex.org/W1',
      doi: 'https://doi.org/10.2000/oa.1',
      title: 'Smartphone use and sleep duration in adolescents',
      publication_year: 2022,
      language: 'en',
      type: 'article',
      authorships: [{ author: { display_name: 'A. Kim' } }, { author: { display_name: 'B. Lee' } }, { author: { display_name: 'C. Park' } }, { author: { display_name: 'D. Choi' } }],
      primary_location: { source: { display_name: 'Sleep Health' } },
      cited_by_count: 150,
      abstract_inverted_index: {
        We: [0], surveyed: [1], '1,200': [2], adolescents: [3, 12], about: [4], smartphone: [5, 16], use: [6, 17],
        'sleep.': [7], 'Results': [8], showed: [9], that: [10], 'heavy-using': [11], had: [13], reduced: [14], 'sleep': [15], 'duration.': [18],
        Bedtime: [19], screen: [20], time: [21], 'was': [22], associated: [23], with: [24], lower: [25], sleep2: [26],
      },
      open_access: { is_oa: true, oa_url: 'https://example.org/oa1.pdf' },
    },
    {
      id: 'https://openalex.org/W2',
      doi: 'https://doi.org/10.1000/KCI.0001',
      title: '청소년의 스마트폰 사용 시간과 수면의 관계',
      publication_year: 2023,
      language: 'ko',
      type: 'article',
      authorships: [{ author: { display_name: '김민수' } }],
      primary_location: { source: { display_name: '한국청소년연구' } },
      cited_by_count: 14,
      abstract_inverted_index: null,
      open_access: { is_oa: false, oa_url: null },
    },
    {
      id: 'https://openalex.org/W3',
      doi: null,
      title: 'Editorial note',
      publication_year: 2024,
      language: 'en',
      type: 'paratext',
      authorships: [],
      primary_location: null,
      cited_by_count: 0,
      abstract_inverted_index: null,
      open_access: { is_oa: false },
    },
  ],
}

export const NAVER_JSON = {
  items: [
    {
      title: '청소년 <b>스마트폰</b> 사용 늘며 <b>수면</b> 시간 줄어',
      originallink: 'https://www.yna.co.kr/view/AKR1',
      link: 'https://n.news.naver.com/1',
      description: '청소년의 하루 평균 <b>스마트폰</b> 사용 시간이 늘면서 수면 시간은 줄어든 것으로 조사됐다. 전문가들은 취침 전 사용을 줄여야 한다고 말했다.',
      pubDate: 'Mon, 02 Nov 2026 09:00:00 +0900',
    },
    {
      title: '청소년 스마트폰 사용 늘며 수면 시간 줄어 (종합)',
      originallink: 'https://www.news1.kr/articles/2',
      link: 'https://n.news.naver.com/2',
      description: '청소년의 스마트폰 사용 시간이 늘면서 수면 시간은 줄었다.',
      pubDate: 'Mon, 02 Nov 2026 10:00:00 +0900',
    },
    {
      title: '주식 시장 동향',
      originallink: 'https://www.mk.co.kr/3',
      link: 'https://n.news.naver.com/3',
      description: '코스피가 상승했다.',
      pubDate: 'Tue, 03 Nov 2026 09:00:00 +0900',
    },
  ],
}
