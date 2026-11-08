// 결과 화면의 링크를 실제로 열어 본다. live.spec.ts가 남긴 report/topic-*.json을 읽는다.
// "없는 논문"(DOI Not Found, 404)이 있으면 실패. 출판사 봇 차단(403)은 실제 브라우저로 다시 열어 확인한다.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const REPORT_DIR = new URL('./report/', import.meta.url)
type Link = { label: string; href: string }

function collect(): { topic: string; title: string; link: Link }[] {
  if (!existsSync(REPORT_DIR)) return []
  return readdirSync(REPORT_DIR)
    .filter((f) => f.startsWith('topic-'))
    .flatMap((f) => {
      const r = JSON.parse(readFileSync(new URL(f, REPORT_DIR), 'utf8')) as { topic: string; papers: { title: string; links: Link[] }[] }
      return r.papers.flatMap((p) => p.links.filter((l) => !l.href.includes('scholar.google')).map((link) => ({ topic: r.topic, title: p.title, link })))
    })
}

test('결과의 모든 논문 링크가 실제로 열린다', async ({ browser, request }) => {
  test.setTimeout(900_000)
  const items = collect()
  test.skip(items.length === 0, 'live.spec.ts를 먼저 실행해야 한다')
  const seen = new Map<string, { status: number | string; final: string; note: string }>()
  const page = await browser.newPage()
  for (const { link } of items) {
    if (seen.has(link.href)) continue
    let status: number | string = 'error'
    let final = ''
    let note = ''
    try {
      const res = await request.get(link.href, { maxRedirects: 10, timeout: 30_000, headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' } })
      status = res.status()
      final = res.url()
      const body = res.headers()['content-type']?.includes('text/html') ? (await res.text()).slice(0, 20_000) : ''
      if (/DOI Not Found|DOI NOT FOUND|This DOI cannot be found/i.test(body)) note = 'DOI 미등록'
    } catch (e) {
      status = 'error'
      note = String(e).slice(0, 80)
    }
    // 봇 차단·오류면 실제 브라우저로 다시 연다
    if (status === 'error' || (typeof status === 'number' && status >= 400 && note === '')) {
      try {
        const r = await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        const title = await page.title()
        const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 3000)
        status = r?.status() ?? status
        final = page.url()
        if (/DOI Not Found/i.test(title + text)) note = 'DOI 미등록'
        else if (typeof status === 'number' && status >= 400) note = /cloudflare|just a moment|captcha|verify you are human|access denied/i.test(title + text) ? '봇 차단(사람은 열림)' : note || '열리지 않음'
      } catch (e) {
        note = note || String(e).slice(0, 80)
      }
    }
    seen.set(link.href, { status, final, note })
  }
  const rows = items.map((i) => ({ ...i, ...seen.get(i.link.href)! }))
  writeFileSync(new URL('links.json', REPORT_DIR), JSON.stringify(rows, null, 2))
  const broken = rows.filter((r) => r.note === 'DOI 미등록' || r.note === '열리지 않음' || r.status === 'error')
  console.log(`링크 ${seen.size}개 확인, 문제 ${broken.length}개`)
  for (const b of broken) console.log(`  ✗ [${b.note || b.status}] ${b.link.label} ${b.link.href}  (${b.title.slice(0, 60)})`)
  expect(broken, '열리지 않는 링크').toEqual([])
})
