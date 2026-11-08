// 데모 모드 fetcher. 중계 함수가 아직 없을 때, 엔진 테스트와 같은 가짜 응답을 돌려준다.
// 처리(점수·핵심 문장·판정)는 진짜 엔진이 하고, 입력 데이터만 고정 예시다.
import { KCI_XML, NAVER_JSON, OPENALEX_JSON } from '@suhaengcut/engine-fixtures'

export const DEMO_RELAY = 'https://demo.relay.invalid/'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function demoFetch(input: string): Promise<Response> {
  await wait(350 + Math.random() * 400)
  if (input.startsWith('https://api.openalex.org') || input.includes('/openalex')) return Response.json(OPENALEX_JSON)
  if (input.includes('/kci/')) return new Response(KCI_XML, { headers: { 'content-type': 'application/xml' } })
  if (input.includes('/news')) return Response.json(NAVER_JSON)
  return new Response('not found', { status: 404 })
}
