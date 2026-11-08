// 키 중계 함수 (Cloudflare Workers).
// 하는 일: 허용된 경로·파라미터만 받아 키를 붙여 KCI·OpenAlex·네이버에 전달하고, 응답을 그대로 돌려준다.
// 하지 않는 일: 계산, 저장, 검색어 로그.
//
// 업스트림 (2026-11-08 확인):
//   - KCI: https://open.kci.go.kr/po/openapi/openApiSearch.kci, apiCode=articleSearch, key, 검색어는 title (오픈소스 래퍼 코드 기준)
//   - 네이버: NAVER API HUB https://naverapihub.apigw.ntruss.com/search/v1/news,
//     헤더 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY (공식 문서 기준).
//     기존 개발자센터 키를 쓸 때는 NAVER_API_STYLE=legacy

export interface Env {
  KCI_API_KEY: string
  /** OpenAlex 무료 키 (하루 예산 $1 ≈ 검색 1,000회). 없으면 키 없이 전달 */
  OPENALEX_API_KEY?: string
  NAVER_CLIENT_ID: string
  NAVER_CLIENT_SECRET: string
  /** 쉼표로 구분한 허용 출처 (예: https://suhaengcut.pages.dev,http://localhost:5173) */
  ALLOWED_ORIGINS: string
  KCI_BASE_URL?: string
  NAVER_NEWS_URL?: string
  /** 'hub'(기본, NAVER API HUB) 또는 'legacy'(기존 개발자센터) */
  NAVER_API_STYLE?: string
  /** 기기당 분당 허용 호출 수 (기본 30) */
  RATE_PER_MINUTE?: string
}

const DEFAULT_KCI_BASE = 'https://open.kci.go.kr/po/openapi/openApiSearch.kci'
const NAVER_HUB_NEWS = 'https://naverapihub.apigw.ntruss.com/search/v1/news'
const NAVER_LEGACY_NEWS = 'https://openapi.naver.com/v1/search/news.json'
const OPENALEX_WORKS = 'https://api.openalex.org/works'
const OPENALEX_SELECT =
  'id,doi,title,publication_year,language,type,authorships,primary_location,cited_by_count,abstract_inverted_index,open_access'

type Route = {
  params: Record<string, (v: string) => boolean>
  required: string[]
  /** 같은 요청을 엣지 캐시에 보관할 시간(초). 여러 학생이 같은 주제를 검색해도 외부 API는 한 번만 부른다 */
  cacheSeconds: number
  forward: (q: URLSearchParams, env: Env) => Request
}

const isText = (max: number) => (v: string) => v.length > 0 && v.length <= max
const isInt = (min: number, max: number) => (v: string) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max
const isYyyymm = (v: string) => /^\d{6}$/.test(v)
const isArticleId = (v: string) => /^[A-Z]{3}\d{6,12}$/.test(v)
const isYear = (v: string) => /^(19|20)\d{2}$/.test(v)

const ROUTES: Record<string, Route> = {
  '/kci/search': {
    params: { q: isText(200), page: isInt(1, 20), dateFrom: isYyyymm, dateTo: isYyyymm },
    required: ['q'],
    cacheSeconds: 24 * 3600,
    forward: (q, env) => {
      const u = new URL(env.KCI_BASE_URL || DEFAULT_KCI_BASE)
      u.searchParams.set('apiCode', 'articleSearch')
      u.searchParams.set('key', env.KCI_API_KEY)
      u.searchParams.set('title', q.get('q')!)
      u.searchParams.set('displayCount', '50')
      u.searchParams.set('page', q.get('page') ?? '1')
      if (q.get('dateFrom')) u.searchParams.set('dateFrom', q.get('dateFrom')!)
      if (q.get('dateTo')) u.searchParams.set('dateTo', q.get('dateTo')!)
      return new Request(u.toString())
    },
  },
  '/kci/detail': {
    params: { id: isArticleId },
    required: ['id'],
    cacheSeconds: 7 * 24 * 3600,
    forward: (q, env) => {
      const u = new URL(env.KCI_BASE_URL || DEFAULT_KCI_BASE)
      u.searchParams.set('apiCode', 'articleDetail')
      u.searchParams.set('key', env.KCI_API_KEY)
      u.searchParams.set('id', q.get('id')!)
      return new Request(u.toString())
    },
  },
  '/openalex': {
    params: { q: isText(200), fromYear: isYear, perPage: isInt(1, 50) },
    required: ['q'],
    cacheSeconds: 24 * 3600,
    forward: (q, env) => {
      const u = new URL(OPENALEX_WORKS)
      u.searchParams.set('search', q.get('q')!)
      if (q.get('fromYear')) u.searchParams.set('filter', `publication_year:>${Number(q.get('fromYear')) - 1}`)
      u.searchParams.set('per-page', q.get('perPage') ?? '25')
      u.searchParams.set('select', OPENALEX_SELECT)
      if (env.OPENALEX_API_KEY) u.searchParams.set('api_key', env.OPENALEX_API_KEY)
      return new Request(u.toString())
    },
  },
  '/news': {
    params: { q: isText(100), display: isInt(1, 50) },
    required: ['q'],
    cacheSeconds: 3600,
    forward: (q, env) => {
      const legacy = env.NAVER_API_STYLE === 'legacy'
      const u = new URL(env.NAVER_NEWS_URL || (legacy ? NAVER_LEGACY_NEWS : NAVER_HUB_NEWS))
      u.searchParams.set('query', q.get('q')!)
      u.searchParams.set('display', q.get('display') ?? '20')
      u.searchParams.set('sort', 'sim')
      const headers: Record<string, string> = legacy
        ? { 'X-Naver-Client-Id': env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET }
        : { 'X-NCP-APIGW-API-KEY-ID': env.NAVER_CLIENT_ID, 'X-NCP-APIGW-API-KEY': env.NAVER_CLIENT_SECRET }
      return new Request(u.toString(), { headers })
    },
  },
}

// ── 호출 제한 (기기 ID별, 분 단위 고정 창) ──
// 워커 인스턴스 메모리 기반이라 인스턴스가 여러 개면 느슨해진다. 남용이 보이면 플랫폼 Rate Limiting으로 교체.
const buckets = new Map<string, { windowStart: number; count: number }>()

export function allow(deviceId: string, limit: number, nowMs: number): boolean {
  const windowStart = Math.floor(nowMs / 60_000) * 60_000
  const b = buckets.get(deviceId)
  if (!b || b.windowStart !== windowStart) {
    buckets.set(deviceId, { windowStart, count: 1 })
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.windowStart !== windowStart) buckets.delete(k)
    }
    return true
  }
  b.count++
  return b.count <= limit
}

export function resetRateLimit(): void {
  buckets.clear()
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Device-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

/** Cloudflare Cache API 중 쓰는 부분 (테스트에서는 가짜로 바꾼다) */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

/** 캐시 키: 경로 + 정렬한 파라미터. 기기 ID·출처는 넣지 않는다 (모든 사용자가 공유) */
function cacheKey(url: URL): Request {
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
  const qs = new URLSearchParams(params).toString()
  return new Request(`https://relay-cache.internal${url.pathname}?${qs}`)
}

export async function handle(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
  nowMs = Date.now(),
  cache?: EdgeCache,
): Promise<Response> {
  const origin = request.headers.get('Origin') ?? ''
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  if (!allowed.includes(origin)) return json(403, { error: 'origin_not_allowed' })
  const cors = corsHeaders(origin)

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' }, cors)

  const url = new URL(request.url)
  const route = ROUTES[url.pathname]
  if (!route) return json(404, { error: 'not_found' }, cors)

  // 허용된 파라미터만, 형식 검사
  for (const key of url.searchParams.keys()) {
    if (!Object.hasOwn(route.params, key)) return json(400, { error: 'param_not_allowed', param: key }, cors)
  }
  for (const [key, check] of Object.entries(route.params)) {
    const v = url.searchParams.get(key)
    if (v === null) {
      if (route.required.includes(key)) return json(400, { error: 'param_required', param: key }, cors)
      continue
    }
    if (!check(v)) return json(400, { error: 'param_invalid', param: key }, cors)
  }

  const deviceId = request.headers.get('X-Device-Id') ?? ''
  if (!/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) return json(400, { error: 'device_id_required' }, cors)

  const respond = (body: BodyInit | null, contentType: string, hit: boolean) => {
    const headers = new Headers(cors)
    headers.set('content-type', contentType)
    headers.set('cache-control', 'no-store')
    headers.set('x-relay-cache', hit ? 'hit' : 'miss')
    return new Response(body, { status: 200, headers })
  }

  // 캐시에 있으면 외부 API를 부르지 않는다 (호출 제한에도 세지 않음)
  const key = cacheKey(url)
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined)
    if (hit) return respond(hit.body, hit.headers.get('content-type') ?? 'application/octet-stream', true)
  }

  const limit = Number(env.RATE_PER_MINUTE)
  if (!allow(deviceId, Number.isFinite(limit) && limit > 0 ? limit : 30, nowMs)) return json(429, { error: 'rate_limited' }, { ...cors, 'Retry-After': '60' })

  let upstream: Response
  try {
    upstream = await fetcher(route.forward(url.searchParams, env))
  } catch {
    return json(502, { error: 'upstream_unreachable' }, cors)
  }
  // 업스트림 오류 본문은 넘기지 않는다 (요청 주소의 키가 오류 메시지에 들어 있을 수 있음)
  if (!upstream.ok) return json(upstream.status === 429 ? 429 : 502, { error: upstream.status === 429 ? 'upstream_rate_limited' : 'upstream_error' }, cors)
  // 정상 응답 본문은 그대로, 헤더는 필요한 것만
  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
  const body = await upstream.arrayBuffer()
  if (cache) {
    const stored = new Response(body.slice(0), {
      headers: { 'content-type': contentType, 'cache-control': `public, max-age=${route.cacheSeconds}` },
    })
    await cache.put(key, stored).catch(() => undefined)
  }
  return respond(body, contentType, false)
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const edge = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default
    return handle(request, env, fetch, Date.now(), edge)
  },
}
