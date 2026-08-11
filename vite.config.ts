import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 部署：仓库名为 <repo-name>，base 需设为 '/<repo-name>/'
  // 若部署到自定义域名或用户名.github.io 根路径，则改为 './'
  base: './',
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // 拆分大型第三方依赖到独立 chunk，减小初始 bundle 体积
        // 注意：xlsx / html2canvas 在源码中通过动态 import() 加载，
        // Rollup 会自动将其拆为懒加载 chunk，无需在此显式声明。
        manualChunks(id) {
          if (id.includes('node_modules')) {
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
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
})
