import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa';

// 生产构建注入 CSP。项目本身不向外部发送数据，只额外允许远程字体样式/字体文件；
// 开发服务器不注入，避免和 Vite/React Refresh 的内联脚本冲突。
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

function injectCspPlugin() {
  return {
    name: 'inject-csp-meta',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages 部署：仓库名为 <repo-name>，base 需设为 '/<repo-name>/'
  // 若部署到自定义域名或用户名.github.io 根路径，则改为 './'
  base: './',
  build: {
    // 本项目发布到公共的 GitHub Pages，sourcemap 会把完整源码暴露给任何访问者，
    // 因此生产构建默认不生成；需要排查线上问题时用 VITE_SOURCEMAP=1 临时开启。
    sourcemap: process.env.VITE_SOURCEMAP === '1',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // 拆分大型第三方依赖到独立 chunk，减小初始 bundle 体积。
        // Excel 导入和截图导出按功能维度拆分，避免在首屏加载时把大体积库混入主包。
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) {
              return 'xlsx-vendor';
            }
            if (id.includes('html2canvas')) {
              return 'html2canvas-vendor';
            }
            if (id.includes('react-router-dom') || id.includes('/react/') || id.includes('/react-dom/')) {
              return 'react-vendor';
            }
            if (id.includes('zustand')) {
              return 'state-vendor';
            }
            if (id.includes('lucide-react') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'ui-vendor';
            }
          }
        },
      },
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/xlsx')) return 'xlsx-vendor';
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        // 只在开发服务器注入组件定位属性，生产包不携带源码路径。
        plugins: command === 'serve' ? ['react-dev-locator'] : [],
      },
    }),
    tsconfigPaths(),
    injectCspPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      includeAssets: [
        'favicon.svg',
        'site.webmanifest',
        'icons/apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
      ],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
}))
