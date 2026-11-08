// F6 holdout: 튜닝에 쓰지 않는 세트. 일반화 성능을 정직하게 보기 위한 것이므로
// 이 세트의 틀린 사례를 보고 규칙을 고치면 다른 holdout을 새로 만들어야 한다.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { formatReport, runF6, type F6Set } from './runF6'

const set = JSON.parse(readFileSync(new URL('./f6-holdout.json', import.meta.url), 'utf8')) as F6Set

it('F6 holdout', () => {
  const r = runF6(set)
  console.log(`\n[holdout] ${formatReport(r)}\n`)
  const ko = runF6({ topics: set.topics.filter((t) => !t.id.startsWith('en-')) })
  const en = runF6({ topics: set.topics.filter((t) => t.id.startsWith('en-')) })
  console.log(`[holdout 한국어 논문] 정확도 ${(ko.accuracy * 100).toFixed(1)}% · [영어 논문] 정확도 ${(en.accuracy * 100).toFixed(1)}%\n`)
  expect(r.total).toBeGreaterThan(0)
})
