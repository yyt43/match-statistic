# 比赛战绩统计应用 10.0

> 纯前端的瑞士轮 / 单败淘汰赛制比赛管理工具，适用于棋类、卡牌、电子竞技等线下/线上赛事。
> 提供选手管理、自动配对、战绩录入、实时排名与多格式导出，所有数据存储在浏览器本地，无需后端。

## 核心特性

- **双赛制**：瑞士轮（含上下匹配平衡机制）+ 单败淘汰制
- **多局制**：BO1 / BO3 / BO5 / BO7，且每轮可独立设置赛制
- **多小组**：一次赛事可创建多个小组，独立推进、统一管理
- **精细化配对**：同战绩组对折优先 → 组内穷举回溯 → 下移组与下一组 1V1 匹配
- **多级 tiebreaker**：胜率 → 对手胜率 → 对手对手胜率 / 局胜率 → 对手局胜率 → 积分
- **本地持久化**：localStorage 双 key 主备机制，4MB 容量预警，旧格式自动迁移
- **自动快照备份**：每轮完赛时自动创建快照（保留最近 5 份），可在「备份管理」面板中恢复
- **数据导入/导出**：JSON 文件、Excel 表格、图片截图
- **对阵拖拽改序**：非编辑模式下可直接拖拽对阵卡片调整显示顺序
- **快捷操作**：Ctrl+Z 撤回上一轮、配对预览、统一确认弹窗
- **响应式 UI**：桌面三栏 / 平板两栏 / 移动单栏

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| 路由 | React Router 7（HashRouter） |
| 图标 | Lucide React |
| 导出 | html2canvas（图片）、xlsx（Excel） |
| 数据存储 | localStorage（无后端） |

## 快速开始

### 环境要求

- Node.js ≥ 18
- npm ≥ 9

### 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建生产版本到 dist/
npm run build

# 预览生产构建
npm run preview

# 类型检查
npm run check

# ESLint 检查
npm run lint

# 运行单元测试
npm test
```

## 项目结构

```
src/
├── types/index.ts              # 类型定义（Player/Match/TournamentGroup/Competition）
├── store/
│   └── useTournamentStore.ts   # Zustand 全局状态（赛事/小组/选手/对阵/快照）
├── utils/
│   ├── swissPairing.ts         # 瑞士轮 + 单败淘汰配对算法（核心）
│   ├── swissPairing.test.ts    # 配对算法单元测试（Vitest）
│   ├── ranking.ts              # 排名 / 淘汰头衔 / 比赛历史工具
│   ├── storage.ts              # localStorage 持久化（主备 + 迁移 + 压缩）
│   ├── snapshot.ts             # 快照管理（自动备份 + 恢复 + 清理）
│   ├── storageStatus.ts        # 存储状态发布订阅
│   ├── excelExport.ts          # Excel 导出（动态加载 xlsx）
│   ├── imageExport.ts          # 图片导出（动态加载 html2canvas）
│   └── fileStorage.ts          # JSON 文件导入/导出
├── components/                 # UI 组件
│   ├── Header.tsx              # 顶部标题栏
│   ├── PlayerRanking.tsx       # 选手排名面板
│   ├── MatchList.tsx           # 对阵列表（含编辑/测试/拖拽改序）
│   ├── ControlPanel.tsx        # 操作控制面板
│   ├── RoundTabs.tsx           # 轮次切换标签
│   ├── BackupManager.tsx       # 备份管理面板（快照列表/恢复/删除）
│   ├── ImageExportModal.tsx    # 图片导出弹窗
│   ├── ExcelExportModal.tsx    # Excel 导出弹窗（含进度指示）
│   ├── PlayerPreviewModal.tsx  # 选手预览弹窗
│   ├── HelpPage.tsx            # 帮助说明
│   ├── ConfirmDialog.tsx       # 确认对话框（统一替代 window.confirm）
│   ├── StorageBanner.tsx       # 存储状态横幅
│   ├── MatchImageView.tsx      # 对阵图截图视图
│   ├── RankingImageView.tsx    # 排名图截图视图
│   └── ErrorBoundary.tsx       # 错误边界
├── hooks/
│   ├── useTheme.ts             # 主题
│   └── useEscapeClose.ts       # ESC 关闭弹窗
├── lib/utils.ts                # 通用工具（cn = clsx + tailwind-merge）
├── pages/Home.tsx              # 主页面（三栏布局 + Ctrl+Z 撤回 + 配对预览）
├── App.tsx                     # 路由入口
├── main.tsx                    # 应用入口
└── index.css                   # 全局样式
```

## 主要功能

### 选手管理
- 添加 / 编辑 / 删除 / 批量导入选手
- 弃赛标记
- 跨小组选手预览

### 赛事管理
- 创建赛事，支持多个小组
- 小组数量、选手数、轮次数、赛制、局制可配置
- 每轮独立赛制设置
- 单败淘汰自动计算总轮次（⌈log₂n⌉）

### 对阵生成
- **瑞士轮**：第一轮 Fisher-Yates 随机；第二轮起按战绩分组，同组对折优先 → 组内穷举 → 下移递归；上下匹配次数与优先级标记平衡
- **单败淘汰**：晋级者自动进入下一轮，奇数时轮空
- 轮空自动计 1 胜

### 战绩录入
- 单场结果录入（胜 / 负 / 双负）
- 单败淘汰自动标记淘汰
- 支持撤回上一轮（按钮 + Ctrl+Z 快捷键）
- 测试模式：随机批量生成结果

### 对阵管理
- 非编辑模式下可直接拖拽对阵卡片调整显示顺序
- 生成下一轮前展示配对预览与本轮摘要（双负/轮空/弃赛）
- 单败淘汰支持整轮对阵编辑与一键重排

### 排名统计
- 多级 tiebreaker 排名
- 对手胜率两轮迭代计算（Buchholz）
- 排名变化指示
- 单败淘汰头衔（冠军/亚军/四强/八强...）

### 数据导入导出
- **JSON**：完整赛事数据导入/导出，含格式校验
- **Excel**：排名表 / 对阵表，支持导出所有小组（导出时显示进度指示）
- **图片**：排名图 / 对阵图，支持导出所有小组

### 持久化与容错
- localStorage 主 key + backup key 双写（含压缩，节省 30-40% 空间）
- **自动快照**：每轮完赛时自动创建快照，保留最近 5 份，可在「备份管理」面板恢复
- 主 key 损坏时自动从备份恢复
- 旧版本数据自动迁移
- 存储容量预警（4MB 阈值）
- 全局错误边界，异常时仍可导出数据备份

## 部署到 GitHub Pages

项目已配置 GitHub Actions 自动部署（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）。

1. 将代码推送到 GitHub 仓库的 `main` 分支
2. 进入仓库 **Settings → Pages → Source**，选择 **GitHub Actions**
3. 等待 Actions 构建完成（约 1-2 分钟）
4. 访问 `https://用户名.github.io/仓库名/`

## 积分规则

| 结果 | 积分 | 胜场 | 负场 |
|------|------|------|------|
| 胜 | +1 | +1 | — |
| 负 | 0 | — | +1 |
| 双负 | 0 | — | +1（双方） |
| 轮空 | +1 | +1 | — |

> 注：「双负」用于记录双方均未完成比赛的情况，双方均计负场不计胜场，不产生积分。

## 设计风格

- **主色调**：深靛蓝 `#1e1b4b` + 金色 `#fbbf24` 点缀
- **辅助色**：翡翠绿（胜利/完成）、玫红（失败）、灰蓝（中性）
- **字体**：标题 Orbitron、正文 Inter、数字 JetBrains Mono
- **布局**：桌面三栏（排名 | 对阵 | 操作），平板两栏，移动单栏
