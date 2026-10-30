import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { loadWebFonts } from './utils/loadWebFonts'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// 首帧渲染之后再注入远程字体样式，避免离线/网络受限时阻塞首屏。
loadWebFonts()
