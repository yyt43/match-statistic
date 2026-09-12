import {
  AlertTriangle,
  ArrowLeftRight,
  Database,
  Download,
  Eye,
  ExternalLink,
  FlaskConical,
  Github,
  GripVertical,
  HelpCircle,
  History,
  Keyboard,
  MessageCircle,
  Shield,
  Swords,
  Trophy,
  UserCog,
  Users,
  X,
  Youtube,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useLanguagePreference } from '../../i18n/context';
import type { AppLanguage } from '../../i18n/data';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface HelpPageProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HelpFeature {
  icon: ReactNode;
  title: string;
  description: string;
}

interface HelpStep {
  title: string;
  items: string[];
}

interface HelpRule {
  title: string;
  text: string;
}

interface HelpFaq {
  question: string;
  answer: string;
}

interface HelpCopy {
  close: string;
  subtitle: string;
  features: string;
  featureItems: HelpFeature[];
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

const content: Record<AppLanguage, HelpCopy> = {
  zh: {
    close: '关闭帮助页面',
    subtitle: '专业比赛管理与成绩统计工具',
    features: '功能概览',
    featureItems: [
      { icon: <Users className="w-5 h-5" />, title: '多小组管理', description: '支持 1-20 个小组独立配置和开赛，也可一键启动全部小组。' },
      { icon: <Eye className="w-5 h-5" />, title: '选手总览', description: '开赛前集中核对名单，自动检测重名和空小组，支持搜索与复制。' },
      { icon: <UserCog className="w-5 h-5" />, title: '名单管理', description: '逐个修改选手，或从文本、Excel、CSV、TXT 批量导入。' },
      { icon: <Swords className="w-5 h-5" />, title: '双赛制支持', description: '支持瑞士轮和单败淘汰，每轮可独立设置 BO1、BO3、BO5 或 BO7。' },
      { icon: <ArrowLeftRight className="w-5 h-5" />, title: '对阵编辑', description: '单败淘汰当前轮可交换选手，并支持随机分配和按录入顺序重排。' },
      { icon: <Trophy className="w-5 h-5" />, title: '实时排名', description: '自动计算胜率、对手胜率、局胜率，并展示淘汰、弃赛和加赛状态。' },
      { icon: <Download className="w-5 h-5" />, title: '导出工具', description: '排行榜、对阵表和总表可导出为 PNG 或 Excel，赛事数据可导出为 JSON。' },
      { icon: <Database className="w-5 h-5" />, title: '本地双备份', description: '主键与备份键双重保存；每轮完赛还会自动创建快照。' },
      { icon: <FlaskConical className="w-5 h-5" />, title: '测试模式', description: '可随机生成当前轮或整场赛果，用于演示、调试和导出预览。' },
      { icon: <GripVertical className="w-5 h-5" />, title: '拖拽改序', description: '正常查看对阵时可直接拖动卡片调整显示顺序，并自动保存。' },
      { icon: <History className="w-5 h-5" />, title: '快照恢复', description: '保留最近 5 份自动快照，也可手动创建、恢复或删除快照。' },
      { icon: <Keyboard className="w-5 h-5" />, title: '快捷操作', description: '使用 Ctrl/Cmd+Z 撤销上一操作，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做。' },
    ],
    quickStart: '使用说明',
    steps: [
      {
        title: '创建比赛',
        items: ['设置赛事名称和小组数量。', '配置配对方式、比赛局数和轮次。', '导入或录入选手名单，并预览核对。', '开始本组比赛或一键启动全部小组。'],
      },
      {
        title: '录入赛果',
        items: ['点击待进行的比赛卡片。', '选择胜负、比分、双负或赛前弃赛。', '当前轮全部完成后生成下一轮对阵。'],
      },
      {
        title: '管理进度',
        items: ['需要改判时撤回上一轮，系统会恢复选手状态。', '可在弃赛管理中标记赛后弃赛或恢复选手。', '每轮完成后可查看、恢复或删除自动快照。'],
      },
      {
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
    eliminationRules: '单败淘汰规则',
    eliminationRuleItems: [
      '第一轮随机配对，后续按上轮胜者顺序配对。',
      '每轮可独立设置 BO1-BO7。',
      '败者自动淘汰，奇数人数时产生轮空。',
      '撤回上一轮会恢复被淘汰选手的状态。',
    ],
    storage: '数据存储',
    storageItems: [
      '赛事数据优先保存在浏览器 IndexedDB 中，容量不足时兼容 localStorage 回退。',
      '主数据和备份数据会分别保存，主数据损坏时可自动恢复。',
      '多个标签页打开时只有一个可编辑，其他标签页自动进入只读状态。',
      '快照保存在浏览器内，清除浏览器数据会一并删除。',
      '跨设备迁移或长期保存请导出 JSON 文件。',
    ],
    faq: '常见问题',
    faqItems: [
      { question: '如何修改已录入的比赛结果？', answer: '可直接修改当前比赛结果，也可以使用 Ctrl/Cmd+Z 撤销上一操作；整轮回退仍可使用“撤回本轮赛果”。' },
      { question: '为什么比赛开始后不能导入？', answer: '为避免覆盖进行中的数据，导入会禁用；请先重置赛事，再导入新的 JSON 文件。' },
      { question: 'Excel 如何识别选手姓名？', answer: '系统会优先识别姓名、Name、Player 等表头，也可在导入前手动指定列。' },
      { question: '快照和 JSON 导出有什么区别？', answer: '快照适合浏览器内快速回滚；JSON 文件适合长期备份和跨设备迁移。' },
      { question: '为什么排行榜导出会被限制？', answer: '为保证同一小组选手比赛场数一致，排行榜和总表需要本轮全部完赛。对阵表不受此限制。' },
      { question: '加赛会影响常规排名吗？', answer: '加赛只用于区分名次，不计入对手胜率、对手对手胜率和局胜率等常规小分。' },
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
  },
  en: {
    close: 'Close help page',
    subtitle: 'Tournament management, pairings, rankings, backups, and exports',
    features: 'Features',
    featureItems: [
      { icon: <Users className="w-5 h-5" />, title: 'Multi-group management', description: 'Configure and run 1-20 groups independently, or start every group together.' },
      { icon: <Eye className="w-5 h-5" />, title: 'Player overview', description: 'Validate every roster before play, with duplicate and empty-group detection, search, and copy tools.' },
      { icon: <UserCog className="w-5 h-5" />, title: 'Roster management', description: 'Edit players individually or import from text, Excel, CSV, and TXT files.' },
      { icon: <Swords className="w-5 h-5" />, title: 'Swiss and elimination', description: 'Use Swiss or single-elimination pairings with per-round BO1, BO3, BO5, or BO7 settings.' },
      { icon: <ArrowLeftRight className="w-5 h-5" />, title: 'Match editing', description: 'Swap players in the current elimination round, randomize, or assign by entry order.' },
      { icon: <Trophy className="w-5 h-5" />, title: 'Live rankings', description: 'Track win rate, opponent win rate, game win rate, eliminations, drops, and playoffs.' },
      { icon: <Download className="w-5 h-5" />, title: 'Export tools', description: 'Export rankings, match tables, and summaries as PNG or Excel, or save tournament data as JSON.' },
      { icon: <Database className="w-5 h-5" />, title: 'Local backups', description: 'Primary and backup storage keys protect local data, with automatic snapshots after each round.' },
      { icon: <FlaskConical className="w-5 h-5" />, title: 'Test mode', description: 'Generate random current-round or full-event results for demos, debugging, and export previews.' },
      { icon: <GripVertical className="w-5 h-5" />, title: 'Drag to reorder', description: 'Reorder match cards in normal view; the new display order is saved automatically.' },
      { icon: <History className="w-5 h-5" />, title: 'Snapshot recovery', description: 'Keep up to five automatic snapshots, or create, restore, and delete snapshots manually.' },
      { icon: <Keyboard className="w-5 h-5" />, title: 'Quick actions', description: 'Undo with Ctrl/Cmd+Z and redo with Ctrl/Cmd+Shift+Z or Ctrl+Y.' },
    ],
    quickStart: 'Quick start',
    steps: [
      {
        title: 'Create the tournament',
        items: ['Set the tournament name and number of groups.', 'Configure pairing type, match length, and rounds.', 'Import players or enter names, then verify the preview.', 'Start one group or launch all groups together.'],
      },
      {
        title: 'Record results',
        items: ['Select a pending match card.', 'Choose a winner, score, double-loss, or pre-drop.', 'Generate the next round after every match is complete.'],
      },
      {
        title: 'Manage progress',
        items: ['Undo the previous round when a result must be changed.', 'Mark post-drops or restore players in dropout management.', 'Review, restore, or delete automatic snapshots after each round.'],
      },
      {
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
    eliminationRules: 'Single-elimination rules',
    eliminationRuleItems: [
      'Round one is random; later rounds pair winners in order.',
      'Each round can use a different BO1-BO7 setting.',
      'The loser is eliminated, and an odd field creates a bye.',
      'Undoing the previous round restores eliminated players.',
    ],
    storage: 'Data storage',
    storageItems: [
      'Tournament data is stored primarily in browser IndexedDB, with localStorage retained as a compatibility fallback.',
      'Primary and backup records are stored separately for automatic recovery.',
      'When multiple tabs are open, one remains editable and the others become read-only.',
      'Snapshots remain in the browser and are removed when browser data is cleared.',
      'Use JSON export for long-term backup or moving to another device.',
    ],
    faq: 'FAQ',
    faqItems: [
      { question: 'How do I correct an entered result?', answer: 'Edit the current match directly, or use Ctrl/Cmd+Z to undo the last operation. “Undo round results” still restores a complete round.' },
      { question: 'Why is import disabled after the tournament starts?', answer: 'This prevents active data from being overwritten. Reset the tournament before importing a new JSON file.' },
      { question: 'How does Excel import detect player names?', answer: 'The app prioritizes headers such as Name, Player, and 姓名, and you can choose the column manually before import.' },
      { question: 'What is the difference between snapshots and JSON export?', answer: 'Snapshots are quick in-browser rollback points. JSON files are portable and better for long-term storage.' },
      { question: 'Why is ranking export restricted?', answer: 'Rankings and summaries require every match in the round to be complete so players have comparable game counts. Match-table export is unrestricted.' },
      { question: 'Do playoffs affect regular rankings?', answer: 'No. Playoffs only separate tied placements and do not change opponent rates or other regular tiebreak metrics.' },
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
  },
};

export function HelpPage({ isOpen, onClose }: HelpPageProps) {
  useEscapeClose(isOpen, onClose);
  const { language, t } = useLanguagePreference();
  const copy = content[language];
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, dialogRef);

  if (!isOpen) return null;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <button
          onClick={onClose}
          aria-label={copy.close}
          className="fixed top-6 right-6 p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <Trophy className="w-10 h-10 text-gold-400" />
            <h1 className="text-3xl font-bold text-white">{t.appName}</h1>
          </div>
          <p className="text-slate-400">{copy.subtitle}</p>
        </div>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-gold-400" />
            {copy.features}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {copy.featureItems.map(feature => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">{copy.quickStart}</h2>
          <div className="space-y-6">
            {copy.steps.map((step, index) => (
              <StepBlock key={step.title} number={index + 1} title={step.title} steps={step.items} />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">{copy.rules}</h2>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-3">{copy.swissRules}</h3>
              <div className="text-sm text-slate-300 space-y-3">
                {copy.swissRuleItems.map((rule, index) => (
                  <RuleItem key={rule.title} num={String(index + 1)} title={rule.title}>
                    {rule.text}
                  </RuleItem>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-3">{copy.swissRankingRules}</h3>
              <div className="text-sm text-slate-300 space-y-3">
                {copy.swissRankingRuleItems.map((rule, index) => (
                  <RuleItem key={rule.title} num={String(index + 1)} title={rule.title}>
                    {rule.text}
                  </RuleItem>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">{copy.eliminationRules}</h3>
              <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                {copy.eliminationRuleItems.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-gold-400" />
            {copy.storage}
          </h2>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside">
              {copy.storageItems.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">{copy.faq}</h2>
          <div className="space-y-4">
            {copy.faqItems.map(item => <FAQItem key={item.question} {...item} />)}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            {copy.disclaimer}
          </h2>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6 space-y-3">
            {copy.disclaimerItems.map(item => (
              <p key={item} className="text-sm text-slate-300 leading-relaxed">{item}</p>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-gold-400" />
            {copy.links}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="https://github.com/yyt43/match-statistic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-gold-500/30 hover:bg-slate-800/80 transition-colors group"
            >
              <div className="text-slate-300 group-hover:text-gold-400 transition-colors"><Github className="w-8 h-8" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white mb-0.5">{copy.github}</div>
                <div className="text-xs text-slate-400 truncate">github.com/yyt43/match-statistic</div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-gold-400 transition-colors shrink-0" />
            </a>
            <a
              href="https://space.bilibili.com/526320039"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-gold-500/30 hover:bg-slate-800/80 transition-colors group"
            >
              <div className="text-slate-300 group-hover:text-gold-400 transition-colors"><Youtube className="w-8 h-8" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white mb-0.5">{copy.bilibili}</div>
                <div className="text-xs text-slate-400 truncate">space.bilibili.com/526320039</div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-gold-400 transition-colors shrink-0" />
            </a>
            <div className="flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 cursor-default">
              <div className="text-slate-300"><MessageCircle className="w-8 h-8" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white mb-0.5">{copy.qq}</div>
                <div className="text-xs text-slate-400 truncate">2845850691</div>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">{copy.qqHint}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">{copy.contact}</p>
        </section>

        <div className="text-center text-slate-500 text-sm pt-6 border-t border-slate-700/50 space-y-1">
          <div>{copy.footer}</div>
          <div className="text-xs text-slate-600">{t.footerCopyright}</div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: HelpFeature) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-gold-500/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="text-gold-400 mt-0.5">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function StepBlock({ number, title, steps }: { number: number; title: string; steps: string[] }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-sm font-bold">
          {number}
        </div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <ul className="space-y-1.5 pl-10">
        {steps.map(step => (
          <li key={step} className="text-sm text-slate-300 flex items-start gap-2">
            <span className="text-slate-500">•</span>
            <span>{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleItem({ num, title, children }: { num: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-xs font-bold mt-0.5">
        {num}
      </div>
      <div className="flex-1">
        <span className="text-white font-medium">{title}: </span>
        <span className="text-slate-300">{children}</span>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }: HelpFaq) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
      <h4 className="text-sm font-medium text-white mb-1">{question}</h4>
      <p className="text-sm text-slate-400">{answer}</p>
    </div>
  );
}
