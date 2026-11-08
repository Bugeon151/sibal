import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { engine } from './engine/client'
import { clearRecentList, markDataVersion, needsDataReset } from './lib/storage'
import './styles.css'

// 이전 버전(데모)에서 저장한 기록·캐시는 한 번 비운다. 데모의 가짜 논문이 실제 검색 결과처럼 다시 열리지 않게.
if (needsDataReset()) {
  clearRecentList()
  engine
    .clearAll()
    .catch(() => undefined)
    .finally(markDataVersion)
}

// 새 버전이 배포되면 서비스 워커가 바뀌는 순간 한 번 새로고침해서 옛 화면이 남지 않게 한다
if ('serviceWorker' in navigator) {
  let reloaded = false
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return
    reloaded = true
    location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
