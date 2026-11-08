// 사용법: npx tsx packages/engine/scripts/build-dictionary.ts <KCI XML 폴더> [최소 등장 수=3]
// KCI 검색 응답(XML)을 폴더에 모아 두고 실행하면 src/lexicon/data/generated.json을 다시 만든다.
// 응답 수집은 중계 함수 또는 KCI 키로 직접 받는다 (교과 주제 키워드 목록으로 반복 검색).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildKoEn } from '../src/lexicon/build'
import { parseKciXml } from '../src/sources/kci'

const [dir, min = '3'] = process.argv.slice(2)
if (!dir) {
  console.error('KCI XML 폴더를 지정하세요.')
  process.exit(1)
}
const files = readdirSync(dir).filter((f) => f.endsWith('.xml'))
const papers = files.flatMap((f) => parseKciXml(readFileSync(join(dir, f), 'utf8')).papers)
const koEn = buildKoEn(papers, Number(min))
const out = new URL('../src/lexicon/data/generated.json', import.meta.url)
writeFileSync(out, `${JSON.stringify({ note: `scripts/build-dictionary.ts가 만든 파일. 직접 고치지 말 것. 논문 ${papers.length}편, ${new Date().toISOString().slice(0, 10)}`, synonyms: [], koEn }, null, 2)}\n`)
console.log(`논문 ${papers.length}편 → 한영 대응 ${Object.keys(koEn).length}개 → ${fileURLToPath(out)}`)
