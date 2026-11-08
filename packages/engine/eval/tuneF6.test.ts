// 임계값 격자 탐색. 결과만 출력하고 config는 바꾸지 않는다 (작은 세트에 과적합 주의).
// 실행: npm run eval:f6
import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { runF6, type F6Set } from './runF6'

const set = JSON.parse(readFileSync(new URL('./f6-set.json', import.meta.url), 'utf8')) as F6Set

it('F6 임계값 격자 탐색', () => {
  const rows: { noEvidenceBelow: number; supportAtLeast: number; acc: number; recall: number; precision: number }[] = []
  for (let lo = 0.25; lo <= 0.55 + 1e-9; lo += 0.05) {
    for (let hi = lo + 0.1; hi <= 0.8 + 1e-9; hi += 0.05) {
      const r = runF6(set, { noEvidenceBelow: lo, supportAtLeast: hi })
      rows.push({ noEvidenceBelow: +lo.toFixed(2), supportAtLeast: +hi.toFixed(2), acc: r.accuracy, recall: r.unsupportedRecall, precision: r.supportedPrecision })
    }
  }
  rows.sort((a, b) => b.acc - a.acc || b.precision - a.precision)
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6)
  console.log('\n하한  지지기준  정확도  미지지탐지  지지정밀도')
  for (const r of rows.slice(0, 10)) console.log(`${r.noEvidenceBelow.toFixed(2)}  ${r.supportAtLeast.toFixed(2)}     ${pct(r.acc)}  ${pct(r.recall)}    ${pct(r.precision)}`)
})
