import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// GitHub Pages처럼 하위 경로에 배포할 때 BASE_PATH=/저장소이름/ 으로 빌드한다
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  resolve: {
    alias: {
      // 처리 엔진은 packages/engine 소스를 그대로 번들한다 (빌드 단계 없음).
      '@suhaengcut/engine-config': fromRoot('../packages/engine/src/config.ts'),
      '@suhaengcut/engine': fromRoot('../packages/engine/src/index.ts'),
      // 데모 모드 전용: 엔진 테스트와 같은 가짜 API 응답
      '@suhaengcut/engine-fixtures': fromRoot('../packages/engine/test/fixtures.ts'),
    },
  },
  server: {
    fs: { allow: [fromRoot('..')] },
  },
  worker: { format: 'es' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '수행평가 리서치',
        short_name: '리서치',
        description: '탐구 주제로 논문·뉴스를 찾고 내 문장의 근거를 확인하는 도구',
        lang: 'ko',
        display: 'standalone',
        start_url: base,
        scope: base,
        background_color: '#f6f5f1',
        theme_color: '#f6f5f1',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        // 사전 파일(형태소·단서어)이 커질 수 있어 상한을 넉넉히
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      },
    }),
  ],
})
