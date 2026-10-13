import { PlayoffPanel } from './PlayoffPanel';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';
import {
  Users, Play, RotateCcw, Settings, AlertTriangle, Trophy, Edit2,
  Undo2, Plus, Minus, Download, FileUp, History,
  ShieldCheck, Swords
} from 'lucide-react';
import { useTournamentStore, useCurrentGroup, useIsCurrentRoundComplete } from '../../store/useTournamentStore';
import type { GameType, PairingType, TiebreakRule, TiebreakTemplate } from '../../types';
import { exportCompetitionToFile } from '../../utils/export/fileStorage';
import { getSingleEliminationRounds } from '../../utils/swissPairing';
import { validateRoster } from '../../utils/playerProfiles';
import {
  getDefaultTiebreakRules,
  getDefaultTiebreakTemplate,
  normalizeTiebreakRules,
} from '../../utils/tiebreak';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { BackupManager } from '../data/BackupManager';
import { AuditLogManager } from '../data/AuditLogManager';
import { DropoutManager } from '../players/DropoutManager';
import { PlayerManagerList } from '../players/PlayerManager';
import { TiebreakSettings } from './TiebreakSettings';
import { resolveRoundUndoMode } from './roundUndoMode';
import { EliminationBracketConfirmModal } from './EliminationBracketConfirmModal';
import { CompetitionRulesSummary } from './CompetitionRulesSummary';
import { StageAdvancementPanel } from './StageAdvancementPanel';
import { FinalStandingsPanel } from './FinalStandingsPanel';
import { getCompetitionKind, getOrderedStages, getStageGroups } from '../../utils/multiStage';

const QuickScoreModal = lazy(() =>
  import('../matches/QuickScoreModal').then(module => ({ default: module.QuickScoreModal }))
);
const MatchResultImportModal = lazy(() =>
  import('../matches/MatchResultImportModal').then(module => ({ default: module.MatchResultImportModal }))
);
const RosterProfilePanel = lazy(() =>
  import('../players/RosterProfilePanel').then(module => ({ default: module.RosterProfilePanel }))
);
const StorageHealthModal = lazy(() =>
  import('../data/StorageHealthModal').then(module => ({ default: module.StorageHealthModal }))
);
const HistoryManager = lazy(() =>
  import('../data/HistoryManager').then(module => ({ default: module.HistoryManager }))
);

interface ControlPanelProps {
  onShowConfirm: () => void;
  onShowConfirmAll?: () => void;
  setupLayout?: boolean;
}

function fitRoundGameTypes(
  values: GameType[] | undefined,
  length: number,
  fallback: GameType
): GameType[] {
  const next = (values ?? []).slice(0, length);
  while (next.length < length) next.push(fallback);
  return next;
}

export function ControlPanel({
  onShowConfirm,
  onShowConfirmAll,
  setupLayout = false,
}: ControlPanelProps) {
  const currentGroup = useCurrentGroup();
  const isCurrentRoundComplete = useIsCurrentRoundComplete();
  const navigate = useNavigate();
  const { language, t } = useLanguagePreference();
  const isEnglish = language === 'en';
  const {
    competition,
    startAllGroups,
    confirmEliminationBracketsAndStartAll,
    generateNextRound,
    generateNextRoundAllGroups,
    undoLastRound,
    returnToPreviousRound,
    returnToSetup,
    resetCompetition,
    updateCompetitionName,
    addGroup,
    removeGroup,
    applyGroupConfiguration,
    updateGroupName,
    setCurrentGroup,
  } = useTournamentStore();

  const competitionKind = getCompetitionKind(competition);
  const rulesTabLabel = competitionKind === 'poetry_cup_s3'
    ? (isEnglish ? 'S3 rules' : 'S3 规则说明')
    : competitionKind === 'multi_stage'
      ? (isEnglish ? 'Rules' : '规则说明')
      : null;
  const stagedLayout = rulesTabLabel !== null;
  const stageList = getOrderedStages(competition);
  const currentStage = stageList.find(stage => stage.groupIds.includes(currentGroup.id));
  const visibleGroups = stageList.length > 0
    ? [
        ...(currentStage ? getStageGroups(competition, currentStage) : []),
        // 兜底：不属于任何赛段的小组也要能切换，避免数据被界面藏起来。
        ...competition.groups.filter(group =>
          !group.stageId || !stageList.some(stage => stage.id === group.stageId)
        ),
      ]
    : competition.groups;

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [showBackupManager, setShowBackupManager] = useState(false);
  const [showStorageHealth, setShowStorageHealth] = useState(false);
  const [showHistoryManager, setShowHistoryManager] = useState(false);
  const [showQuickScore, setShowQuickScore] = useState(false);
  const [showResultImport, setShowResultImport] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [nameInput, setNameInput] = useState(competition.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [showFormatManager, setShowFormatManager] = useState(setupLayout);
  const [showPlayerManager, setShowPlayerManager] = useState(true);
  const [draftPairingType, setDraftPairingType] = useState<PairingType>(currentGroup.pairingType);
  const [draftGameType, setDraftGameType] = useState<GameType>(currentGroup.gameType);
  const [draftRoundGameTypes, setDraftRoundGameTypes] = useState<GameType[]>(() =>
    fitRoundGameTypes(currentGroup.roundGameTypes, currentGroup.totalRounds, currentGroup.gameType)
  );
  const [draftTiebreakTemplate, setDraftTiebreakTemplate] = useState<TiebreakTemplate>(
    currentGroup.tiebreakTemplate ?? getDefaultTiebreakTemplate(currentGroup.gameType)
  );
  const [draftTiebreakRules, setDraftTiebreakRules] = useState<TiebreakRule[]>(() =>
    normalizeTiebreakRules(currentGroup.tiebreakRules, currentGroup.gameType)
  );
  const [startConfirmTarget, setStartConfirmTarget] = useState<'single' | 'all' | null>(null);
  const [bracketConfirmIndices, setBracketConfirmIndices] = useState<number[] | null>(null);
  const [bracketConfirmAll, setBracketConfirmAll] = useState(false);
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null);
  const [editGroupNameValue, setEditGroupNameValue] = useState('');
  // 数字输入框字符串缓冲（允许清空编辑中间态）
  const [playerCountInput, setPlayerCountInput] = useState<string>(String(currentGroup.players.length));
  const [totalRoundsInput, setTotalRoundsInput] = useState<string>(String(currentGroup.totalRounds));
  const controlScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNameInput(competition.name);
  }, [competition.name]);

  // 赛事被重置或替换时，清除小组名/选手名/赛事名编辑态，避免残留 stale state
  useEffect(() => {
    setEditingGroupIndex(null);
    setEditGroupNameValue('');
    setIsEditingName(false);
  }, [competition.id]);

  useEffect(() => {
    setEditGroupNameValue(currentGroup.name);
  }, [currentGroup.id, currentGroup.name]);

  // 同步当前小组配置到赛制草稿。
  useEffect(() => {
    setPlayerCountInput(String(currentGroup.players.length));
    setTotalRoundsInput(String(currentGroup.totalRounds));
    setDraftPairingType(currentGroup.pairingType);
    setDraftGameType(currentGroup.gameType);
    setDraftRoundGameTypes(
      fitRoundGameTypes(currentGroup.roundGameTypes, currentGroup.totalRounds, currentGroup.gameType)
    );
    setDraftTiebreakTemplate(
      currentGroup.tiebreakTemplate ?? getDefaultTiebreakTemplate(currentGroup.gameType)
    );
    setDraftTiebreakRules(
      normalizeTiebreakRules(currentGroup.tiebreakRules, currentGroup.gameType)
    );
  }, [
    currentGroup.id,
    currentGroup.players.length,
    currentGroup.totalRounds,
    currentGroup.pairingType,
    currentGroup.gameType,
    currentGroup.roundGameTypes,
    currentGroup.tiebreakTemplate,
    currentGroup.tiebreakRules,
  ]);

  useEffect(() => {
    const handleGenerateNext = () => {
      generateNextRound();
    };
    const handleGenerateNextAll = () => {
      generateNextRoundAllGroups();
    };
    window.addEventListener('generate-next-round', handleGenerateNext);
    window.addEventListener('generate-next-round-all', handleGenerateNextAll);
    return () => {
      window.removeEventListener('generate-next-round', handleGenerateNext);
      window.removeEventListener('generate-next-round-all', handleGenerateNextAll);
    };
  }, [generateNextRound, generateNextRoundAllGroups]);

  const isSetup = currentGroup.status === 'setup';
  const isInProgress = currentGroup.status === 'in_progress';
  const isCompleted = currentGroup.status === 'completed';
  const roundUndoMode = resolveRoundUndoMode(currentGroup.currentRound, currentGroup.matches);
  // 任一小组已开始比赛时，禁止调整小组数量
  const hasAnyRound = competition.groups.some(g => g.currentRound > 0);
  const draftPlayerCount = Math.max(
    2,
    Math.min(200, parseInt(playerCountInput, 10) || currentGroup.players.length)
  );
  const draftRounds = Math.max(
    1,
    Math.min(20, parseInt(totalRoundsInput, 10) || currentGroup.totalRounds)
  );
  const draftEffectiveRounds = draftPairingType === 'single_elimination'
    ? getSingleEliminationRounds(draftPlayerCount)
    : draftRounds;
  const normalizedDraftRoundGameTypes = fitRoundGameTypes(
    draftRoundGameTypes,
    draftEffectiveRounds,
    draftGameType
  );
  const rosterValidation = validateRoster(competition);
  const groupsForStart = startConfirmTarget === 'all'
    ? competition.groups
    : [currentGroup];
  const startableGroupCount = competition.groups.filter(group =>
    group.status === 'setup' && group.players.length >= 2
  ).length;

  const handleDraftGameTypeChange = (gameType: GameType) => {
    setDraftGameType(gameType);
    setDraftRoundGameTypes(new Array(draftEffectiveRounds).fill(gameType));
    if (draftTiebreakTemplate === 'custom') {
      setDraftTiebreakRules(current => normalizeTiebreakRules(current, gameType));
    } else {
      setDraftTiebreakTemplate(getDefaultTiebreakTemplate(gameType));
      setDraftTiebreakRules(getDefaultTiebreakRules(gameType));
    }
  };

  const applyDraftConfiguration = (target: 'current' | 'all') => {
    applyGroupConfiguration(
      {
        playerCount: draftPlayerCount,
        rounds: draftRounds,
        gameType: draftGameType,
        pairingType: draftPairingType,
        roundGameTypes: normalizedDraftRoundGameTypes,
        tiebreakTemplate: draftTiebreakTemplate,
        tiebreakRules: draftTiebreakRules,
      },
      target
    );
    setShowFormatManager(false);
  };

  const systemTools = (
    <div className="grid grid-cols-2 gap-1.5 border-t border-slate-700/40 pt-2">
      <button
        onClick={() => setShowStorageHealth(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-800/30 py-1.5 text-[11px] text-slate-500 transition-colors hover:bg-emerald-500/5 hover:text-emerald-400"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        {isEnglish ? 'Storage health' : '存储体检'}
      </button>
      <button
        onClick={() => setShowBackupManager(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-800/30 py-1.5 text-[11px] text-slate-500 transition-colors hover:bg-sky-500/5 hover:text-sky-400"
      >
        <History className="w-3.5 h-3.5" />
        {isEnglish ? 'Backup manager' : '备份管理'}
      </button>
      <button
        onClick={() => setShowAuditLog(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-800/30 py-1.5 text-[11px] text-slate-500 transition-colors hover:bg-indigo-500/5 hover:text-indigo-400"
      >
        <History className="w-3.5 h-3.5" />
        {t.auditLog}
      </button>
      <button
        onClick={() => setShowHistoryManager(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-800/30 py-1.5 text-[11px] text-slate-500 transition-colors hover:bg-violet-500/5 hover:text-violet-400"
      >
        <History className="w-3.5 h-3.5" />
        {isEnglish ? 'Operation history' : '操作历史'}
      </button>
      <button
        onClick={() => setShowResetConfirm(true)}
        className="col-span-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-800/30 py-1.5 text-[11px] text-slate-500 transition-colors hover:bg-rose-500/5 hover:text-rose-400"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        {isEnglish ? 'Reset tournament' : '重置比赛'}
      </button>
    </div>
  );

  const competitionDataContent = (
    <div className="space-y-4">
      <section className="space-y-3">
        {/* 设置布局下已有「赛事数据」标签，这里不再重复标题 */}
        {!setupLayout && (
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Settings className="h-3.5 w-3.5 text-gold-400" />
            {isEnglish ? 'Tournament data' : '赛事数据'}
          </div>
        )}

        {isEditingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  updateCompetitionName(nameInput);
                  setIsEditingName(false);
                }
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-gold-500/50 bg-slate-700 px-3 py-1.5 text-sm text-white focus:outline-none"
            />
            <button
              onClick={() => { updateCompetitionName(nameInput); setIsEditingName(false); }}
              className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/30"
            >
              {isEnglish ? 'Save' : '保存'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            className="flex w-full items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-700/50"
          >
            <span className="truncate">{competition.name}</span>
            <Edit2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          </button>
        )}

        <button
          onClick={() => exportCompetitionToFile(competition)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 px-2 py-2 text-[11px] text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-white"
        >
          <Download className="h-3.5 w-3.5" />
          {isEnglish ? 'Export data' : '导出比赛数据'}
        </button>
      </section>

      {isSetup && currentGroup.players.length >= 2 && (
        <section className="space-y-2 border-t border-slate-700/50 pt-3">
          <div className="text-xs font-medium text-slate-300">
            {isEnglish ? 'Start event' : '开始比赛'}
          </div>
          {!rosterValidation.valid && (
            <div className="rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-300">
              {isEnglish
                ? `${rosterValidation.issues.length} roster issues must be resolved before starting.`
                : `还有 ${rosterValidation.issues.length} 项选手档案异常，处理后才能开赛。`}
            </div>
          )}
          <button
            onClick={() => setStartConfirmTarget('all')}
            disabled={!rosterValidation.valid}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2 py-2 text-[10px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Play className="h-3.5 w-3.5" />
            {isEnglish ? 'Start all groups' : '全部小组同时开赛'}
          </button>
        </section>
      )}

      {isSetup && (
        <section className="border-t border-slate-700/50 pt-3">
          <Suspense fallback={null}>
            <RosterProfilePanel />
          </Suspense>
        </section>
      )}
      {setupLayout && (
        <section className="border-t border-slate-700/50 pt-3">
          {systemTools}
        </section>
      )}
    </div>
  );

  return (
    <div className={`flex flex-col border border-slate-700/40 rounded-2xl bg-slate-800/40 ${
      setupLayout
        ? 'overflow-visible xl:h-full xl:min-h-0 xl:overflow-hidden'
        : 'h-full overflow-hidden'
    }`}>
      {/* 赛事名称 */}
      {!setupLayout && (
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-gold-400" />
            {isEnglish ? 'Tournament settings' : '赛事设置'}
          </h2>
        </div>

        {isEditingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  updateCompetitionName(nameInput);
                  setIsEditingName(false);
                }
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              autoFocus
              className="flex-1 px-3 py-1.5 bg-slate-700 border border-gold-500/50 rounded-lg text-sm text-white focus:outline-none"
            />
            <button
              onClick={() => { updateCompetitionName(nameInput); setIsEditingName(false); }}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs"
            >
              {isEnglish ? 'Save' : '保存'}
            </button>
          </div>
        ) : (
          <div
            onClick={() => setIsEditingName(true)}
            className="px-3 py-2 bg-slate-800/50 rounded-lg text-sm text-slate-300 cursor-pointer hover:bg-slate-700/50 transition-colors flex items-center justify-between"
          >
            <span>{competition.name}</span>
            <Edit2 className="w-3.5 h-3.5 text-slate-500" />
          </div>
        )}

        {/* 文件操作 */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => exportCompetitionToFile(competition)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-xs border border-slate-700/50"
          >
            <Download className="w-3.5 h-3.5" />
            {isEnglish ? 'Export tournament data' : '导出比赛数据'}
          </button>
        </div>
      </div>
      )}

      {/* 当前小组指示器 */}
      <div className="px-4 py-2.5 border-b border-slate-700/50 bg-slate-800/20">
        {stageList.length > 0 && (
          <div className="mb-2 flex min-w-0 gap-1 overflow-x-auto">
            {stageList.map(stage => {
              const isActiveStage = currentStage?.id === stage.id;
              const firstGroupIndex = competition.groups.findIndex(
                group => group.id === stage.groupIds[0]
              );
              return (
                <button
                  key={stage.id}
                  onClick={() => {
                    if (firstGroupIndex >= 0) setCurrentGroup(firstGroupIndex);
                  }}
                  className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    isActiveStage
                      ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
                      : 'border-slate-700/60 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  {stage.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 shrink-0">{isEnglish ? 'Current group' : '当前小组'}</span>
          {editingGroupIndex === competition.currentGroupIndex ? (
            <input
              autoFocus
              value={editGroupNameValue}
              onChange={event => setEditGroupNameValue(event.target.value)}
              onBlur={() => {
                if (editGroupNameValue.trim()) {
                  updateGroupName(competition.currentGroupIndex, editGroupNameValue);
                }
                setEditingGroupIndex(null);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' && editGroupNameValue.trim()) {
                  updateGroupName(competition.currentGroupIndex, editGroupNameValue);
                  setEditingGroupIndex(null);
                } else if (event.key === 'Escape') {
                  setEditingGroupIndex(null);
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-gold-500/50 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 outline-none"
            />
          ) : (
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {visibleGroups.map((group, index) => {
                const groupIndex = stageList.length > 0
                  ? competition.groups.findIndex(item => item.id === group.id)
                  : index;
                const isActive = groupIndex === competition.currentGroupIndex;
                return (
                  <button
                    key={group.id}
                    onClick={() => setCurrentGroup(groupIndex)}
                    className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-gold-500/50 bg-gold-500/15 text-gold-400'
                        : 'border-slate-700/60 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    {group.name}
                  </button>
                );
              })}
            </div>
          )}
          {stageList.length === 0 && (
            <button
              onClick={() => addGroup()}
              className="shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-1 text-emerald-300 hover:bg-emerald-500/20"
              title={isEnglish ? 'Add group' : '添加小组'}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => {
              setEditingGroupIndex(competition.currentGroupIndex);
              setEditGroupNameValue(currentGroup.name);
            }}
            className="shrink-0 rounded-md border border-slate-700/60 bg-slate-800/50 p-1 text-slate-400 hover:text-gold-300"
            title={isEnglish ? 'Rename current group' : '修改当前小组名称'}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          {stageList.length === 0 && (
            <button
              onClick={() => removeGroup(competition.currentGroupIndex)}
              disabled={competition.groups.length <= 1}
              className="shrink-0 rounded-md border border-rose-500/25 bg-rose-500/10 p-1 text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-30"
              title={isEnglish ? 'Delete current group' : '删除当前小组'}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-slate-600 shrink-0">
            {currentGroup.players.length}{isEnglish ? '' : '人'}
          </span>
        </div>
      </div>

      {!setupLayout && isSetup && (
        <div className="border-b border-slate-700/50 px-4 py-3">
          <Suspense fallback={null}>
            <RosterProfilePanel />
          </Suspense>
        </div>
      )}

      {setupLayout && (
      <div className="grid grid-cols-3 border-b border-slate-700/50 bg-slate-800/40 sm:grid-cols-[minmax(190px,0.9fr)_minmax(0,1.5fr)_minmax(180px,0.85fr)] xl:grid-cols-[340px_minmax(460px,1fr)_280px]">
        {isSetup && (
          <button
            onClick={() => {
              setShowFormatManager(!showFormatManager);
              controlScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`order-1 flex items-center justify-center gap-1.5 border-l border-slate-700/50 px-1 py-2.5 text-[10px] font-medium transition-colors sm:order-none sm:px-2 sm:text-xs ${
              showFormatManager ? 'bg-gold-500/10 text-gold-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {rulesTabLabel
              ? <ShieldCheck className="w-3.5 h-3.5" />
              : <Settings className="w-3.5 h-3.5" />}
            <span className="truncate">{rulesTabLabel ?? (isEnglish ? 'Format' : '赛制管理')}</span>
          </button>
        )}
        {isSetup && (
          <button
            onClick={() => setShowPlayerManager(current => !current)}
            className={`order-2 flex items-center justify-center gap-1.5 border-l border-slate-700/50 px-1 py-2.5 text-[10px] font-medium transition-colors sm:order-none sm:px-2 sm:text-xs ${
              showPlayerManager ? 'bg-gold-500/10 text-gold-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="truncate">{isEnglish ? 'Players' : '选手管理'}</span>
          </button>
        )}
        {setupLayout && (
          <div className="order-3 flex items-center justify-center gap-1.5 border-l border-slate-700/50 px-1 py-2.5 text-[10px] font-medium text-slate-300 sm:order-none sm:px-2 sm:text-xs">
            <Settings className="w-3.5 h-3.5 text-gold-400" />
            {isEnglish ? 'Data' : '赛事数据'}
          </div>
        )}
      </div>
      )}

      <div className={setupLayout
        ? (stagedLayout
            ? 'grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(190px,0.9fr)_minmax(0,1.5fr)_minmax(180px,0.85fr)]'
            : 'grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(190px,0.9fr)_minmax(0,1.5fr)_minmax(180px,0.85fr)] xl:grid-cols-[340px_minmax(460px,1fr)_280px]')
        : 'contents'}>
      {setupLayout && (
        <div className="order-3 min-w-0 border-b border-slate-700/50 p-4 sm:order-none sm:col-start-3 sm:row-start-1 sm:min-h-0 sm:overflow-y-auto sm:border-b-0 sm:border-l">
          {competitionDataContent}
        </div>
      )}
      <div
        ref={controlScrollRef}
        className={setupLayout
          ? 'order-1 grid min-w-0 grid-cols-1 overflow-visible sm:order-none sm:col-span-2 sm:col-start-1 sm:row-start-1 sm:min-h-0 sm:grid-cols-[minmax(190px,0.9fr)_minmax(0,1.5fr)] sm:overflow-hidden xl:grid-cols-[340px_minmax(460px,1fr)]'
          : 'flex-1 overflow-y-auto p-4 space-y-4'}
      >
        {/* 赛制管理：折叠后不再占位 */}
        {isSetup && showFormatManager && (
          <div className={setupLayout
            ? 'min-w-0 overflow-visible border-b border-slate-700/50 p-4 sm:min-h-full sm:overflow-y-auto sm:border-b-0 sm:border-r'
            : 'space-y-3'}
          >
            {rulesTabLabel ? <CompetitionRulesSummary /> : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-500">{isEnglish ? 'Pairing type' : '配对方式'}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setDraftPairingType('swiss')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        draftPairingType === 'swiss'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      {isEnglish ? 'Swiss' : '瑞士轮'}
                    </button>
                    <button
                      onClick={() => setDraftPairingType('single_elimination')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        draftPairingType === 'single_elimination'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      {isEnglish ? 'Single elimination' : '单败淘汰'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-500">{isEnglish ? 'Match length' : '比赛局数'}</label>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => handleDraftGameTypeChange('bo1')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        draftGameType === 'bo1'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      BO1
                    </button>
                    <button
                      onClick={() => handleDraftGameTypeChange('bo3')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        draftGameType === 'bo3'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      BO3
                    </button>
                    <button
                      onClick={() => handleDraftGameTypeChange('bo5')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        draftGameType === 'bo5'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      BO5
                    </button>
                    <button
                      onClick={() => handleDraftGameTypeChange('bo7')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        draftGameType === 'bo7'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      BO7
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-500">{t.setPlayerCount}</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min="2" max="100"
                      value={draftPlayerCount}
                      onChange={e => setPlayerCountInput(e.target.value)}
                      className="flex-1 accent-gold-500"
                    />
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      value={playerCountInput}
                      onChange={e => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setPlayerCountInput('');
                          return;
                        }
                        if (!/^\d+$/.test(raw)) return;
                        const num = parseInt(raw, 10);
                        if (isNaN(num)) return;
                        const v = Math.max(2, Math.min(100, num));
                        setPlayerCountInput(String(v));
                      }}
                      onBlur={() => {
                        const num = parseInt(playerCountInput, 10);
                        if (isNaN(num) || num < 2) {
                          setPlayerCountInput(String(currentGroup.players.length));
                        } else {
                          setPlayerCountInput(String(Math.max(2, Math.min(100, num))));
                        }
                      }}
                      className="w-14 px-2 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-center font-mono text-gold-400 font-bold text-sm focus:outline-none focus:border-gold-500/30"
                    />
                  </div>
                </div>

                {draftPairingType !== 'single_elimination' ? (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-500">{isEnglish ? 'Set rounds' : '设置轮次'}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min="1" max="20"
                        value={draftRounds}
                        onChange={e => setTotalRoundsInput(e.target.value)}
                        className="flex-1 accent-gold-500"
                      />
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={totalRoundsInput}
                        disabled={currentGroup.status !== 'setup'}
                        onChange={e => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setTotalRoundsInput('');
                            return;
                          }
                          if (!/^\d+$/.test(raw)) return;
                          const num = parseInt(raw, 10);
                          if (isNaN(num)) return;
                          const v = Math.max(1, Math.min(20, num));
                          setTotalRoundsInput(String(v));
                        }}
                        onBlur={() => {
                          const num = parseInt(totalRoundsInput, 10);
                          if (isNaN(num) || num < 1) {
                            setTotalRoundsInput(String(currentGroup.totalRounds));
                          } else {
                            setTotalRoundsInput(String(Math.max(1, Math.min(20, num))));
                          }
                        }}
                        className="w-14 px-2 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-center font-mono text-gold-400 font-bold text-sm focus:outline-none focus:border-gold-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-500">{isEnglish ? 'Rounds (auto-calculated)' : '轮次（自动计算）'}</label>
                    <div className="px-3 py-2 bg-slate-800/30 rounded-lg text-sm text-slate-400">
                      {isEnglish
                        ? `Total ${draftEffectiveRounds} rounds (auto-calculated from ${draftPlayerCount} players)`
                        : (
                          <>
                            共 <span className="font-mono text-gold-400 font-bold">{draftEffectiveRounds}</span>
                            {' '}轮（根据 {draftPlayerCount} 人自动计算）
                          </>
                        )}
                    </div>
                  </div>
                )}

                {draftPairingType === 'single_elimination' && (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-500">{isEnglish ? 'Match length per round' : '每轮比赛局数'}</label>
                    <div className="space-y-1.5">
                      {Array.from({ length: draftEffectiveRounds }, (_, i) => i + 1).map(round => (
                        <div key={round} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-10">{isEnglish ? `Round ${round}` : `第${round}轮`}</span>
                          <div className="flex-1 grid grid-cols-4 gap-1.5">
                            {(['bo1', 'bo3', 'bo5', 'bo7'] as GameType[]).map(gt => (
                              <button
                                key={gt}
                                onClick={() => {
                                  const next = [...normalizedDraftRoundGameTypes];
                                  next[round - 1] = gt;
                                  setDraftRoundGameTypes(next);
                                }}
                                className={`py-1 rounded text-[10px] font-medium transition-colors ${
                                  normalizedDraftRoundGameTypes[round - 1] === gt
                                    ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                                }`}
                              >
                                {gt.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {draftPairingType === 'swiss' && (
                  <TiebreakSettings
                    gameType={draftGameType}
                    template={draftTiebreakTemplate}
                    rules={draftTiebreakRules}
                    onChange={(template, rules) => {
                      setDraftTiebreakTemplate(template);
                      setDraftTiebreakRules(rules);
                    }}
                  />
                )}

                <div className="grid grid-cols-2 gap-2 border-t border-slate-700/50 pt-3">
                  <button
                    onClick={() => applyDraftConfiguration('current')}
                    className="rounded-lg border border-gold-500/30 bg-gold-500/15 px-3 py-2 text-xs font-medium text-gold-400 transition-colors hover:bg-gold-500/25"
                  >
                    {isEnglish ? 'Apply to this group' : '适用于本小组'}
                  </button>
                  <button
                    onClick={() => applyDraftConfiguration('all')}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
                  >
                    {isEnglish ? 'Apply to all groups' : '适用于全部小组'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isSetup && showPlayerManager && (
          <div
            data-testid="player-management-scroll"
            className={setupLayout
              ? 'min-w-0 overflow-x-auto overflow-y-visible p-4 sm:min-h-full sm:overflow-y-auto'
              : ''}
          >
            <PlayerManagerList />
          </div>
        )}

        {/* 比赛控制 */}
        {!setupLayout && (
          <div className="space-y-3">
          {isInProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  {isEnglish ? `Round ${currentGroup.currentRound}/${currentGroup.totalRounds}` : `第 ${currentGroup.currentRound}/${currentGroup.totalRounds} 轮`}
                </span>
                <span className="text-gold-400 font-semibold">
                  {currentGroup.matches.filter(m => m.round === currentGroup.currentRound && m.result !== 'pending').length} / {currentGroup.matches.filter(m => m.round === currentGroup.currentRound).length} {isEnglish ? 'matches complete' : '场完成'}
                </span>
              </div>

              {roundUndoMode !== 'none' && (
                <button
                  onClick={() => setShowUndoConfirm(true)}
                  className={`w-full py-2 rounded-lg transition-colors text-xs flex items-center justify-center gap-2 border ${
                    roundUndoMode === 'clear-results'
                      ? 'border-orange-500/25 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                      : 'border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                  }`}
                  title={roundUndoMode === 'clear-results'
                    ? (isEnglish
                        ? 'Clear this round results and keep the pairings for re-entry.'
                        : '清除本轮赛果并保留对阵，便于重新录入。')
                    : roundUndoMode === 'return-previous'
                      ? (isEnglish
                          ? 'No result has been entered in this round; remove its pairings and return to the previous round.'
                          : '本轮尚未录入赛果，将删除本轮对阵并退回上一轮。')
                      : (isEnglish
                          ? 'No result has been entered in round one; return to the pre-start setup.'
                          : '第一轮尚未录入赛果，将返回开赛前设置。')}
                >
                  <Undo2 className="w-4 h-4" />
                  {roundUndoMode === 'clear-results'
                    ? (isEnglish
                        ? `Clear round ${currentGroup.currentRound} results`
                        : `撤回第${currentGroup.currentRound}轮赛果`)
                    : roundUndoMode === 'return-previous'
                      ? (isEnglish
                          ? `Return to round ${currentGroup.currentRound - 1}`
                          : `撤回至第${currentGroup.currentRound - 1}轮`)
                      : (isEnglish ? 'Return to setup' : '撤回至开赛设置')}
                </button>
              )}

              {!isCurrentRoundComplete && currentGroup.currentRound > 0 && (
                <div className="text-center text-xs text-amber-400 bg-amber-500/10 rounded-lg py-2 px-3">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                  {isEnglish ? 'Please finish all matches in the current round first.' : '请先完成当前轮所有比赛'}
                </div>
              )}
            </div>
          )}

          <DropoutManager />
          <StageAdvancementPanel />
          <FinalStandingsPanel />

          {isCompleted && (
            <div className="text-center py-3">
              <Trophy className="w-6 h-6 text-gold-400 mx-auto mb-1.5" />
              <p className="text-gold-400 font-semibold text-sm">{t.matchEnded}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatText(t.matchEndedRounds, { rounds: currentGroup.totalRounds })}
              </p>
              {currentGroup.pairingType === 'swiss' && <PlayoffPanel key={currentGroup.id} />}
            </div>
          )}

          {systemTools}
          </div>
        )}
      </div>
      </div>

      {/* 底部固定操作区：开赛、录分、导入结果和生成下一轮始终可见 */}
      {(
        hasAnyRound
        || (isInProgress && isCurrentRoundComplete && currentGroup.currentRound < currentGroup.totalRounds)
      ) && (
        <div className="shrink-0 space-y-2 border-t border-slate-700/50 bg-slate-800/60 p-3">
          {hasAnyRound && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowQuickScore(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 py-2.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
              >
                <Swords className="w-4 h-4" />
                {isEnglish ? 'Quick score entry' : '快速录分'}
              </button>
              <button
                onClick={() => setShowResultImport(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/15 py-2.5 text-sm font-medium text-sky-300 transition-colors hover:bg-sky-500/25"
              >
                <FileUp className="w-4 h-4" />
                {isEnglish ? 'Import results' : '导入赛果'}
              </button>
            </div>
          )}

          {isInProgress && isCurrentRoundComplete && currentGroup.currentRound < currentGroup.totalRounds && (
            <>
              <button
                onClick={onShowConfirm}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gold-500/40 bg-gold-500/20 py-2.5 text-sm font-medium text-gold-400 transition-colors hover:bg-gold-500/30"
              >
                <Play className="w-4 h-4" />
                {t.generateNextRound}
              </button>
              {competition.groups.length > 1 && competition.groups.some(group => {
                if (group.status !== 'in_progress') return false;
                if (group.currentRound >= group.totalRounds) return false;
                const matches = group.matches.filter(match => match.round === group.currentRound);
                return matches.length > 0 && matches.every(match => match.result !== 'pending');
              }) && (
                <button
                  onClick={() => { onShowConfirmAll?.(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/15 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
                >
                  <Play className="w-4 h-4" />
                  {t.allGroupsNextRound}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* 重置确认（统一使用自制 ConfirmDialog） */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title={t.confirmResetTitle}
        message={t.confirmResetMsg}
        confirmText={t.resetNow}
        onConfirm={() => {
          resetCompetition();
          navigate('/');
        }}
      />

      {/* 撤回确认（替代 window.confirm） */}
      <ConfirmDialog
        isOpen={showUndoConfirm}
        onClose={() => setShowUndoConfirm(false)}
        title={roundUndoMode === 'clear-results'
          ? t.confirmUndoTitle
          : roundUndoMode === 'return-previous'
            ? (isEnglish ? 'Return to previous round' : '撤回至上一轮')
            : (isEnglish ? 'Return to setup' : '撤回至开赛设置')}
        message={roundUndoMode === 'clear-results'
          ? formatText(t.confirmUndoMsg, { round: currentGroup.currentRound })
          : roundUndoMode === 'return-previous'
            ? (isEnglish
                ? `No result has been entered in round ${currentGroup.currentRound}. Remove its pairings and return to round ${currentGroup.currentRound - 1}?`
                : `第 ${currentGroup.currentRound} 轮尚未录入赛果，确定删除本轮对阵并退回第 ${currentGroup.currentRound - 1} 轮吗？`)
            : (isEnglish
                ? 'No result has been entered in round one. Remove the first-round pairings and return to setup?'
                : '第一轮尚未录入赛果，确定删除第一轮对阵并返回开赛前设置吗？')}
        confirmText={roundUndoMode === 'clear-results'
          ? t.undoNow
          : (isEnglish ? 'Return' : '确认撤回')}
        onConfirm={() => {
          if (roundUndoMode === 'return-previous') returnToPreviousRound();
          else if (roundUndoMode === 'return-setup') returnToSetup();
          else undoLastRound();
        }}
      />

      {/* 开赛前赛事信息确认 */}
      <ConfirmDialog
        isOpen={startConfirmTarget !== null}
        onClose={() => setStartConfirmTarget(null)}
        title={isEnglish ? 'Confirm tournament information' : '确认赛事信息'}
        message={isEnglish
          ? 'Review the event information below. Confirming locks the roster and generates the first-round pairings.'
          : '请确认以下赛事信息。确认后将锁定选手档案并生成第一轮对阵。'}
        confirmText={isEnglish ? 'Confirm and start' : '确认并开始比赛'}
        onConfirm={() => {
          setStartConfirmTarget(null);
          const eliminationIndices = competition.groups
            .map((group, index) => ({ group, index }))
            .filter(({ group }) =>
              group.pairingType === 'single_elimination'
              && group.status === 'setup'
              && group.players.length >= 2
            )
            .map(({ index }) => index);
          if (eliminationIndices.length > 0) {
            setBracketConfirmAll(true);
            setBracketConfirmIndices(eliminationIndices);
          } else {
            startAllGroups();
          }
        }}
      >
        <div className="space-y-3 pb-2">
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/45 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {isEnglish ? 'Tournament' : '赛事名称'}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-100">{competition.name}</div>
          </div>

          <div className="space-y-2">
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-[11px] text-slate-400">
              {isEnglish
                ? `${competition.groups.length} groups total, ${startableGroupCount} ready to start together.`
                : `共 ${competition.groups.length} 个小组，其中 ${startableGroupCount} 个将同时开始比赛。`}
            </div>
            {groupsForStart.map(group => {
              const roundTypes = fitRoundGameTypes(
                group.roundGameTypes,
                group.totalRounds,
                group.gameType
              );
              const willStart = group.status === 'setup' && group.players.length >= 2;
              const statusLabel = group.status === 'setup'
                ? willStart
                  ? (isEnglish ? 'Will start' : '将开赛')
                  : (isEnglish ? 'Needs at least 2 players' : '人数不足，无法开赛')
                : group.status === 'in_progress'
                  ? (isEnglish ? 'Already started' : '已经开赛')
                  : (isEnglish ? 'Completed' : '已完成');
              const uniformGameType = roundTypes.every(type => type === roundTypes[0]);
              const tiebreakLabel = group.tiebreakTemplate === 'standard_bo1'
                ? (isEnglish ? 'Standard BO1' : '标准 BO1')
                : group.tiebreakTemplate === 'custom'
                  ? (isEnglish ? 'Custom' : '自定义')
                  : (isEnglish ? 'Standard multi-game' : '标准多局');

              return (
                <div
                  key={group.id}
                  className={`rounded-lg border p-3 ${
                    willStart
                      ? 'border-slate-700/60 bg-slate-900/35'
                      : 'border-slate-700/40 bg-slate-900/20 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-100">{group.name}</span>
                    <span className={`rounded px-2 py-1 text-[10px] ${
                      willStart
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-slate-700/40 text-slate-400'
                    }`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded border border-slate-700/60 bg-slate-800/70 px-2 py-1 text-slate-300">
                      {group.players.length}{isEnglish ? ' players' : '人'}
                    </span>
                    <span className="rounded border border-slate-700/60 bg-slate-800/70 px-2 py-1 text-slate-300">
                      {group.pairingType === 'swiss'
                        ? (isEnglish ? 'Swiss' : '瑞士轮')
                        : (isEnglish ? 'Single elimination' : '单败淘汰')}
                    </span>
                    <span className="rounded border border-slate-700/60 bg-slate-800/70 px-2 py-1 text-slate-300">
                      {group.totalRounds}{isEnglish ? ' rounds' : '轮'}
                    </span>
                    <span className="rounded border border-slate-700/60 bg-slate-800/70 px-2 py-1 text-slate-300">
                      {uniformGameType
                        ? roundTypes[0]?.toUpperCase()
                        : roundTypes.map(type => type.toUpperCase()).join(' / ')}
                    </span>
                    {group.pairingType === 'swiss' && (
                      <span className="rounded border border-slate-700/60 bg-slate-800/70 px-2 py-1 text-slate-300">
                        {isEnglish ? 'Tiebreak: ' : '破分链：'}{tiebreakLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ConfirmDialog>

      <EliminationBracketConfirmModal
        isOpen={bracketConfirmIndices !== null}
        onClose={() => setBracketConfirmIndices(null)}
        groupIndices={bracketConfirmIndices ?? []}
        title={bracketConfirmIndices && bracketConfirmIndices.length > 1
          ? (isEnglish ? 'Confirm all elimination brackets' : '确认全部单败签表')
          : (isEnglish ? 'Confirm elimination bracket' : '确认单败签表')}
        confirmLabel={bracketConfirmIndices && bracketConfirmIndices.length > 1
          ? (isEnglish ? 'Confirm all and start' : '确认全部并开始')
          : (isEnglish ? 'Confirm and start' : '确认并开始')}
        onConfirm={() => {
          if (!bracketConfirmIndices) return;
          if (bracketConfirmAll) {
            confirmEliminationBracketsAndStartAll(bracketConfirmIndices);
          } else {
            useTournamentStore.getState().confirmEliminationBracket(bracketConfirmIndices[0]);
          }
          setBracketConfirmIndices(null);
        }}
      />

      {/* 备份管理面板 */}
      <BackupManager
        isOpen={showBackupManager}
        onClose={() => setShowBackupManager(false)}
      />
      <Suspense fallback={null}>
        <StorageHealthModal
          isOpen={showStorageHealth}
          onClose={() => setShowStorageHealth(false)}
        />
        <HistoryManager
          isOpen={showHistoryManager}
          onClose={() => setShowHistoryManager(false)}
        />
        <QuickScoreModal
          isOpen={showQuickScore}
          onClose={() => setShowQuickScore(false)}
        />
        <MatchResultImportModal
          isOpen={showResultImport}
          onClose={() => setShowResultImport(false)}
        />
      </Suspense>
      <AuditLogManager
        isOpen={showAuditLog}
        onClose={() => setShowAuditLog(false)}
      />
    </div>
  );
}
