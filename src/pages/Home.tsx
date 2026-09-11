import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { PlayerRanking } from '../components/PlayerRanking';
import { MatchList } from '../components/MatchList';
import { ControlPanel } from '../components/ControlPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StorageBanner } from '../components/StorageBanner';
import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';
import { generatePairings, getRoundGameType } from '../utils/swissPairing';
import { Camera, Trophy, FileSpreadsheet, HelpCircle, FlaskConical, AlertTriangle, Scale, UserX, Users, Undo2, Swords, Languages } from 'lucide-react';
import { useLanguagePreference } from '../i18n';

const ImageExportModal = lazy(() => import('../components/ImageExportModal').then(module => ({ default: module.ImageExportModal })));
const ExcelExportModal = lazy(() => import('../components/ExcelExportModal').then(module => ({ default: module.ExcelExportModal })));
const HelpPage = lazy(() => import('../components/HelpPage').then(module => ({ default: module.HelpPage })));
const PlayerPreviewModal = lazy(() => import('../components/PlayerPreviewModal').then(module => ({ default: module.PlayerPreviewModal })));

export default function Home() {
  const { loadSavedCompetition, undoLastRound } = useTournamentStore();
  const currentGroup = useCurrentGroup();
  const { language, setLanguage, t } = useLanguagePreference();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportType, setExportType] = useState<'ranking' | 'match'>('ranking');
  const [exportAllGroups, setExportAllGroups] = useState(false);
  const [isExcelOpen, setIsExcelOpen] = useState(false);
  const [excelType, setExcelType] = useState<'ranking' | 'match'>('ranking');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmType, setConfirmType] = useState<'single' | 'all'>('single');
  const [testMode, setTestMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPlayerPreview, setShowPlayerPreview] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);

  useEffect(() => {
    loadSavedCompetition();
  }, [loadSavedCompetition]);

  // Ctrl+Z / Cmd+Z 撤回上一轮：仅在比赛进行中、无弹窗、未在输入框中聚焦时触发
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z');
      if (!isUndo) return;

      // 任一弹窗打开时禁用，避免误触发
      if (isExportOpen || isExcelOpen || showConfirm || showHelp || showPlayerPreview) return;

      // 在 input/textarea/contenteditable 中编辑文本时让浏览器原生撤销生效
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      // 只有进行中且已有轮次可撤回时才拦截
      if (currentGroup.status !== 'in_progress' || currentGroup.currentRound <= 0) return;

      e.preventDefault();
      undoLastRound();
      setShowUndoToast(true);
      window.setTimeout(() => setShowUndoToast(false), 1800);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isExportOpen, isExcelOpen, showConfirm, showHelp, showPlayerPreview, currentGroup.status, currentGroup.currentRound, undoLastRound]);

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Storage status banner */}
      <StorageBanner />

      <button
        onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
        className="fixed top-4 right-28 z-50 flex items-center gap-1.5 px-2.5 py-2 rounded-full bg-slate-800/60 hover:bg-slate-700 text-slate-200 hover:text-gold-400 transition-all border border-slate-700/40 hover:border-gold-500/30 backdrop-blur-sm text-xs font-medium"
        title={language === 'en' ? 'Switch to Chinese' : 'Switch to English'}
      >
        <Languages className="w-3.5 h-3.5" />
        <span>{t.swapLanguage}</span>
      </button>

      {/* Help button */}
      <button
        onClick={() => setShowHelp(true)}
        className="fixed top-4 right-16 z-50 p-2 rounded-full bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-gold-400 transition-all border border-slate-700/40 hover:border-gold-500/30 backdrop-blur-sm"
        title={t.help}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {/* Test mode button */}
      <button
        onClick={() => setTestMode(!testMode)}
        className={`fixed top-4 right-4 z-50 p-2 rounded-full transition-all border backdrop-blur-sm ${
          testMode
            ? 'bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 border-violet-500/25'
            : 'bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-violet-400 border-slate-700/40 hover:border-violet-500/25'
        }`}
        title={testMode ? t.testModeOn : t.testModeOff}
      >
        <FlaskConical className="w-4 h-4" />
      </button>

      <Header />

      {/* 小组切换标签 */}
      <div className="px-4 md:px-6 pt-4">
        <div className="max-w-7xl mx-auto">
          <GroupTabs />
        </div>
      </div>

      <main className="flex-1 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 flex items-center justify-end gap-3">
            <button
              onClick={() => setShowPlayerPreview(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-sm border border-slate-700/50 hover:border-slate-600"
              title={t.previewAllPlayers}
            >
              <Users className="w-4 h-4" />
              <span>{t.previewPlayers}</span>
            </button>
            <button
              onClick={() => { setExportType('ranking'); setExportAllGroups(false); setIsExportOpen(true); }}
              disabled={currentGroup.currentRound === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700/50 hover:border-slate-600"
            >
              <Camera className="w-4 h-4" />
              <span>{t.exportImage}</span>
            </button>
            <button
              onClick={() => { setExcelType('ranking'); setIsExcelOpen(true); }}
              disabled={currentGroup.currentRound === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700/50 hover:border-slate-600"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{t.exportExcel}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-3 order-2 xl:order-1">
              <div className="h-[500px] xl:h-[calc(100vh-260px)] overflow-hidden">
                <PlayerRanking />
              </div>
            </div>

            <div className="xl:col-span-6 order-1 xl:order-2">
              <div className="h-[500px] xl:h-[calc(100vh-260px)] overflow-hidden">
                <MatchList testMode={testMode} />
              </div>
            </div>

            <div className="xl:col-span-3 order-3">
              <div className="h-[500px] xl:h-[calc(100vh-260px)] overflow-hidden">
                <ControlPanel
                  onShowConfirm={() => { setConfirmType('single'); setShowConfirm(true); }}
                  onShowConfirmAll={() => { setConfirmType('all'); setShowConfirm(true); }}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-600 space-y-0.5">
        <div>{language === 'en' ? 'Poetic Tournament Results System' : '诗意 · 比赛战绩统计系统'}</div>
        <div>{language === 'en' ? '© 2026 ShiyiPai. All rights reserved.' : '© 2026 ShiyiPai. 保留所有权利。'}</div>
      </footer>

      <Suspense fallback={null}>
        <ImageExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          initialType={exportType}
          exportAllGroups={exportAllGroups}
        />

        <ExcelExportModal
          isOpen={isExcelOpen}
          onClose={() => setIsExcelOpen(false)}
          initialType={excelType}
        />
      </Suspense>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={confirmType === 'single' ? (language === 'en' ? 'Confirm next round pairings' : '确认生成下一轮对阵') : (language === 'en' ? 'Confirm all groups start next round' : '确认全部小组开始下一轮')}
        message={
          confirmType === 'single'
            ? (language === 'en' ? `Current group: ${currentGroup.name}. The next round pairings will be generated.` : `当前小组：${currentGroup.name}，即将生成第 ${currentGroup.currentRound + 1} 轮对阵。`)
            : (language === 'en' ? 'All groups that have finished the current round will proceed to the next round.' : '即将为所有已完成当前轮的小组生成下一轮对阵。')
        }
        onConfirm={() => {
          setShowConfirm(false);
          if (confirmType === 'single') {
            const event = new CustomEvent('generate-next-round');
            window.dispatchEvent(event);
          } else {
            const event = new CustomEvent('generate-next-round-all');
            window.dispatchEvent(event);
          }
        }}
      >
        <RoundSummaryInfo confirmType={confirmType} />
        <PairingPreview confirmType={confirmType} />
      </ConfirmDialog>

      <Suspense fallback={null}>
        <HelpPage isOpen={showHelp} onClose={() => setShowHelp(false)} />

        <PlayerPreviewModal isOpen={showPlayerPreview} onClose={() => setShowPlayerPreview(false)} />
      </Suspense>

      {/* 撤回成功提示 toast */}
      {showUndoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-sm flex items-center gap-2 backdrop-blur-sm shadow-lg pointer-events-none">
          <Undo2 className="w-4 h-4" />
          {language === 'en' ? `Undid round ${currentGroup.currentRound + 1}` : `已撤回第 ${currentGroup.currentRound + 1} 轮`}
        </div>
      )}
    </div>
  );
}

function GroupTabs() {
  const { competition, setCurrentGroup } = useTournamentStore();
  const { language } = useLanguagePreference();

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      <span className="text-xs text-slate-500 mr-1">{language === 'en' ? 'Group switch:' : '小组切换：'}</span>
      {competition.groups.map((group, index) => {
        const isActive = index === competition.currentGroupIndex;
        return (
          <button
            key={group.id}
            onClick={() => setCurrentGroup(index)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap
              ${isActive
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/50'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
              }
            `}
          >
            {group.name}
            {group.status === 'in_progress' && (
              <span className="ml-1 text-xs text-slate-500">
                {language === 'en' ? `R${group.currentRound}/${group.totalRounds}` : `${group.currentRound}/${group.totalRounds}轮`}
              </span>
            )}
            {group.status === 'completed' && (
              <span className="ml-1 text-xs text-emerald-400">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function RoundSummaryInfo({ confirmType }: { confirmType: 'single' | 'all' }) {
  const { competition } = useTournamentStore();
  const currentGroup = useCurrentGroup();

  const groupsToShow = confirmType === 'single' ? [currentGroup] : competition.groups.filter(g => {
    if (g.status !== 'in_progress') return false;
    if (g.currentRound >= g.totalRounds) return false;
    const matches = g.matches.filter(m => m.round === g.currentRound);
    return matches.length > 0 && matches.every(m => m.result !== 'pending');
  });

  const totalDraws = groupsToShow.reduce((sum, g) => sum + g.matches.filter(m => m.round === g.currentRound && m.result === 'draw').length, 0);
  const totalByes = groupsToShow.reduce((sum, g) => sum + g.matches.filter(m => m.round === g.currentRound && m.isBye).length, 0);
  const totalDropped = groupsToShow.reduce((sum, g) => sum + g.players.filter(p => p.dropped).length, 0);

  return (
    <div className="mb-5 border-y border-slate-700/50 py-4">
      <div className="space-y-3 max-h-64 overflow-y-auto pr-1 -mr-1">
        {groupsToShow.map(group => {
          const drawMatches = group.matches.filter(m => m.round === group.currentRound && m.result === 'draw');
          const byeMatches = group.matches.filter(m => m.round === group.currentRound && m.isBye);
          const droppedPlayers = group.players.filter(p => p.dropped);

          if (drawMatches.length === 0 && byeMatches.length === 0 && droppedPlayers.length === 0) return null;

          const playerMap = new Map(group.players.map(p => [p.id, p.name]));

          return (
            <div key={group.id} className="space-y-2">
              {groupsToShow.length > 1 && (
                <div className="text-xs font-medium text-slate-300 sticky top-0 bg-slate-800/90 backdrop-blur-sm py-1 -my-1 rounded z-10">
                  {group.name} · 第{group.currentRound}轮
                </div>
              )}

              {drawMatches.length > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Scale className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="text-xs font-medium text-orange-300">双负比赛：{drawMatches.length} 场</span>
                  </div>
                  <div className="text-xs text-orange-400/80 space-y-0.5 pl-6 max-h-28 overflow-y-auto">
                    {drawMatches.map(m => (
                      <div key={m.id}>
                        {playerMap.get(m.player1Id) || '未知'} vs {playerMap.get(m.player2Id) || '未知'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {byeMatches.length > 0 && (
                <div className="bg-slate-600/20 border border-slate-600/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-300">轮空：{byeMatches.length} 人</span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-0.5 pl-6 max-h-28 overflow-y-auto">
                    {byeMatches.map(m => (
                      <div key={m.id}>
                        {playerMap.get(m.player1Id) || '未知'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {droppedPlayers.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <UserX className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="text-xs font-medium text-rose-300">弃赛选手：{droppedPlayers.length} 人</span>
                  </div>
                  <div className="text-xs text-rose-400/80 space-y-0.5 pl-6 max-h-28 overflow-y-auto">
                    {droppedPlayers.map(p => (
                      <div key={p.id}>{p.name}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {totalDraws === 0 && totalByes === 0 && totalDropped === 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-medium text-emerald-300">本轮无双负、无轮空、无弃赛情况</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 下一轮配对预览：在确认弹窗中提前展示即将生成的对阵，
 * 用户可据此判断是否需要调整（如手动弃赛、调整人数）后再确认生成。
 * 单小组模式直接展示当前小组的预览；全部小组模式仅展示当前小组作为样例。
 */
function PairingPreview({ confirmType }: { confirmType: 'single' | 'all' }) {
  const currentGroup = useCurrentGroup();
  const { competition } = useTournamentStore();

  // 选择要预览的小组：单小组模式预览当前小组；全部小组模式找第一个待生成下一轮的小组作为样例
  const previewGroup = useMemo(() => {
    if (confirmType === 'single') return currentGroup;
    return competition.groups.find(g => {
      if (g.status !== 'in_progress') return false;
      if (g.currentRound >= g.totalRounds) return false;
      const ms = g.matches.filter(m => m.round === g.currentRound);
      return ms.length > 0 && ms.every(m => m.result !== 'pending');
    }) ?? currentGroup;
  }, [confirmType, currentGroup, competition.groups]);

  const previewMatches = useMemo(() => {
    // 仅当小组处于进行中、当前轮已完赛、且还有下一轮时才预览
    if (previewGroup.status !== 'in_progress') return [];
    if (previewGroup.currentRound >= previewGroup.totalRounds) return [];
    const currentRoundMatches = previewGroup.matches.filter(m => m.round === previewGroup.currentRound);
    if (currentRoundMatches.length === 0 || !currentRoundMatches.every(m => m.result !== 'pending')) return [];

    const nextRound = previewGroup.currentRound + 1;
    const roundGameType = getRoundGameType(previewGroup, nextRound);
    try {
      const { matches } = generatePairings(
        previewGroup.players,
        nextRound,
        roundGameType,
        previewGroup.pairingType,
        previewGroup.matches
      );
      return matches;
    } catch {
      return [];
    }
  }, [previewGroup]);

  if (previewMatches.length === 0) return null;

  const playerMap = new Map(previewGroup.players.map(p => [p.id, p]));
  const playerName = (id: string) => id === 'bye' ? '轮空' : (playerMap.get(id)?.name ?? '未知');
  const byeCount = previewMatches.filter(m => m.isBye).length;
  const nextRound = previewGroup.currentRound + 1;

  // 排序：普通对阵在前，轮空在后
  const sorted = [...previewMatches].sort((a, b) => {
    if (a.isBye && !b.isBye) return 1;
    if (!a.isBye && b.isBye) return -1;
    return 0;
  });

  return (
    <div className="mb-5 border border-slate-700/50 rounded-lg overflow-hidden">
      <div className="bg-slate-800/60 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-3.5 h-3.5 text-gold-400" />
          <span className="text-xs font-medium text-slate-200">
            第 {nextRound} 轮配对预览
            {confirmType === 'all' && <span className="ml-1 text-slate-500">（样例：{previewGroup.name}）</span>}
          </span>
        </div>
        <span className="text-[10px] text-slate-500">
          共 {previewMatches.length} 场{byeCount > 0 && ` · ${byeCount} 轮空`}
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto p-2 space-y-1 bg-slate-900/40">
        {sorted.map((m, idx) => (
          <div
            key={m.id}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
              m.isBye ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-800/40'
            }`}
          >
            <span className="text-slate-500 font-mono w-6 shrink-0">#{String(idx + 1).padStart(2, '0')}</span>
            <span className={`flex-1 truncate ${m.isBye ? 'text-amber-300' : 'text-slate-200'}`}>
              {playerName(m.player1Id)}
            </span>
            <span className="text-slate-500 text-[10px]">vs</span>
            <span className={`flex-1 truncate text-right ${m.isBye ? 'text-amber-300' : 'text-slate-200'}`}>
              {playerName(m.player2Id)}
            </span>
          </div>
        ))}
      </div>
      <div className="px-3 py-1.5 text-[10px] text-slate-500 bg-slate-900/60 border-t border-slate-700/40">
        注：实际生成时配对可能因随机扰动略有差异（仅第 1 轮随机）；后续轮次基于战绩与避免重复对手原则生成。
      </div>
    </div>
  );
}
