/**
 * 运行期异步加载远程字体样式（Orbitron / JetBrains Mono / Inter）。
 *
 * 为什么不在 index.html 里直接放 <link rel="stylesheet">：
 * - 远程样式表是渲染阻塞资源。离线（现场无网）或网络受限（Google Fonts 被墙）时，
 *   浏览器会一直等到连接超时才开始首屏渲染，和"离线优先/现场可用"的定位冲突。
 * - 放到首帧之后注入：字体加载失败只会回落到系统字体，不影响页面可用性。
 *
 * 字体本身仍然远程托管（如需彻底离线可用，可后续换成本地托管，见 review-notes/REVIEW.md P1-14）。
 */

const FONT_STYLESHEET_HREF =
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap'

const INJECT_TIMEOUT_MS = 1500

let started = false

export function loadWebFonts(): void {
  if (started || typeof document === 'undefined' || typeof window === 'undefined') return
  started = true

  const inject = () => {
    if (document.querySelector('link[data-web-fonts="true"]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_STYLESHEET_HREF
    link.dataset.webFonts = 'true'
    document.head.appendChild(link)
  }

  const idleCallback = (
    window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    }
  ).requestIdleCallback

  if (typeof idleCallback === 'function') {
    idleCallback(inject, { timeout: INJECT_TIMEOUT_MS })
    return
  }

  window.setTimeout(inject, 300)
}
