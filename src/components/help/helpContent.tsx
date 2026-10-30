import {
  ArrowLeftRight,
  Database,
  Download,
  Eye,
  FileUp,
  FlaskConical,
  GripVertical,
  History,
  Keyboard,
  Layers,
  Shield,
  ShieldCheck,
  Swords,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppLanguage } from '../../i18n/data';

/**
 * 帮助页文案。中文与英文是两份独立内容（第二套 i18n），
 * 因此每条内容都带稳定 id，由 helpContent.test.ts 保证两侧 id/顺序/数量一致。
 */
export interface HelpFeature {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
}

export interface HelpStep {
  id: string;
  title: string;
  items: string[];
}

export interface HelpRule {
  title: string;
  text: string;
}

export interface HelpFaq {
  question: string;
  answer: string;
}

export interface HelpShortcutGroup {
  title: string;
  items: Array<{
    keys: string;
    description: string;
  }>;
}

export interface HelpCopy {
  close: string;
  subtitle: string;
  features: string;
  featureItems: HelpFeature[];
  shortcuts: string;
  shortcutGroups: HelpShortcutGroup[];
  shortcutNote: string;
  quickStart: string;
  steps: HelpStep[];
  rules: string;
  swissRules: string;
  swissRuleItems: HelpRule[];
  swissRankingRules: string;
  swissRankingRuleItems: HelpRule[];
  eliminationRules: string;
  eliminationRuleItems: string[];
  storage: string;
  storageItems: string[];
  faq: string;
  faqItems: HelpFaq[];
  disclaimer: string;
  disclaimerItems: string[];
  links: string;
  github: string;
  bilibili: string;
  qq: string;
  qqHint: string;
  contact: string;
  footer: string;
}

export const HELP_CONTENT_ZH: HelpCopy = {
  close: '关闭帮助页面',
  subtitle: '专业比赛管理与成绩统计工具',
  features: '功能概览',
  featureItems: [
    { id: 'multi-group', icon: <Users className="w-5 h-5" />, title: '多小组管理', description: '支持 1-20 个小组独立配置和开赛；编号范围为 A01-Z99，缺失时可一键补齐且不覆盖已有编号。' },
    { id: 'player-overview', icon: <Eye className="w-5 h-5" />, title: '选手总览', description: '开赛前集中核对名单，自动检测重名和空小组，支持搜索与复制。' },
    { id: 'roster-management', icon: <UserCog className="w-5 h-5" />, title: '名单管理', description: '逐个修改选手，或从文本、Excel、CSV、TXT 批量导入。' },
    { id: 'player-profiles', icon: <UserCog className="w-5 h-5" />, title: '选手档案', description: '支持通用模板和诗意杯模板，分别维护选手编号、9 位 UID 和 QQ。' },
    { id: 'dual-format', icon: <Swords className="w-5 h-5" />, title: '双赛制支持', description: '支持瑞士轮和单败淘汰；单败淘汰默认按名单顺序生成完整签表，开赛前可调整并确认锁定。' },
    { id: 'result-import', icon: <FileUp className="w-5 h-5" />, title: '赛果导入', description: '导入腾讯文档 XLSX，按选手编号匹配比赛，逐场核验截图后写入结果。' },
    { id: 'bracket-edit', icon: <ArrowLeftRight className="w-5 h-5" />, title: '签表调整', description: '开赛前可随机重抽、交换签位或指定选手/轮空；确认后完整签表锁定，后续轮次只填入胜者。' },
    { id: 'live-rankings', icon: <Trophy className="w-5 h-5" />, title: '实时排名', description: '自动计算胜率、对手胜率、局胜率，并展示淘汰、弃赛和加赛状态。' },
    { id: 'event-types', icon: <Layers className="w-5 h-5" />, title: '赛事类型', description: '首页选择单阶段赛事、多阶段赛事（测试功能）或诗意杯 S3（专用）。单阶段沿用原有工作区，多阶段与 S3 额外记录赛段、晋级与固定签位。' },
    { id: 'stage-advancement', icon: <ShieldCheck className="w-5 h-5" />, title: '赛段晋级', description: '赛段打完后「计算晋级」得到预览，裁判确认才写入下游赛段；可回退。上游未确认时下游不能开赛，下游已开赛时上游赛果锁定。' },
    { id: 'export-tools', icon: <Download className="w-5 h-5" />, title: '导出工具', description: '排行榜、对阵表和总表可导出为 PNG 或 Excel，并包含选手编号与 UID；多阶段赛事的工作表名带赛段，并附「最终名次」「晋级记录」工作表，图片导出可选最终名次视图；赛事数据可导出为 JSON。' },
    { id: 'local-backup', icon: <Database className="w-5 h-5" />, title: '本地双备份', description: '主键与备份键双重保存；每轮完赛还会自动创建快照。' },
    { id: 'test-mode', icon: <FlaskConical className="w-5 h-5" />, title: '测试模式', description: '可随机生成当前轮或整场赛果，用于演示、调试和导出预览。' },
    { id: 'quick-score', icon: <Keyboard className="w-5 h-5" />, title: '快速录分', description: '支持多小组同屏、搜索、筛选、具体比分键盘录入、已录比分显示和颜色反馈后跳转。' },
    { id: 'storage-health', icon: <Shield className="w-5 h-5" />, title: '存储体检', description: '检查主备数据、双存储一致性、快照和审计记录，并可安全重写修复。' },
    { id: 'drag-reorder', icon: <GripVertical className="w-5 h-5" />, title: '拖拽改序', description: '正常查看对阵时可直接拖动卡片调整显示顺序，并自动保存。' },
    { id: 'snapshot-recovery', icon: <History className="w-5 h-5" />, title: '快照恢复', description: '保留最近 5 份自动快照，也可手动创建、恢复或删除快照。' },
    { id: 'quick-actions', icon: <Keyboard className="w-5 h-5" />, title: '快捷操作', description: '使用 Ctrl/Cmd+Z 撤销上一操作，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做。' },
    { id: 'persistent-history', icon: <History className="w-5 h-5" />, title: '持久操作历史', description: '操作历史保存在本地，刷新后可继续撤销、重做或跳转到指定状态。' },
  ],
  shortcuts: '键盘快捷键',
  shortcutGroups: [
    {
      title: '全局操作',
      items: [
        { keys: 'Ctrl/Cmd + K', description: '打开命令面板。' },
        { keys: 'Ctrl/Cmd + Z', description: '撤销上一操作。' },
        { keys: 'Ctrl/Cmd + Shift + Z', description: '重做上一操作。' },
        { keys: 'Ctrl + Y / Cmd + Y', description: '重做上一操作。' },
        { keys: 'Esc', description: '关闭当前弹窗；编辑赛事名、小组名或选手名时取消编辑。' },
      ],
    },
    {
      title: '快速录分',
      items: [
        { keys: '1 / 2', description: '判定左侧或右侧选手直落获胜，例如 BO3 的 2-0。' },
        { keys: '3+', description: '按详细赛果按钮上的数字提示录入 2-1、3-1 等具体比分。' },
        { keys: 'D', description: '记录双负，双方均以 0-0 判负：胜场各记一负，但不增加局分与对手网络中的已打局数。' },
        { keys: 'N', description: '跳到下一场待录比赛。' },
        { keys: '← / →', description: '切换上一场或下一场比赛。' },
      ],
    },
    {
      title: '内联编辑',
      items: [
        { keys: 'Enter', description: '保存当前赛事名、小组名或选手名编辑。' },
        { keys: 'Esc', description: '取消当前编辑并恢复原值。' },
      ],
    },
  ],
  shortcutNote: '当焦点位于输入框、文本区域或可编辑内容中时，Ctrl/Cmd+Z 执行浏览器原生文本撤销，不会触发赛事级撤销。',
  quickStart: '使用说明',
  steps: [
    {
      id: 'create-tournament',
      title: '创建比赛',
      items: ['设置赛事名称和小组数量。', '配置配对方式、比赛局数和轮次。', '导入或录入选手名单，并预览核对。', '单败淘汰确认完整签表后，一键同时启动全部小组。'],
    },
    {
      id: 'record-results',
      title: '录入赛果',
      items: ['点击待进行的比赛卡片。', '选择胜负、比分、双负或赛前弃赛。', '当前轮全部完成后生成下一轮对阵。'],
    },
    {
      id: 'manage-progress',
      title: '管理进度',
      items: ['撤回按钮会按当前状态自动切换：已有赛果时清除结果并保留本轮对阵；后续轮未录分时撤回至上一轮；第一轮未录分时返回开赛前设置。', '可在弃赛管理中标记赛后弃赛或恢复选手。', '每轮完成后可查看、恢复或删除自动快照。'],
    },
    {
      id: 'multi-stage',
      title: '多阶段赛事',
      items: [
        '首页选择「多阶段赛事」或「诗意杯 S3」；S3 只需导入 A-D 四组名单。',
        '多阶段赛事先在设置页定义赛段顺序与赛制，再进入同一套工作区。',
        '赛段打完后点「计算晋级」，确认预览后名单与固定签表写入下一赛段。',
      ],
    },
    {
      id: 'export-backup',
      title: '导出与备份',
      items: ['图片和 Excel 支持当前小组或全部小组。', '总表包含排行榜和各轮对阵。', '重要比赛后建议导出 JSON 备份。'],
    },
  ],
  rules: '赛制与排名',
  swissRules: '瑞士轮配对规则',
  swissRuleItems: [
    { title: '首轮随机配对', text: '第一轮随机生成对阵，作为后续战绩分组的起点。' },
    { title: '避免重复对阵', text: '同一赛事中任意两名选手不会重复匹配。' },
    { title: '按战绩分组', text: '从第 2 轮开始按胜场分组，并在相邻战绩组之间处理上下移。' },
    { title: '优先标记与次数', text: '跨组匹配优先处理已有上下标记、匹配次数较少和排名位置合适的选手。' },
    { title: '对折与穷举', text: '组内优先对折匹配，必要时使用回溯穷举避免重复对阵。' },
    { title: '轮空规则', text: '最终无法匹配的选手轮空；轮空比分计入排名和对手胜率网络。' },
  ],
  swissRankingRules: '瑞士轮排名规则',
  swissRankingRuleItems: [
    { title: '总体顺序', text: '先比较参赛状态（正常参赛 > 已淘汰 > 已弃赛），再从胜场数和破分指标逐级排序。' },
    { title: '默认 BO1 破分链', text: '胜场数 → 对手胜率（SOS）→ 对手的对手胜率（SOSOS）→ 积分 → 加赛胜场/名次 → 姓名。' },
    { title: '默认 BO3 / BO5 / BO7 破分链', text: '胜场数 → 对手胜率（SOS）→ 本人局胜率 → 对手局胜率 → 积分 → 加赛胜场/名次 → 姓名。' },
    { title: '自定义破分链', text: '比赛开始前可在赛制管理中选择 BO1 / 多局预设，或启用自定义模式并调整指标顺序。' },
    { title: '对手胜率（SOS）', text: '按 Σ对手有效胜场 / Σ对手有效总场次聚合计算；赛前弃赛和加赛不进入该网络，轮空按 0 胜 / 1 场计入。' },
    { title: '局胜率（BO3+）', text: '本人局胜率与对手局胜率均按累计胜局 / 累计总局计算，赛前弃赛和加赛不计入。' },
    { title: '完全同分', text: '若常规破分指标全部相同，系统会标记需要加赛；加赛胜场和最终名次只用于区分名次，不改变常规小分。' },
  ],
  eliminationRules: '单败淘汰固定签表',
  eliminationRuleItems: [
    '默认按当前名单顺序排阵；8 人为 1 vs 2、3 vs 4、5 vs 6、7 vs 8，相邻两场胜者晋级相遇。',
    '开赛前可随机重抽、交换签位、指定选手或轮空；确认后签表和名单一起锁定。',
    '非 2 的幂人数优先把轮空分配给名单靠前选手，避免轮空对轮空，首轮轮空比分跟随该轮局制。',
    '后续轮次严格按固定节点填入胜者，不再重新随机配对；未进行的后续轮次不可提前录分。',
    '改判只有在后续轮次尚未产生赛果时可用；已有后续赛果时需先撤回下游结果。',
    '选手退赛保留原签位和姓名，按弃权处理，由当前对手继续晋级。',
    '撤回至开赛前可重新排阵；每轮可独立设置 BO1-BO7。',
  ],
  storage: '数据存储',
  storageItems: [
    '赛事数据优先保存在浏览器 IndexedDB 中，容量不足时兼容 localStorage 回退。',
    '主数据和备份数据会分别保存，主数据损坏时可自动恢复。',
    '多个标签页打开时只有一个可编辑，其他标签页自动进入只读状态。',
    '撤销和重做历史保存在本地，可用于刷新后的继续操作或恢复历史状态。',
    '快照保存在浏览器内，清除浏览器数据会一并删除。',
    '跨设备迁移或长期保存请导出 JSON 文件。',
  ],
  faq: '常见问题',
  faqItems: [
    { question: '如何修改已录入的比赛结果？', answer: '可直接修改当前比赛结果，也可以使用 Ctrl/Cmd+Z 撤销上一操作；撤回按钮已有赛果时保留本轮对阵并清空结果，未录分时则撤回至上一轮或开赛前设置。' },
    { question: '为什么比赛开始后不能导入？', answer: '为避免覆盖进行中的数据，导入会禁用；请先重置赛事，再导入新的 JSON 文件。' },
    { question: 'Excel 如何识别选手姓名？', answer: '系统会优先识别姓名、Name、Player 等表头，也可在导入前手动指定列。' },
    { question: '快照和 JSON 导出有什么区别？', answer: '快照适合浏览器内快速回滚；JSON 文件适合长期备份和跨设备迁移。' },
    { question: '为什么排行榜导出会被限制？', answer: '为保证同一小组选手比赛场数一致，排行榜和总表需要本轮全部完赛。对阵表不受此限制。' },
    { question: '加赛会影响常规排名吗？', answer: '加赛只用于区分名次，不计入对手胜率、对手对手胜率和局胜率等常规小分。' },
    { question: '为什么突围赛或淘汰赛开不了赛？', answer: '下游赛段需要上游先确认晋级。请先在上一赛段的「赛段晋级」面板里计算并确认，名单写入后即可开赛。' },
    { question: '为什么小组赛的赛果改不了了？', answer: '上游晋级已确认且下游赛段已开赛时，上游赛果会锁定。需要修改时先清空下游赛段并回退晋级，改完上游赛果后重新确认晋级。' },
    { question: '淘汰赛的签位是随机的吗？', answer: '诗意杯 S3 使用固定签位：A1-D4、B2-C3、C1-B4、D2-A3、B1-C4、A2-D3、D1-A4、C2-B3。确认晋级时按小组名次自动排好，人数不足按实际人数轮空、不补位。' },
    { question: '首页导入 JSON 会认错赛事类型吗？', answer: '不会，类型取自文件内容，单阶段、多阶段、诗意杯 S3 自动匹配；当前已有赛事时会先提示识别结果并确认替换。' },
  ],
  disclaimer: '免责声明',
  disclaimerItems: [
    '本系统基于特定的瑞士轮配对算法与排名规则设计，不一定适用于所有赛事规则。',
    '正式比赛前建议使用测试模式模拟完整赛程，并结合实际规则核对配对和排名结果。',
  ],
  links: '相关链接',
  github: 'GitHub 项目地址',
  bilibili: '开发者 B 站主页',
  qq: '开发者 QQ',
  qqHint: '加好友备注来意',
  contact: '如有 Bug 反馈、功能建议或规则讨论，欢迎联系开发者（ShiyiPai）。',
  footer: '诗意 · 比赛战绩统计系统 · 本地数据存储 · 无需联网',
};

export const HELP_CONTENT_EN: HelpCopy = {
  close: 'Close help page',
  subtitle: 'Tournament management, pairings, rankings, backups, and exports',
  features: 'Features',
  featureItems: [
    { id: 'multi-group', icon: <Users className="w-5 h-5" />, title: 'Multi-group management', description: 'Configure and run 1-20 groups. Codes use A01-Z99, and missing codes can be filled without overwriting existing ones.' },
    { id: 'player-overview', icon: <Eye className="w-5 h-5" />, title: 'Player overview', description: 'Validate every roster before play, with duplicate and empty-group detection, search, and copy tools.' },
    { id: 'roster-management', icon: <UserCog className="w-5 h-5" />, title: 'Roster management', description: 'Edit players individually or import from text, Excel, CSV, and TXT files.' },
    { id: 'player-profiles', icon: <UserCog className="w-5 h-5" />, title: 'Player profiles', description: 'Support generic and Poetry Cup templates, tracking player codes, 9-digit UIDs, and QQ numbers per player.' },
    { id: 'dual-format', icon: <Swords className="w-5 h-5" />, title: 'Swiss and elimination', description: 'Use Swiss or single elimination. Elimination brackets follow roster order by default and can be reviewed and locked before play.' },
    { id: 'result-import', icon: <FileUp className="w-5 h-5" />, title: 'Result import', description: 'Import Tencent Docs XLSX files, match matches by player code, and verify each screenshot before writing results.' },
    { id: 'bracket-edit', icon: <ArrowLeftRight className="w-5 h-5" />, title: 'Bracket editing', description: 'Before play, redraw, swap slots, or assign a player/bye. Once confirmed, the full bracket is locked and later rounds only receive winners.' },
    { id: 'live-rankings', icon: <Trophy className="w-5 h-5" />, title: 'Live rankings', description: 'Track win rate, opponent win rate, game win rate, eliminations, drops, and playoffs.' },
    { id: 'event-types', icon: <Layers className="w-5 h-5" />, title: 'Event types', description: 'Pick single-stage, multi-stage (test feature), or Poetry Cup S3 on the home page. Single-stage keeps the previous workspace; multi-stage and S3 also track stages, advancement, and fixed seeds.' },
    { id: 'stage-advancement', icon: <ShieldCheck className="w-5 h-5" />, title: 'Stage advancement', description: 'Calculate a preview after a stage finishes, then confirm to write it into downstream stages; reverting is supported. Downstream stages cannot start before the upstream confirmation, and upstream results lock once the downstream stage starts.' },
    { id: 'export-tools', icon: <Download className="w-5 h-5" />, title: 'Export tools', description: 'Export rankings, match tables, and summaries as PNG or Excel with participant codes and UIDs. Multi-stage sheet names carry the stage and add final-standings and advancement sheets, and the image export offers a standings view; tournament data exports as JSON.' },
    { id: 'local-backup', icon: <Database className="w-5 h-5" />, title: 'Local backups', description: 'Primary and backup storage keys protect local data, with automatic snapshots after each round.' },
    { id: 'test-mode', icon: <FlaskConical className="w-5 h-5" />, title: 'Test mode', description: 'Generate random current-round or full-event results for demos, debugging, and export previews.' },
    { id: 'quick-score', icon: <Keyboard className="w-5 h-5" />, title: 'Quick score entry', description: 'View multiple groups together, search, filter, enter detailed keyboard scores, view recorded scores, and advance after clear feedback.' },
    { id: 'storage-health', icon: <Shield className="w-5 h-5" />, title: 'Storage health', description: 'Inspect primary and backup records, mirrors, snapshots, and audit data with safe rewrite repair.' },
    { id: 'drag-reorder', icon: <GripVertical className="w-5 h-5" />, title: 'Drag to reorder', description: 'Reorder match cards in normal view; the new display order is saved automatically.' },
    { id: 'snapshot-recovery', icon: <History className="w-5 h-5" />, title: 'Snapshot recovery', description: 'Keep up to five automatic snapshots, or create, restore, and delete snapshots manually.' },
    { id: 'quick-actions', icon: <Keyboard className="w-5 h-5" />, title: 'Quick actions', description: 'Undo with Ctrl/Cmd+Z and redo with Ctrl/Cmd+Shift+Z or Ctrl+Y.' },
    { id: 'persistent-history', icon: <History className="w-5 h-5" />, title: 'Persistent history', description: 'Undo and redo history survives refresh and can be restored or cleared.' },
  ],
  shortcuts: 'Keyboard shortcuts',
  shortcutGroups: [
    {
      title: 'Global',
      items: [
        { keys: 'Ctrl/Cmd + K', description: 'Open the command palette.' },
        { keys: 'Ctrl/Cmd + Z', description: 'Undo the previous operation.' },
        { keys: 'Ctrl/Cmd + Shift + Z', description: 'Redo the previous operation.' },
        { keys: 'Ctrl + Y / Cmd + Y', description: 'Redo the previous operation.' },
        { keys: 'Esc', description: 'Close the active dialog, or cancel an inline tournament, group, or player name edit.' },
      ],
    },
    {
      title: 'Quick score entry',
      items: [
        { keys: '1 / 2', description: 'Record a straight-set win for the left or right player, such as 2-0 in BO3.' },
        { keys: '3+', description: 'Use the number shown on a detailed result button to record scores such as 2-1 or 3-1.' },
        { keys: 'D', description: 'Record a 0-0 double loss for both players: each gets a loss, while the score adds no played games to game rates or opponent networks.' },
        { keys: 'N', description: 'Jump to the next pending match.' },
        { keys: '← / →', description: 'Switch to the previous or next match.' },
      ],
    },
    {
      title: 'Inline editing',
      items: [
        { keys: 'Enter', description: 'Save the current tournament, group, or player name edit.' },
        { keys: 'Esc', description: 'Cancel the current edit and restore the previous value.' },
      ],
    },
  ],
  shortcutNote: 'When focus is inside an input, textarea, or editable field, Ctrl/Cmd+Z performs native text undo instead of tournament undo.',
  quickStart: 'Quick start',
  steps: [
    {
      id: 'create-tournament',
      title: 'Create the tournament',
      items: ['Set the tournament name and number of groups.', 'Configure pairing type, match length, and rounds.', 'Import players or enter names, then verify the preview.', 'For elimination groups, confirm every bracket, then start all groups together.'],
    },
    {
      id: 'record-results',
      title: 'Record results',
      items: ['Select a pending match card.', 'Choose a winner, score, double-loss, or pre-drop.', 'Generate the next round after every match is complete.'],
    },
    {
      id: 'manage-progress',
      title: 'Manage progress',
      items: ['The undo action adapts automatically: it clears entered results while keeping the current pairings, returns an empty later round to the previous round, or returns an empty first round to setup.', 'Mark post-drops or restore players in dropout management.', 'Review, restore, or delete automatic snapshots after each round.'],
    },
    {
      id: 'multi-stage',
      title: 'Multi-stage events',
      items: ['Choose "Multi-stage" or "Poetry Cup S3" on the home page; S3 only requires importing the four A-D rosters.', 'For multi-stage events, define the stage order and formats on the setup page, then continue in the same workspace.', 'After a stage finishes, use "Calculate advancement", review the preview, then write the roster and fixed seeds into the next stage.'],
    },
    {
      id: 'export-backup',
      title: 'Export and back up',
      items: ['Export images and Excel for one group or all groups.', 'Summary files include rankings and every completed round.', 'Export a JSON backup after important matches.'],
    },
  ],
  rules: 'Formats and rankings',
  swissRules: 'Swiss pairing rules',
  swissRuleItems: [
    { title: 'Random first round', text: 'Round one is randomly paired and establishes the first score groups.' },
    { title: 'No repeat pairings', text: 'Two players never face each other twice in the same tournament.' },
    { title: 'Score groups', text: 'From round two onward, players are grouped by wins and matched across adjacent score groups when needed.' },
    { title: 'Priority and balance', text: 'Cross-group matching prefers existing up/down markers, fewer previous moves, and suitable rank positions.' },
    { title: 'Fold and search', text: 'Groups first attempt fold pairing, then backtracking to avoid repeat opponents.' },
    { title: 'Byes', text: 'Any remaining unmatched player receives a bye; bye games count toward rankings and opponent-rate calculations.' },
  ],
  swissRankingRules: 'Swiss ranking rules',
  swissRankingRuleItems: [
    { title: 'Overall order', text: 'First compare participation status (active > eliminated > dropped), then sort by wins and the applicable tiebreak chain.' },
    { title: 'Default BO1 tiebreak chain', text: 'Wins → opponent win rate (SOS) → opponents-of-opponents win rate (SOSOS) → points → playoff wins/placement → name.' },
    { title: 'Default BO3 / BO5 / BO7 tiebreak chain', text: 'Wins → opponent win rate (SOS) → personal game win rate → opponent game win rate → points → playoff wins/placement → name.' },
    { title: 'Custom tiebreak chain', text: 'Before the event starts, choose a BO1 / multi-game preset or enable custom mode and reorder the metrics.' },
    { title: 'Opponent win rate (SOS)', text: 'Calculated as Σ opponent wins / Σ opponent games. Pre-match drops and playoffs are excluded; a bye contributes 0 wins over 1 game.' },
    { title: 'Game rates (BO3+)', text: 'Personal and opponent game win rates use total games won / total games played. Pre-match drops and playoffs are excluded.' },
    { title: 'Exact ties', text: 'If every regular tiebreak metric is identical, the app marks the players as requiring a playoff. Playoff wins and final placement never change regular tiebreak metrics.' },
  ],
  eliminationRules: 'Fixed single-elimination bracket',
  eliminationRuleItems: [
    'The default bracket follows current roster order. With eight players: 1 vs 2, 3 vs 4, 5 vs 6, 7 vs 8, with adjacent winners meeting in the next round.',
    'Before play, redraw, swap slots, or assign players and byes. Confirmation locks the bracket and roster together.',
    'For non-power-of-two fields, byes go to the earliest roster positions first and never face each other. A first-round bye uses that round\'s match format.',
    'Later rounds always receive winners at fixed nodes and are never randomly repaired. Future rounds cannot be scored early.',
    'A completed result can be changed only before any downstream result exists; undo those results first when later rounds have been played.',
    'A withdrawn player keeps the original slot and name, is treated as a forfeit, and the opponent advances.',
    'Returning to setup unlocks bracket editing. Each round can use a different BO1-BO7 setting.',
  ],
  storage: 'Data storage',
  storageItems: [
    'Tournament data is stored primarily in browser IndexedDB, with localStorage retained as a compatibility fallback.',
    'Primary and backup records are stored separately for automatic recovery.',
    'When multiple tabs are open, one remains editable and the others become read-only.',
    'Undo and redo history is stored locally so it can be used again after refresh.',
    'Snapshots remain in the browser and are removed when browser data is cleared.',
    'Use JSON export for long-term backup or moving to another device.',
  ],
  faq: 'FAQ',
  faqItems: [
    { question: 'How do I correct an entered result?', answer: 'Edit the current match directly, use Ctrl/Cmd+Z for the last operation, or use the context-aware undo action: it keeps current pairings when results exist, or returns an empty later round to the previous round or setup.' },
    { question: 'Why is import disabled after the tournament starts?', answer: 'This prevents active data from being overwritten. Reset the tournament before importing a new JSON file.' },
    { question: 'How does Excel import detect player names?', answer: 'The app prioritizes headers such as Name, Player, and 姓名, and you can choose the column manually before import.' },
    { question: 'What is the difference between snapshots and JSON export?', answer: 'Snapshots are quick in-browser rollback points. JSON files are portable and better for long-term storage.' },
    { question: 'Why is ranking export restricted?', answer: 'Rankings and summaries require every match in the round to be complete so players have comparable game counts. Match-table export is unrestricted.' },
    { question: 'Do playoffs affect regular rankings?', answer: 'No. Playoffs only separate tied placements and do not change opponent rates or other regular tiebreak metrics.' },
    { question: 'Why can a breakout or playoff stage not start?', answer: 'A downstream stage needs the upstream advancement to be confirmed first. Calculate and confirm it in the stage-advancement panel, then the roster is written and the stage can start.' },
    { question: 'Why can group-stage results no longer be edited?', answer: 'Once the advancement is confirmed and the downstream stage has started, upstream results lock. Clear the downstream stage, revert the advancement, edit the results, then confirm again.' },
    { question: 'Are playoff seeds random?', answer: 'Poetry Cup S3 uses fixed seeds: A1-D4, B2-C3, C1-B4, D2-A3, B1-C4, A2-D3, D1-A4, C2-B3. They are filled from the group standings on confirmation, with byes when fewer players qualify.' },
    { question: 'Can the home-page JSON import pick the wrong event type?', answer: 'No. The type comes from the file contents, so single-stage, multi-stage, and Poetry Cup S3 are matched automatically; an existing event triggers a confirmation with the detected type.' },
  ],
  disclaimer: 'Disclaimer',
  disclaimerItems: [
    'This application implements a specific Swiss pairing model and ranking system that may not match every tournament ruleset.',
    'Before formal use, simulate a complete event in test mode and verify pairings and rankings against your own rules.',
  ],
  links: 'Links',
  github: 'GitHub project',
  bilibili: 'Developer Bilibili',
  qq: 'Developer QQ',
  qqHint: 'Mention the purpose when adding',
  contact: 'For bug reports, feature requests, or rule discussions, contact the developer (ShiyiPai).',
  footer: 'Poetic · Tournament Results System · Local-only data storage',
};

export const helpContent: Record<AppLanguage, HelpCopy> = {
  zh: HELP_CONTENT_ZH,
  en: HELP_CONTENT_EN,
};
