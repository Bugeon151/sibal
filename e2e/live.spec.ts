// 배포 사이트 실사용 검증 (실제 브라우저 + 실제 OpenAlex).
// 결과 요약은 e2e/report/에 JSON으로 남긴다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { FAKE_MARKERS, openApp, openTab, readPapers, search, watchErrors, type PaperInfo } from './helpers'

const REPORT_DIR = new URL('./report/', import.meta.url)
mkdirSync(REPORT_DIR, { recursive: true })

// 학생이 넣을 법한 주제와, 그 주제에 맞는 논문이라면 제목·초록에 있어야 하는 말 (그룹마다 하나 이상)
const TOPICS: { topic: string; must: string[][] }[] = [
  { topic: '스마트폰 사용이 청소년 수면에 미치는 영향', must: [['smartphone', 'mobile phone', 'phone', 'screen'], ['sleep']] },
  { topic: '기후변화가 해수면 상승에 미치는 영향', must: [['sea level', 'sea-level']] },
  { topic: '인공지능이 일자리에 미치는 영향', must: [['artificial intelligence', ' ai ', 'automation'], ['employment', 'job', 'labor', 'labour', 'work']] },
  { topic: '카페인 섭취와 청소년 수면', must: [['caffeine'], ['sleep']] },
  { topic: '최저임금 인상과 고용', must: [['minimum wage'], ['employment', 'job', 'labor', 'labour']] },
  { topic: '음악이 집중력에 미치는 영향', must: [['music'], ['attention', 'concentration', 'focus']] },
  { topic: '탄소중립 정책', must: [['carbon neutral', 'net zero', 'net-zero', 'carbon neutrality', 'decarboni']] },
  { topic: '유전자 가위 기술의 윤리', must: [['crispr', 'genome editing', 'gene editing'], ['ethic']] },
  { topic: '플라스틱 쓰레기와 해양 생태계', must: [['plastic'], ['marine', 'ocean', 'sea']] },
  { topic: 'SNS가 청소년 자존감에 미치는 영향', must: [['social media', 'sns', 'instagram', 'facebook'], ['self-esteem', 'self esteem']] },
  { topic: '미세먼지와 청소년 천식', must: [['particulate', 'pm2.5', 'pm 2.5', 'air pollution', 'fine dust'], ['asthma']] },
  { topic: '게임 중독과 학업 성적', must: [['game', 'gaming'], ['academic', 'grade', 'school performance', 'achievement']] },
]

const onTopic = (p: PaperInfo, must: string[][]) => must.every((group) => group.some((w) => p.text.includes(w) || p.title.toLowerCase().includes(w)))

test.describe('주제별 실제 검색', () => {
  for (const { topic, must } of TOPICS) {
    test(topic, async ({ page }) => {
      const errors = watchErrors(page)
      await search(page, topic)
      const papers = await readPapers(page)
      const off = papers.filter((p) => !onTopic(p, must)).map((p) => p.title)
      const links = papers.flatMap((p) => p.links)
      writeFileSync(
        new URL(`topic-${TOPICS.findIndex((t) => t.topic === topic)}.json`, REPORT_DIR),
        JSON.stringify({ topic, papers: papers.map((p) => ({ title: p.title, onTopic: onTopic(p, must), links: p.links })), off }, null, 2),
      )
      expect(papers.length, '논문이 1편 이상').toBeGreaterThan(0)
      for (const l of links) for (const m of FAKE_MARKERS) expect(l.href, `가짜 자료 흔적: ${l.label}`).not.toContain(m)
      for (const p of papers) expect(p.links.some((l) => l.label.startsWith('논문 보기')), `논문 보기 링크: ${p.title}`).toBe(true)
      expect(errors, '화면 오류 없음').toEqual([])
      // 주제에서 벗어난 논문이 절반을 넘으면 실패
      expect(off.length, `주제에서 벗어난 논문: ${off.join(' / ')}`).toBeLessThanOrEqual(Math.floor(papers.length / 2))
    })
  }
})

test('결과 탭 기능 (핵심 문장·비교표·문장 검사·AI 프롬프트·사용 내역·참고문헌)', async ({ page }) => {
  const errors = watchErrors(page)
  await search(page, '스마트폰 사용이 청소년 수면에 미치는 영향')
  const papers = await readPapers(page)

  // 핵심 문장: 원문 그대로여야 한다 (초록 안에 그대로 있음)
  let panel = await openTab(page, '핵심 문장')
  const keyButtons = panel.getByRole('button')
  expect(await keyButtons.count()).toBeGreaterThan(0)

  // 비교표: 표가 있거나 "비교할 개념이 없다"는 안내
  panel = await openTab(page, '비교표')
  await expect(panel).not.toBeEmpty()

  // 내 문장 검사
  panel = await openTab(page, '내 문장 검사')
  await panel.locator('textarea').fill('스마트폰 사용 시간이 길수록 청소년의 수면의 질이 낮아진다. 스마트폰 사용은 청소년의 키 성장을 방해한다.')
  await panel.getByRole('button', { name: '근거 확인하기' }).click()
  await expect(panel).toContainText(/지지|근거|찾지 못/, { timeout: 30_000 })
  const checkText = await panel.innerText()

  // AI 프롬프트: 대필 요청이 없어야 한다
  panel = await openTab(page, 'AI 프롬프트')
  await expect(panel).toContainText('대신 만들어 주지 마', { timeout: 15_000 })
  const prompt = await panel.innerText()
  expect(prompt).not.toMatch(/써\s*줘|작성해\s*줘|완성해\s*줘/)

  // AI 사용 내역: 고르고 만들면 프롬프트 원문이 들어간 제출용 텍스트
  panel = await openTab(page, 'AI 사용 내역')
  await panel.getByText('ChatGPT', { exact: true }).click()
  await panel.getByRole('button', { name: '사용 내역 만들기' }).click()
  await expect(panel).toContainText('[입력한 프롬프트 원문]', { timeout: 15_000 })
  await expect(panel).toContainText('AI를 사용하지 않음')

  // 참고문헌: 논문 수만큼
  panel = await openTab(page, '참고문헌')
  await expect(panel).toContainText(papers[0]!.title.slice(0, 40), { timeout: 15_000 })
  const refs = await panel.innerText()
  for (const p of papers) expect(refs).toContain(p.title.slice(0, 40))

  writeFileSync(new URL('tabs.json', REPORT_DIR), JSON.stringify({ checkText, prompt: prompt.slice(0, 600) }, null, 2))
  expect(errors).toEqual([])
})

test('검색만 모드: AI 탭이 없다', async ({ page }) => {
  await search(page, '스마트폰 사용이 청소년 수면에 미치는 영향', 'search_only')
  // 탭 이름 앞의 아이콘(📚 등)은 디자인에 따라 바뀌므로 글자만 비교한다
  const tabs = (await page.getByRole('tab').allInnerTexts()).map((t) => t.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim())
  expect(tabs).not.toContain('AI 프롬프트')
  expect(tabs).not.toContain('AI 사용 내역')
  expect(tabs).toContain('내 문장 검사')
})

test('업데이트 전 데모 기록이 남아 있으면 지운다', async ({ page }) => {
  await openApp(page)
  // 옛 버전 상태 흉내: 데이터 버전 없음 + 최근 리서치 목록 + 데모 캐시
  await page.evaluate(async () => {
    localStorage.removeItem('sr.dataVersion')
    localStorage.setItem('sr.recent.v2', JSON.stringify([{ topic: '데모 주제', question: '데모 질문', keywords: ['데모'], at: new Date().toISOString() }]))
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('suhaengcut', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => {
        const tx = req.result.transaction('kv', 'readwrite')
        tx.objectStore('kv').put({ value: [{ title: 'FAKE', doi: '10.2000/oa.1' }], expiresAt: Date.now() + 1e9 }, 'cache:openalex:demo:2017')
        tx.oncomplete = () => resolve()
      }
    })
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const state = await page.evaluate(async () => {
    const keys = await new Promise<string[]>((resolve) => {
      const req = indexedDB.open('suhaengcut', 1)
      req.onsuccess = () => {
        const r = req.result.transaction('kv', 'readonly').objectStore('kv').getAllKeys()
        r.onsuccess = () => resolve(r.result as string[])
      }
    })
    return { recent: localStorage.getItem('sr.recent.v2'), version: localStorage.getItem('sr.dataVersion'), keys }
  })
  expect(state.recent).toBeNull()
  expect(state.version).not.toBeNull()
  expect(state.keys).not.toContain('cache:openalex:demo:2017')
})

test('휴대폰 화면(360px)에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await search(page, '스마트폰 사용이 청소년 수면에 미치는 영향')
  for (const tab of ['자료', '핵심 문장', '비교표', '내 문장 검사', 'AI 프롬프트', '참고문헌']) {
    await page.getByRole('tab', { name: tab }).click()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${tab} 탭 가로 넘침(px)`).toBeLessThanOrEqual(1)
  }
})
