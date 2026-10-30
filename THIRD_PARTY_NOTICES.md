# 第三方软件许可

本项目使用以下主要开源依赖：

| 软件 | 许可证 | 用途 |
|------|--------|------|
| React / React DOM | MIT | UI 框架 |
| React Router | MIT | 页面路由 |
| Zustand | MIT | 状态管理 |
| Vite | MIT | 构建与开发服务器 |
| Tailwind CSS | MIT | 样式系统 |
| Lucide React | ISC | 图标 |
| SheetJS Community Edition | Apache-2.0 | Excel / CSV / XLS 导入导出 |
| html2canvas | MIT | PNG 图片导出 |
| Workbox / vite-plugin-pwa | MIT | PWA 和离线缓存 |
| Vitest | MIT | 单元测试 |
| Playwright Core | Apache-2.0 | 浏览器自动化测试 |

完整依赖和版本信息见 `package-lock.json`。各依赖仍受其自身许可证和版权声明约束。

## 已知供应链例外（需人工定期复核）

1. **SheetJS (xlsx)** 的依赖地址是 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`，不在 npm registry 上。因此 `npm audit`、Dependabot、dependency-review 都不会覆盖它，只依赖 `package-lock.json` 里的 integrity 校验。升级时必须手工改 `package.json` 里的 URL，并顺带核对官方发布说明。
2. **`overrides` 里的 `postcss-selector-parser: 7.1.6`** 是绕过某个上游解析问题（Tailwind 3 与新版 postcss-selector-parser 的兼容性）的固定版本，改动前请先确认 Tailwind 侧是否还依赖该行为。
3. **远程字体**：Orbitron / JetBrains Mono / Inter 通过 Google Fonts 加载（见 `src/utils/loadWebFonts.ts`）。离线或网络受限时自动回落系统字体，不影响功能；如需彻底自托管可替换为本地 woff2（见 `review-notes/REVIEW.md` P1-14）。
