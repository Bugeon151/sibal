import { beforeEach, describe, expect, it } from 'vitest'
import { handle, resetRateLimit, type Env } from '../src/index'

const env: Env = {
  KCI_API_KEY: 'kci-secret',
  NAVER_CLIENT_ID: 'naver-id',
  NAVER_CLIENT_SECRET: 'naver-secret',
  ALLOWED_ORIGINS: 'https://app.test, http://localhost:5173',
  RATE_PER_MINUTE: '3',
}
const ORIGIN = 'https://app.test'
const DEVICE = 'device-1234-abcd'

function req(path: string, init: { origin?: string; device?: string; method?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.origin !== '') headers.Origin = init.origin ?? ORIGIN
  if (init.device !== '') headers['X-Device-Id'] = init.device ?? DEVICE
  return new Request(`https://relay.test${path}`, { method: init.method ?? 'GET', headers })
}

function recordingFetch() {
  const seen: Request[] = []
  const f = (async (input: Request) => {
    seen.push(input)
    return new Response('<ok/>', { status: 200, headers: { 'content-type': 'application/xml', 'set-cookie': 'x=1' } })
  }) as unknown as typeof fetch
  return { f, seen }
}

beforeEach(() => resetRateLimit())

describe('relay', () => {
  it('KCI 검색: 키를 붙여 전달하고 본문을 그대로 돌려준다', async () => {
    const { f, seen } = recordingFetch()
    const res = await handle(req('/kci/search?q=%EC%88%98%EB%A9%B4&dateFrom=201701'), env, f)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<ok/>')
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('set-cookie')).toBeNull()
    const up = new URL(seen[0]!.url)
    expect(up.searchParams.get('key')).toBe('kci-secret')
    expect(up.searchParams.get('apiCode')).toBe('articleSearch')
    expect(up.searchParams.get('title')).toBe('수면')
    expect(up.searchParams.get('dateFrom')).toBe('201701')
  })

  it('네이버 뉴스(API HUB): 비밀 키는 헤더로만, 응답에 키가 섞이지 않는다', async () => {
    const { f, seen } = recordingFetch()
    const res = await handle(req('/news?q=수면&display=20'), env, f)
    expect(res.status).toBe(200)
    expect(new URL(seen[0]!.url).origin).toBe('https://naverapihub.apigw.ntruss.com')
    expect(seen[0]!.headers.get('X-NCP-APIGW-API-KEY-ID')).toBe('naver-id')
    expect(seen[0]!.headers.get('X-NCP-APIGW-API-KEY')).toBe('naver-secret')
    expect(new URL(seen[0]!.url).searchParams.get('query')).toBe('수면')
    expect([...res.headers.values()].join(' ')).not.toContain('naver-secret')
  })

  it('네이버 기존 개발자센터 방식 (NAVER_API_STYLE=legacy)', async () => {
    const { f, seen } = recordingFetch()
    await handle(req('/news?q=a'), { ...env, NAVER_API_STYLE: 'legacy' }, f)
    expect(new URL(seen[0]!.url).origin).toBe('https://openapi.naver.com')
    expect(seen[0]!.headers.get('X-Naver-Client-Secret')).toBe('naver-secret')
  })

  it('허용되지 않은 출처는 403', async () => {
    const { f, seen } = recordingFetch()
    expect((await handle(req('/news?q=a', { origin: 'https://evil.test' }), env, f)).status).toBe(403)
    expect((await handle(req('/news?q=a', { origin: '' }), env, f)).status).toBe(403)
    expect(seen).toHaveLength(0)
  })

  it('허용 목록 밖의 경로·파라미터·형식은 거부', async () => {
    const { f, seen } = recordingFetch()
    expect((await handle(req('/kci/admin'), env, f)).status).toBe(404)
    expect((await handle(req('/news?q=a&key=steal'), env, f)).status).toBe(400)
    expect((await handle(req('/news'), env, f)).status).toBe(400)
    expect((await handle(req('/news?q=a&display=999'), env, f)).status).toBe(400)
    expect((await handle(req('/kci/detail?id=../../etc'), env, f)).status).toBe(400)
    expect((await handle(req('/news?q=a', { method: 'POST' }), env, f)).status).toBe(405)
    expect(seen).toHaveLength(0)
  })

  it('OPTIONS 사전 요청에 CORS 헤더', async () => {
    const res = await handle(req('/news?q=a', { method: 'OPTIONS' }), env)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-headers')).toBe('X-Device-Id')
  })

  it('기기 ID 필수, 분당 호출 제한', async () => {
    const { f } = recordingFetch()
    expect((await handle(req('/news?q=a', { device: '' }), env, f)).status).toBe(400)
    const t = 1_000_000_000_000
    for (let i = 0; i < 3; i++) expect((await handle(req('/news?q=a'), env, f, t)).status).toBe(200)
    const blocked = await handle(req('/news?q=a'), env, f, t)
    expect(blocked.status).toBe(429)
    // 다른 기기는 영향 없음
    expect((await handle(req('/news?q=a', { device: 'other-device-0001' }), env, f, t)).status).toBe(200)
    // 다음 분에는 다시 허용
    expect((await handle(req('/news?q=a'), env, f, t + 60_000)).status).toBe(200)
  })

  it('업스트림 오류는 502, 업스트림 429는 429', async () => {
    const down = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    expect((await handle(req('/news?q=a'), env, down)).status).toBe(502)
    const limited = (async () => new Response('x', { status: 429 })) as unknown as typeof fetch
    expect((await handle(req('/news?q=b', { device: 'device-9999-zzzz' }), env, limited)).status).toBe(429)
    const broken = (async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect((await handle(req('/news?q=c', { device: 'device-8888-yyyy' }), env, broken)).status).toBe(502)
  })
})

describe('relay /openalex', () => {
  it('OpenAlex 키를 붙이고 select·기간 필터를 정해서 전달', async () => {
    const seen: Request[] = []
    const f = (async (r: Request) => {
      seen.push(r)
      return Response.json({ results: [] })
    }) as unknown as typeof fetch
    const res = await handle(req('/openalex?q=smartphone%20sleep&fromYear=2017&perPage=25'), { ...env, OPENALEX_API_KEY: 'oa-key' }, f)
    expect(res.status).toBe(200)
    const u = new URL(seen[0]!.url)
    expect(u.origin + u.pathname).toBe('https://api.openalex.org/works')
    expect(u.searchParams.get('api_key')).toBe('oa-key')
    expect(u.searchParams.get('filter')).toBe('publication_year:>2016')
    expect(u.searchParams.get('select')).toContain('abstract_inverted_index')
    expect((await handle(req('/openalex?q=a&fromYear=abc'), env, f)).status).toBe(400)
  })
})

describe('relay 리뷰 수정', () => {
  it('프로토타입 이름 파라미터도 거부', async () => {
    const f = (async () => new Response('ok')) as unknown as typeof fetch
    expect((await handle(req('/news?q=a&constructor=1'), env, f)).status).toBe(400)
    expect((await handle(req('/news?q=a&toString=x'), env, f)).status).toBe(400)
  })
  it('RATE_PER_MINUTE가 숫자가 아니면 기본값 30', async () => {
    const f = (async () => new Response('ok')) as unknown as typeof fetch
    const bad = { ...env, RATE_PER_MINUTE: 'abc' }
    for (let i = 0; i < 5; i++) expect((await handle(req('/news?q=a', { device: 'rate-test-0001' }), bad, f, 5e12)).status).toBe(200)
  })
  it('업스트림 오류 본문(키가 들어 있을 수 있음)은 넘기지 않는다', async () => {
    const leak = (async () => new Response('error for https://x?key=kci-secret', { status: 401 })) as unknown as typeof fetch
    const res = await handle(req('/kci/search?q=a', { device: 'leak-test-0001' }), env, leak)
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('kci-secret')
  })
})

describe('relay 엣지 캐시', () => {
  function memoryCache() {
    const m = new Map<string, Response>()
    return {
      store: m,
      async match(r: Request) {
        const v = m.get(r.url)
        return v ? v.clone() : undefined
      },
      async put(r: Request, res: Response) {
        m.set(r.url, res.clone())
      },
    }
  }

  it('같은 검색은 기기가 달라도 캐시에서 주고, 외부 API는 한 번만 부른다', async () => {
    const cache = memoryCache()
    let calls = 0
    const f = (async () => {
      calls++
      return new Response('<ok/>', { headers: { 'content-type': 'application/xml' } })
    }) as unknown as typeof fetch
    const r1 = await handle(req('/kci/search?q=수면&page=1', { device: 'cache-dev-0001' }), env, f, 1e12, cache)
    const r2 = await handle(req('/kci/search?page=1&q=수면', { device: 'cache-dev-0002' }), env, f, 1e12, cache)
    expect(calls).toBe(1)
    expect(r1.headers.get('x-relay-cache')).toBe('miss')
    expect(r2.headers.get('x-relay-cache')).toBe('hit')
    expect(await r2.text()).toBe('<ok/>')
    expect(r2.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('캐시 키에 키·기기 ID가 들어가지 않고, 오류 응답은 캐시하지 않는다', async () => {
    const cache = memoryCache()
    const fail = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    await handle(req('/news?q=a', { device: 'cache-dev-0003' }), env, fail, 2e12, cache)
    expect(cache.store.size).toBe(0)
    const ok = (async () => Response.json({ items: [] })) as unknown as typeof fetch
    await handle(req('/news?q=a', { device: 'cache-dev-0004' }), env, ok, 2e12, cache)
    const keys = [...cache.store.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toContain('secret')
    expect(keys[0]).not.toContain('cache-dev')
  })

  it('캐시 적중은 호출 제한에 세지 않는다', async () => {
    const cache = memoryCache()
    const f = (async () => Response.json({ items: [] })) as unknown as typeof fetch
    await handle(req('/news?q=b', { device: 'cache-dev-0005' }), env, f, 3e12, cache)
    for (let i = 0; i < 10; i++) expect((await handle(req('/news?q=b', { device: 'cache-dev-0005' }), env, f, 3e12, cache)).status).toBe(200)
  })
})
