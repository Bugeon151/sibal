// F6 판정 세트 회귀 테스트. 점수가 기준 아래로 떨어지면 실패한다.
// 기준값(FLOOR)은 개선할 때마다 올린다. 결과 표는 콘솔에 출력된다.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { formatReport, runF6, type F6Set } from './runF6'

const set = JSON.parse(readFileSync(new URL('./f6-set.json', import.meta.url), 'utf8')) as F6Set

const FLOOR = { accuracy: 0.9, unsupportedRecall: 0.9 } // 2026-11-08: 94.1% / 92.3%

it('F6 판정 세트', () => {
  const r = runF6(set)
  console.log(`\n${formatReport(r)}\n`)
  expect(r.accuracy).toBeGreaterThanOrEqual(FLOOR.accuracy)
  expect(r.unsupportedRecall).toBeGreaterThanOrEqual(FLOOR.unsupportedRecall)
})
