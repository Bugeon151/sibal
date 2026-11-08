// F6 holdout v1: v0 오류로 규칙을 고친 뒤 새로 만든 세트. 이 세트를 보고 규칙을 고치지 않는다.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { formatReport, runF6, type F6Set } from './runF6'

const set = JSON.parse(readFileSync(new URL('./f6-holdout-v1.json', import.meta.url), 'utf8')) as F6Set

it('F6 holdout v1', () => {
  const r = runF6(set)
  console.log(`\n[holdout v1] ${formatReport(r)}\n`)
  const ko = runF6({ topics: set.topics.filter((t) => !t.id.startsWith('en-')) })
  const en = runF6({ topics: set.topics.filter((t) => t.id.startsWith('en-')) })
  console.log(`[holdout v1 한국어 논문] 정확도 ${(ko.accuracy * 100).toFixed(1)}% · 지지 정밀도 ${(ko.supportedPrecision * 100).toFixed(1)}% · [영어 논문] 정확도 ${(en.accuracy * 100).toFixed(1)}%\n`)
  expect(r.total).toBeGreaterThan(0)
})
