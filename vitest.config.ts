import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // e2e/는 Playwright(실제 브라우저)용이라 vitest에서 뺀다
    exclude: ['**/node_modules/**', 'e2e/**', 'frontend/**'],
  },
})
