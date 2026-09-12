import { PlayoffPanel } from './PlayoffPanel';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';
import {
  Users, Play, RotateCcw, Settings, AlertTriangle, Trophy, Edit2,
  Undo2, Plus, Minus, ChevronDown, ChevronUp, Download, FileUp, Layers, History,
  ShieldCheck, Swords
} from 'lucide-react';
import { useTournamentStore, useCurrentGroup, useIsCurrentRoundComplete } from '../../store/useTournamentStore';
import type { GameType, PairingType } from '../../types';
import { exportCompetitionToFile, importCompetitionFromFile } from '../../utils/export/fileStorage';
import { downloadErrorReport } from '../../utils/errorReport';
import { getSingleEliminationRounds } from '../../utils/swissPairing';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { BackupManager } from '../data/BackupManager';
import { AuditLogManager } from '../data/AuditLogManager';
import { DropoutManager } from '../players/DropoutManager';
import { PlayerManager } from '../players/PlayerManager';
import { TiebreakSettings } from './TiebreakSettings';

const QuickScoreModal = lazy(() =>
  import('../matches/QuickScoreModal').then(module => ({ default: module.QuickScoreModal }))
);
const StorageHealthModal = lazy(() =>
  import('../data/StorageHealthModal').then(module => ({ default: module.StorageHealthModal }))
);

interface ControlPanelProps {
  onShowConfirm: () => void;
  onShowConfirmAll?: () => void;
}

export function ControlPanel({ onShowConfirm, onShowConfirmAll }: ControlPanelProps) {
  const currentGroup = useCurrentGroup();
  const isCurrentRoundComplete = useIsCurrentRoundComplete();
  const { language, t } = useLanguagePreference();
  const isEnglish = language === 'en';
  const {
    competition,
    startTournament,
    startAllGroups,
    generateNextRound,
    generateNextRoundAllGroups,
    undoLastRound,
    resetCompetition,
    updateCompetitionName,
    setPlayerCount,
    setTotalRounds,
    setGameType,
    setPairingType,
    setRoundGameType,
    addGroup,
    removeGroup,
    setGroupCount,
    batchSetGroupConfig,
    updateGroupName,
    importCompetition,
    setCurrentGroup,
  } = useTournamentStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [showBackupManager, setShowBackupManager] = useState(false);
  const [showStorageHealth, setShowStorageHealth] = useState(false);
  const [showQuickScore, setShowQuickScore] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [nameInput, setNameInput] = useState(competition.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showFormatManager, setShowFormatManager] = useState(false);
  const [showBatchSettings, setShowBatchSettings] = useState(false);
  const [batchPlayerCount, setBatchPlayerCount] = useState(32);
  const [batchRounds, setBatchRounds] = useState(5);
  const [batchGameType, setBatchGameType] = useState<GameType>('bo1');
  const [batchPairingType, setBatchPairingType] = useState<PairingType>('swiss');
  const [batchRoundGameTypes, setBatchRoundGameTypes] = useState<GameType[]>([]);
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null);
  const [editGroupNameValue, setEditGroupNameValue] = useState('');
  const [groupCountInput, setGroupCountInput] = useState<string>(String(competition.groups.length));
  // 数字输入框字符串缓冲（允许清空编辑中间态）
  const [playerCountInput, setPlayerCountInput] = useState<string>(String(currentGroup.players.length));
  const [batchPlayerCountInput, setBatchPlayerCountInput] = useState<string>(String(batchPlayerCount));
  const [batchRoundsInput, setBatchRoundsInput] = useState<string>(String(batchRounds));
  const [totalRoundsInput, setTotalRoundsInput] = useState<string>(String(currentGroup.totalRounds));
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorFile, setImportErrorFile] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameInput(competition.name);
  }, [competition.name]);

  // 赛事被重置或替换时，清除小组名/选手名/赛事名编辑态，避免残留 stale state
  useEffect(() => {
    setEditingGroupIndex(null);
    setEditGroupNameValue('');
    setIsEditingName(false);
    setImportError(null);
  }, [competition.id]);

  // 同步小组数量输入框与实际小组数
  useEffect(() => {
    setGroupCountInput(String(competition.groups.length));
  }, [competition.groups.length]);

  // 同步参赛人数 / 批量人数 / 批量轮次输入框（响应式回填，不打断编辑）
  useEffect(() => {
    setPlayerCountInput(String(currentGroup.players.length));
  }, [currentGroup.players.length]);

  useEffect(() => {
    setBatchPlayerCountInput(String(batchPlayerCount));
  }, [batchPlayerCount]);

  useEffect(() => {
    setBatchRoundsInput(String(batchRounds));
  }, [batchRounds]);

  useEffect(() => {
    setTotalRoundsInput(String(currentGroup.totalRounds));
  }, [currentGroup.totalRounds]);

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
  // 任一小组已开始比赛时，禁止调整小组数量
  const hasAnyStarted = competition.groups.some(g => g.status !== 'setup');
  const hasAnyRound = competition.groups.some(g => g.currentRound > 0);

  return (
    <div className="h-full flex flex-col bg-slate-800/40 border border-slate-700/40 rounded-2xl overflow-hidden">
      {/* 赛事名称 */}
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              // 比赛进行中禁止导入
              if (competition.groups.some(g => g.status !== 'setup')) {
                setImportError(t.importBlockedStarted);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
                return;
              }

              setImportError(null);
              try {
                const data = await importCompetitionFromFile(file);
                importCompetition(data);
              } catch (err) {
                setImportError(err instanceof Error ? err.message : t.importFailed);
                setImportErrorFile(file.name);
              }

              // 清空文件输入
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={competition.groups.some(g => g.status !== 'setup')}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-xs border border-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-800/50 disabled:hover:text-slate-300"
            title={competition.groups.some(g => g.status !== 'setup') ? (isEnglish ? 'The tournament has started. Reset data before importing.' : '比赛已开始，请先重置比赛数据再导入') : ''}
          >
            <FileUp className="w-3.5 h-3.5" />
            {isEnglish ? 'Import tournament data' : '导入比赛数据'}
          </button>
        </div>
        {importError && (
          <div className="mt-2 px-3 py-2 bg-rose-500/10 text-rose-400 rounded-lg text-xs space-y-2">
            <div>{importError}</div>
            <button
              onClick={() => downloadErrorReport('tournament-json-import', importError, {
                fileName: importErrorFile,
              })}
              className="text-[11px] underline hover:text-rose-300"
            >
              {t.downloadErrorReport}
            </button>
          </div>
        )}
        {competition.groups.some(g => g.status !== 'setup') && !importError && (
          <div className="mt-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-lg text-[11px] flex items-center gap-1.5 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {isEnglish ? 'The tournament has started. Import is disabled until data is reset.' : '比赛已开始，导入功能已禁用，请先重置比赛数据'}
          </div>
        )}
      </div>

      {/* 当前小组指示器 */}
      <div className="px-4 py-2.5 border-b border-slate-700/50 bg-slate-800/20">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 shrink-0">{isEnglish ? 'Current group' : '当前小组'}</span>
          <span className="flex-1 truncate text-gold-400 font-medium">
            {currentGroup.name}
          </span>
          <span className="text-slate-600 shrink-0">
            {currentGroup.players.length}{isEnglish ? '' : '人'}
          </span>
        </div>
      </div>

      {/* 小组管理 */}
      <div className="p-4 border-b border-slate-700/50">
        <button
          onClick={() => setShowGroupManager(!showGroupManager)}
          className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            {isEnglish ? 'Group management' : '小组管理'}
            <span className="text-slate-500">({competition.groups.length}{isEnglish ? ' groups' : '组'})</span>
          </span>
          {showGroupManager ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showGroupManager && (
          <div className="mt-3 space-y-2">
            {hasAnyStarted && (
              <div className="px-2 py-1.5 rounded-md bg-amber-500/10 text-amber-400 text-[11px] flex items-center gap-1.5 border border-amber-500/20">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {isEnglish ? 'The tournament has started. Group count cannot be changed.' : '比赛已开始，小组数量不可调整'}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{isEnglish ? 'Add / remove groups' : '添加 / 移除小组'}</span>
              <button
                onClick={() => addGroup()}
                disabled={hasAnyStarted}
                className="p-1 rounded hover:bg-slate-700 text-emerald-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title={hasAnyStarted ? t.addGroupBlocked : t.addGroup}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* 手动设置小组数量 */}
            <div className="space-y-1">
              <label className="text-xs text-slate-500">{isEnglish ? 'Group count' : '小组数量'}</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min="1" max="20"
                  value={parseInt(groupCountInput) || 1}
                  disabled={hasAnyStarted}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    setGroupCountInput(String(v));
                    setGroupCount(v);
                  }}
                  className="flex-1 accent-gold-500 disabled:opacity-30 disabled:cursor-not-allowed"
                />
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={groupCountInput}
                  disabled={hasAnyStarted}
                  onChange={e => {
                    const raw = e.target.value;
                    // 仅允许数字或空字符串
                    if (raw === '') {
                      setGroupCountInput('');
                      return;
                    }
                    if (!/^\d+$/.test(raw)) return;
                    const num = parseInt(raw, 10);
                    if (isNaN(num)) return;
                    const v = Math.max(1, Math.min(20, num));
                    setGroupCountInput(String(v));
                    setGroupCount(v);
                  }}
                  onBlur={() => {
                    const num = parseInt(groupCountInput, 10);
                    if (isNaN(num) || num < 1) {
                      setGroupCountInput(String(competition.groups.length));
                    } else {
                      // 失焦时同步规范化显示
                      setGroupCountInput(String(Math.max(1, Math.min(20, num))));
                    }
                  }}
                  className="w-14 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-center font-mono text-gold-400 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1 max-h-32 overflow-y-auto">
              {competition.groups.map((group, index) => (
                <div
                  key={group.id}
                  onClick={() => {
                    if (editingGroupIndex !== index) {
                      setCurrentGroup(index);
                    }
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    index === competition.currentGroupIndex
                      ? 'bg-gold-500/10 text-gold-400 border border-gold-500/30'
                      : 'bg-slate-800/30 text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  {editingGroupIndex === index ? (
                    <input
                      autoFocus
                      value={editGroupNameValue}
                      onChange={e => setEditGroupNameValue(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={() => {
                        if (editGroupNameValue.trim()) {
                          updateGroupName(index, editGroupNameValue);
                        }
                        setEditingGroupIndex(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (editGroupNameValue.trim()) {
                            updateGroupName(index, editGroupNameValue);
                          }
                          setEditingGroupIndex(null);
                        } else if (e.key === 'Escape') {
                          setEditingGroupIndex(null);
                        }
                      }}
                      className="flex-1 bg-slate-900 text-slate-200 text-xs px-1 py-0.5 rounded border border-gold-500/50 outline-none"
                    />
                  ) : (
                    <span
                      className="flex-1 truncate"
                      onDoubleClick={e => {
                        e.stopPropagation();
                        setEditingGroupIndex(index);
                        setEditGroupNameValue(group.name);
                      }}
                      title={t.clickToSwitchDblclickEdit}
                    >
                      {group.name}
                    </span>
                  )}
                  <span className="text-slate-500">
                    {formatText(t.playersCount, { count: group.players.length })}
                  </span>
                  {editingGroupIndex !== index && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setEditingGroupIndex(index);
                        setEditGroupNameValue(group.name);
                      }}
                      className="p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-gold-400 transition-colors"
                      title={t.editGroupName}
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                  {competition.groups.length > 1 && group.status === 'setup' && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        removeGroup(index);
                      }}
                      className="p-0.5 rounded hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                      title={t.deleteGroup}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 赛制管理 */}
        {isSetup && (
          <div className="space-y-2">
            <button
              onClick={() => setShowFormatManager(!showFormatManager)}
              className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5" />
                {isEnglish ? 'Format management' : '赛制管理'}
                <span className="text-slate-500">
                  ({currentGroup.pairingType === 'swiss' ? (isEnglish ? 'Swiss' : '瑞士轮') : (isEnglish ? 'Elimination' : '淘汰')} · {currentGroup.gameType.toUpperCase()})
                </span>
              </span>
              {showFormatManager ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showFormatManager && (
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-500">{isEnglish ? 'Pairing type' : '配对方式'}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPairingType('swiss')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        currentGroup.pairingType === 'swiss'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      {isEnglish ? 'Swiss' : '瑞士轮'}
                    </button>
                    <button
                      onClick={() => setPairingType('single_elimination')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        currentGroup.pairingType === 'single_elimination'
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
                      onClick={() => setGameType('bo1')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        currentGroup.gameType === 'bo1'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      BO1
                    </button>
                    <button
                      onClick={() => setGameType('bo3')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        currentGroup.gameType === 'bo3'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      BO3
                    </button>
                    <button
                      onClick={() => setGameType('bo5')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        currentGroup.gameType === 'bo5'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      BO5
                    </button>
                    <button
                      onClick={() => setGameType('bo7')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        currentGroup.gameType === 'bo7'
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
                      value={currentGroup.players.length}
                      onChange={e => setPlayerCount(parseInt(e.target.value))}
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
                        setPlayerCount(v);
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

                {currentGroup.pairingType !== 'single_elimination' ? (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-500">{isEnglish ? 'Set rounds' : '设置轮次'}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min="1" max="20"
                        value={currentGroup.totalRounds}
                        onChange={e => setTotalRounds(parseInt(e.target.value))}
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
                          setTotalRounds(v);
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
                        ? `Total ${currentGroup.totalRounds} rounds (auto-calculated from ${currentGroup.players.length} players)`
                        : (
                          <>
                            共 <span className="font-mono text-gold-400 font-bold">{currentGroup.totalRounds}</span>
                            {' '}轮（根据 {currentGroup.players.length} 人自动计算）
                          </>
                        )}
                    </div>
                  </div>
                )}

                {currentGroup.pairingType === 'single_elimination' && (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-500">{isEnglish ? 'Match length per round' : '每轮比赛局数'}</label>
                    <div className="space-y-1.5">
                      {Array.from({ length: currentGroup.totalRounds }, (_, i) => i + 1).map(round => (
                        <div key={round} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-10">{isEnglish ? `Round ${round}` : `第${round}轮`}</span>
                          <div className="flex-1 grid grid-cols-4 gap-1.5">
                            {(['bo1', 'bo3', 'bo5', 'bo7'] as GameType[]).map(gt => (
                              <button
                                key={gt}
                                onClick={() => setRoundGameType(round, gt)}
                                className={`py-1 rounded text-[10px] font-medium transition-colors ${
                                  (currentGroup.roundGameTypes?.[round - 1] ?? currentGroup.gameType) === gt
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

                {currentGroup.pairingType === 'swiss' && (
                  <TiebreakSettings
                    gameType={currentGroup.gameType}
                    template={currentGroup.tiebreakTemplate}
                    rules={currentGroup.tiebreakRules}
                  />
                )}

                {/* 批量设置所有小组 */}
                <div className="pt-2 border-t border-slate-700/50">
                  <button
                    onClick={() => setShowBatchSettings(!showBatchSettings)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/30 text-xs text-slate-400 hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5" />
                      {isEnglish ? 'Apply settings to all groups' : '批量设置所有小组'}
                    </span>
                    {showBatchSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showBatchSettings && (
                    <div className="mt-2 space-y-3 p-3 bg-slate-800/30 rounded-lg">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">{isEnglish ? 'Players per group' : '每组人数'}</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range" min="2" max="100"
                            value={batchPlayerCount}
                            onChange={e => setBatchPlayerCount(parseInt(e.target.value))}
                            className="flex-1 accent-gold-500"
                          />
                          <input
                            type="text" inputMode="numeric" pattern="[0-9]*"
                            value={batchPlayerCountInput}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') {
                                setBatchPlayerCountInput('');
                                return;
                              }
                              if (!/^\d+$/.test(raw)) return;
                              const num = parseInt(raw, 10);
                              if (isNaN(num)) return;
                              const v = Math.max(2, Math.min(100, num));
                              setBatchPlayerCountInput(String(v));
                              setBatchPlayerCount(v);
                            }}
                            onBlur={() => {
                              const num = parseInt(batchPlayerCountInput, 10);
                              if (isNaN(num) || num < 2) {
                                setBatchPlayerCountInput(String(batchPlayerCount));
                              } else {
                                setBatchPlayerCountInput(String(Math.max(2, Math.min(100, num))));
                              }
                            }}
                            className="w-14 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-center font-mono text-gold-400 text-xs"
                          />
                        </div>
                      </div>
                      {batchPairingType !== 'single_elimination' && (
                        <div className="space-y-1">
                          <label className="text-xs text-slate-500">{isEnglish ? 'Rounds' : '轮次'}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min="1" max="20"
                              value={batchRounds}
                              onChange={e => setBatchRounds(parseInt(e.target.value))}
                              className="flex-1 accent-gold-500"
                            />
                            <input
                              type="text" inputMode="numeric" pattern="[0-9]*"
                              value={batchRoundsInput}
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  setBatchRoundsInput('');
                                  return;
                                }
                                if (!/^\d+$/.test(raw)) return;
                                const num = parseInt(raw, 10);
                                if (isNaN(num)) return;
                                const v = Math.max(1, Math.min(20, num));
                                setBatchRoundsInput(String(v));
                                setBatchRounds(v);
                              }}
                              onBlur={() => {
                                const num = parseInt(batchRoundsInput, 10);
                                if (isNaN(num) || num < 1) {
                                  setBatchRoundsInput(String(batchRounds));
                                } else {
                                  setBatchRoundsInput(String(Math.max(1, Math.min(20, num))));
                                }
                              }}
                              className="w-14 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-center font-mono text-gold-400 text-xs"
                            />
                          </div>
                        </div>
                      )}
                      {batchPairingType === 'single_elimination' && (
                        <div className="space-y-1">
                          <label className="text-xs text-slate-500">{isEnglish ? 'Rounds (auto-calculated)' : '轮次（自动计算）'}</label>
                          <div className="px-3 py-2 bg-slate-800/30 rounded text-sm text-slate-400">
                            {isEnglish
                              ? `Auto-calculated from ${batchPlayerCount} players`
                              : (
                                <>
                                  根据 <span className="font-mono text-gold-400 font-bold">{batchPlayerCount}</span>
                                  {' '}人自动计算
                                </>
                              )}
                          </div>
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">{isEnglish ? 'Pairing type' : '配对方式'}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setBatchPairingType('swiss')}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                              batchPairingType === 'swiss'
                                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            {isEnglish ? 'Swiss' : '瑞士轮'}
                          </button>
                          <button
                            onClick={() => setBatchPairingType('single_elimination')}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                              batchPairingType === 'single_elimination'
                                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            {isEnglish ? 'Single elimination' : '单败淘汰'}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">{isEnglish ? 'Match length' : '比赛局数'}</label>
                        <div className="grid grid-cols-4 gap-2">
                          <button
                            onClick={() => setBatchGameType('bo1')}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                              batchGameType === 'bo1'
                                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            BO1
                          </button>
                          <button
                            onClick={() => setBatchGameType('bo3')}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                              batchGameType === 'bo3'
                                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            BO3
                          </button>
                          <button
                            onClick={() => setBatchGameType('bo5')}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                              batchGameType === 'bo5'
                                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            BO5
                          </button>
                          <button
                            onClick={() => setBatchGameType('bo7')}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                              batchGameType === 'bo7'
                                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            BO7
                          </button>
                        </div>
                      </div>

                      {/* 单败淘汰每轮赛制单独设置 */}
                      {batchPairingType === 'single_elimination' && (() => {
                        const computedRounds = getSingleEliminationRounds(batchPlayerCount);
                        // 长度变化时同步 batchRoundGameTypes（不足补默认 gameType，超出截断）
                        const synced = batchRoundGameTypes.length === computedRounds
                          ? batchRoundGameTypes
                          : (() => {
                              const arr = [...batchRoundGameTypes];
                              while (arr.length < computedRounds) arr.push(batchGameType);
                              arr.length = computedRounds;
                              return arr;
                            })();
                        return (
                          <div className="space-y-1.5">
                            <label className="text-xs text-slate-500">
                              {isEnglish ? 'Match length per round' : '每轮比赛局数'}
                              <span className="ml-1 text-slate-600">{isEnglish ? `(Total ${computedRounds} rounds, based on ${batchPlayerCount} players)` : `（共 ${computedRounds} 轮，按 ${batchPlayerCount} 人计算）`}</span>
                            </label>
                            <div className="space-y-1.5">
                              {Array.from({ length: computedRounds }, (_, i) => i + 1).map(round => (
                                <div key={round} className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500 w-10 shrink-0">{formatText(t.roundNShort, { round })}</span>
                                  <div className="flex-1 grid grid-cols-4 gap-1.5">
                                    {(['bo1', 'bo3', 'bo5', 'bo7'] as GameType[]).map(gt => (
                                      <button
                                        key={gt}
                                        onClick={() => {
                                          const next = [...synced];
                                          next[round - 1] = gt;
                                          setBatchRoundGameTypes(next);
                                        }}
                                        className={`py-1 rounded text-[10px] font-medium transition-colors ${
                                          synced[round - 1] === gt
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
                        );
                      })()}

                      <button
                        onClick={() => {
                          batchSetGroupConfig(
                            batchPlayerCount,
                            batchRounds,
                            batchGameType,
                            batchPairingType,
                            batchPairingType === 'single_elimination' ? batchRoundGameTypes : undefined
                          );
                          setShowBatchSettings(false);
                        }}
                        className="w-full py-2 rounded-lg bg-gold-500/20 text-gold-400 hover:bg-gold-500/30 border border-gold-500/30 text-sm font-medium transition-colors"
                      >
                        {isEnglish ? 'Apply to all groups' : '应用至所有小组'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {isSetup && <PlayerManager />}

        {/* 比赛控制 */}
        <div className="space-y-3">
          {isSetup && currentGroup.players.length >= 2 && (
            <div className="space-y-2">
              <button
                onClick={() => startTournament(currentGroup.totalRounds)}
                className="w-full py-2.5 rounded-lg bg-gold-500/15 text-gold-400 hover:bg-gold-500/25 transition-colors text-sm font-medium flex items-center justify-center gap-2 border border-gold-500/25"
              >
                <Play className="w-4 h-4" />
                {isEnglish ? `Start this group (${currentGroup.totalRounds} rounds total)` : `开始本组比赛 (共${currentGroup.totalRounds}轮)`}
              </button>
              {competition.groups.length > 1 && competition.groups.some(g => g.status === 'setup' && g.players.length >= 2) && (
                <button
                  onClick={() => startAllGroups()}
                  className="w-full py-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors text-sm font-medium flex items-center justify-center gap-2 border border-emerald-500/25"
                >
                  <Play className="w-4 h-4" />
                  {isEnglish ? 'Start all groups' : '全部小组同时开赛'}
                </button>
              )}
            </div>
          )}

          {hasAnyRound && (
            <button
              onClick={() => setShowQuickScore(true)}
              className="w-full py-2.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors text-sm font-medium flex items-center justify-center gap-2 border border-emerald-500/30"
            >
              <Swords className="w-4 h-4" />
              {isEnglish ? 'Quick score entry' : '快速录分'}
            </button>
          )}

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

              {currentGroup.currentRound > 0 && (
                <button
                  onClick={() => setShowUndoConfirm(true)}
                  className="w-full py-2 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors text-sm flex items-center justify-center gap-2 border border-orange-500/25"
                >
                  <Undo2 className="w-4 h-4" />
                  {isEnglish ? `Undo round ${currentGroup.currentRound} results` : `撤回第${currentGroup.currentRound}轮结果`}
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

          <div className="pt-2 border-t border-slate-700/40 space-y-1.5">
            <button
              onClick={() => setShowStorageHealth(true)}
              className="w-full py-1.5 rounded-md bg-slate-800/30 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/5 transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {isEnglish ? 'Storage health' : '存储体检'}
            </button>
            <button
              onClick={() => setShowBackupManager(true)}
              className="w-full py-1.5 rounded-md bg-slate-800/30 text-slate-500 hover:text-sky-400 hover:bg-sky-500/5 transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" />
              {isEnglish ? 'Backup manager' : '备份管理'}
            </button>
            <button
              onClick={() => setShowAuditLog(true)}
              className="w-full py-1.5 rounded-md bg-slate-800/30 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/5 transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" />
              {t.auditLog}
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full py-1.5 rounded-md bg-slate-800/30 text-slate-500 hover:text-rose-400 hover:bg-rose-500/5 transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isEnglish ? 'Reset tournament' : '重置比赛'}
            </button>
          </div>
        </div>
      </div>

      {/* 底部固定操作区：生成下一轮按钮（始终可见，不被滚动隐藏） */}
      {isInProgress && isCurrentRoundComplete && currentGroup.currentRound < currentGroup.totalRounds && (
        <div className="shrink-0 p-3 border-t border-slate-700/50 bg-slate-800/60 space-y-2">
          <button
            onClick={onShowConfirm}
            className="w-full py-2.5 rounded-lg bg-gold-500/20 text-gold-400 hover:bg-gold-500/30 transition-colors text-sm font-medium flex items-center justify-center gap-2 border border-gold-500/40"
          >
            <Play className="w-4 h-4" />
            {t.generateNextRound}
          </button>
          {competition.groups.length > 1 && competition.groups.some(g => {
            if (g.status !== 'in_progress') return false;
            if (g.currentRound >= g.totalRounds) return false;
            const matches = g.matches.filter(m => m.round === g.currentRound);
            return matches.length > 0 && matches.every(m => m.result !== 'pending');
          }) && (
            <button
              onClick={() => { onShowConfirmAll?.(); }}
              className="w-full py-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors text-sm font-medium flex items-center justify-center gap-2 border border-emerald-500/25"
            >
              <Play className="w-4 h-4" />
              {t.allGroupsNextRound}
            </button>
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
        onConfirm={() => resetCompetition()}
      />

      {/* 撤回确认（替代 window.confirm） */}
      <ConfirmDialog
        isOpen={showUndoConfirm}
        onClose={() => setShowUndoConfirm(false)}
        title={t.confirmUndoTitle}
        message={formatText(t.confirmUndoMsg, { round: currentGroup.currentRound })}
        confirmText={t.undoNow}
        onConfirm={() => undoLastRound()}
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
        <QuickScoreModal
          isOpen={showQuickScore}
          onClose={() => setShowQuickScore(false)}
        />
      </Suspense>
      <AuditLogManager
        isOpen={showAuditLog}
        onClose={() => setShowAuditLog(false)}
      />
    </div>
  );
}
