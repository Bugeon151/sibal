import { defineConfig } from '@playwright/test'

// 실제 배포 사이트(또는 E2E_URL)를 진짜 브라우저로 쓰는 검증. 실제 OpenAlex를 부르므로 느리고 결과가 바뀔 수 있다.
// 실행: npx playwright test -c e2e   (E2E_URL=http://localhost:4173/sibal/ 로 로컬 미리보기도 가능)
export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? 'https://bugeon151.github.io/sibal/',
    viewport: { width: 820, height: 1180 },
  },
})
