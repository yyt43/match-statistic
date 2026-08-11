# 比赛战绩统计应用 10.0

用于管理瑞士轮赛制（同时支持单败淘汰制）比赛的纯前端单页应用。适用于棋类、卡牌、电子竞技等各类线下/线上赛事，提供选手管理、自动配对、战绩录入、实时排名与导出功能。

## 核心特性

- **双赛制支持**：瑞士轮（含上下匹配平衡机制）+ 单败淘汰制
- **多局制**：BO1 / BO3 / BO5 / BO7，且每轮可独立设置赛制
- **多小组**：一次赛事可创建多个小组，独立推进、统一管理
- **精细化配对**：同战绩组对折优先、组内穷举回溯、下移组与下一组 1V1 匹配
- **多级 tiebreaker**：胜率 → 对手胜率 → 对手对手胜率 / 局胜率 → 对手局胜率 → 积分
- **本地持久化**：localStorage 双 key 主备机制，4MB 容量预警，旧格式自动迁移
- **数据导入/导出**：JSON 文件导入导出、Excel 导出、图片导出
- **纯前端**：无需后端服务，所有数据存储在浏览器本地

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| 路由 | React Router 7 |
| 图标 | Lucide React |
| 导出 | html2canvas（图片）、xlsx（Excel） |
| 数据存储 | localStorage（无后端） |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 类型检查
npm run check

# ESLint 检查
npm run lint
```

## 项目结构

```
src/
├── types/index.ts              # 类型定义（Player/Match/TournamentGroup/Competition）
├── store/
│   └── useTournamentStore.ts   # Zustand 全局状态（赛事/小组/选手/对阵）
├── utils/
│   ├── swissPairing.ts         # 瑞士轮 + 单败淘汰配对算法（核心）
│   ├── ranking.ts              # 排名 / 淘汰头衔 / 比赛历史工具
│   ├── storage.ts              # localStorage 持久化（主备 + 迁移）
│   ├── storageStatus.ts        # 存储状态发布订阅
│   ├── excelExport.ts          # Excel 导出
│   ├── imageExport.ts          # 图片导出（html2canvas）
│   └── fileStorage.ts          # JSON 文件导入/导出
├── components/                 # UI 组件（15 个）
│   ├── Header.tsx              # 顶部标题栏
│   ├── PlayerRanking.tsx       # 选手排名面板
│   ├── MatchList.tsx           # 对阵列表（含编辑/测试模式）
│   ├── ControlPanel.tsx        # 操作控制面板
│   ├── RoundTabs.tsx           # 轮次切换标签
│   ├── ImageExportModal.tsx    # 图片导出弹窗
│   ├── ExcelExportModal.tsx    # Excel 导出弹窗
│   ├── PlayerPreviewModal.tsx  # 选手预览弹窗
│   ├── HelpPage.tsx            # 帮助说明
│   ├── ConfirmDialog.tsx       # 确认对话框
│   ├── StorageBanner.tsx       # 存储状态横幅
│   ├── MatchImageView.tsx      # 对阵图截图视图
│   ├── RankingImageView.tsx    # 排名图截图视图
│   ├── Empty.tsx               # 空状态
│   └── ErrorBoundary.tsx       # 错误边界
├── hooks/
│   ├── useTheme.ts             # 主题
│   └── useEscapeClose.ts       # ESC 关闭弹窗
├── lib/utils.ts                # 通用工具（clsx + tailwind-merge）
├── pages/Home.tsx              # 主页面（三栏布局）
├── App.tsx                     # 路由入口
├── main.tsx                    # 应用入口
└── index.css                   # 全局样式
```

## 主要功能

### 1. 选手管理
- 添加 / 编辑 / 删除 / 批量导入选手
- 弃赛标记（dropped）
- 选手预览（跨小组统一查看）

### 2. 赛事管理
- 创建赛事，支持多个小组
- 小组数量、选手数、轮次数可配置
- 赛制（瑞士轮 / 单败淘汰）与局制（BO1/3/5/7）可配置
- 每轮独立赛制设置

### 3. 对阵生成
- **瑞士轮**：第一轮随机；第二轮起按战绩分组，同组对折优先 → 组内穷举 → 下移递归；上下匹配次数与优先级标记平衡
- **单败淘汰**：晋级者自动进入下一轮，奇数时轮空
- 轮空自动计 1 胜

### 4. 战绩录入
- 单场结果录入（胜/负/双负）
- 单败淘汰自动标记淘汰
- 支持撤回上一轮
- 测试模式：随机批量生成结果

### 5. 排名统计
- 多级 tiebreaker 排名
- 对手胜率两轮迭代计算
- 排名变化指示（previousRank）
- 单败淘汰头衔（冠军/亚军/四强/八强...）

### 6. 数据导入导出
- JSON 文件导入/导出（完整赛事数据）
- Excel 导出（排名表 / 对阵表）
- 图片导出（排名图 / 对阵图，支持导出所有小组）

### 7. 持久化与容错
- localStorage 主 key + backup key 双写
- 主 key 损坏时自动从备份恢复
- 旧版本数据自动迁移
- 存储容量预警（4MB 阈值）

## 设计风格

- **主色调**：深靛蓝 (`#1e1b4b`) + 金色 (`#fbbf24`) 点缀
- **辅助色**：翡翠绿（胜利）、玫红（失败）、灰蓝（中性）
- **字体**：标题 Orbitron、正文 Inter、数字 JetBrains Mono
- **布局**：桌面三栏（排名 | 对阵 | 操作），平板两栏，移动单栏

## 测试

项目包含测试辅助脚本 `test-reset.cjs` / `test-reset.mjs`，用于重置本地存储数据以便进行手动测试。
