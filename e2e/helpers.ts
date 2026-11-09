import { expect, type Page } from '@playwright/test'

// 데모 시절 가짜 자료의 흔적. 실제 결과에 나오면 안 된다.
export const FAKE_MARKERS = ['example.org', 'demo.relay.invalid', 'doi.org/10.2000/', '10.1000/kci', 'relay.test']

export type PaperInfo = { title: string; text: string; links: { label: string; href: string }[] }

export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  return errors
}

/** 시작 → 질문 → 검색까지 학생이 하는 순서대로 진행한다 */
// 화면 문구가 바뀌어도 동작하도록 버튼은 여러 이름을 허용한다
const NEXT_BUTTON = /^(다음|질문 고르러 가기)/
const SEARCH_BUTTON = /^(자료 찾기|자료 보러 가기|이걸로 찾기|자료 찾으러 가기)/

/** 앱 첫 화면 열기 (서비스 워커가 뒤에서 파일을 받느라 networkidle이 오지 않으므로 입력 칸이 뜰 때까지 기다린다) */
export async function openApp(page: Page): Promise<void> {
  await page.goto('./', { waitUntil: 'load' })
  await page.getByPlaceholder(/스마트폰/).waitFor({ timeout: 30_000 })
}

/** 시작 → 질문 → 검색까지 학생이 하는 순서대로 진행한다 */
export async function search(page: Page, topic: string, mode: 'ai' | 'search_only' = 'ai'): Promise<void> {
  await openApp(page)
  await page.getByPlaceholder(/스마트폰/).fill(topic)
  await page.getByText(mode === 'ai' ? '네, 써도 돼요' : '아니요, 검색만').click()
  await page.getByRole('button', { name: NEXT_BUTTON }).click()
  await page.getByRole('button', { name: SEARCH_BUTTON }).click({ timeout: 15_000 })
  await page.waitForSelector('article.card.paper, .empty, [role=alert]', { timeout: 90_000 })
}

/** 결과의 논문 카드 (초록을 펼쳐 본문까지) */
export async function readPapers(page: Page): Promise<PaperInfo[]> {
  const cards = page.locator('article.card.paper')
  const n = await cards.count()
  const out: PaperInfo[] = []
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i)
    const toggle = card.getByRole('button', { name: /초록 보기/ })
    if (await toggle.count()) await toggle.click()
    out.push({
      title: (await card.locator('.card-title').innerText()).replace(/\s*↗\s*$/, '').trim(),
      text: (await card.innerText()).toLowerCase(),
      links: await card.locator('a').evaluateAll((as) => as.map((a) => ({ label: (a.textContent ?? '').trim(), href: (a as HTMLAnchorElement).href }))),
    })
  }
  return out
}

export async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click()
  const panel = page.locator('[role=tabpanel]:not([hidden])')
  await expect(panel).toBeVisible()
  return panel
}
