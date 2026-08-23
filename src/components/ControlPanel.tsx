import { useState, useEffect, useRef } from 'react';
import {
  Users, Play, RotateCcw, Settings, AlertTriangle, Trophy,
  Edit2, UserX, UserCheck, Trash2, Upload, FileText,
  Undo2, Plus, Minus, ChevronDown, ChevronUp, Download, FileUp, Layers, History
} from 'lucide-react';
import { useTournamentStore, useCurrentGroup, useIsCurrentRoundComplete } from '../store/useTournamentStore';
import type { GameType, PairingType } from '../types';
import { exportCompetitionToFile, importCompetitionFromFile } from '../utils/fileStorage';
import { getSingleEliminationRounds } from '../utils/swissPairing';
import { ConfirmDialog } from './ConfirmDialog';
import { BackupManager } from './BackupManager';

interface ControlPanelProps {
  onShowConfirm: () => void;
  onShowConfirmAll?: () => void;
}

export function ControlPanel({ onShowConfirm, onShowConfirmAll }: ControlPanelProps) {
  const currentGroup = useCurrentGroup();
  const isCurrentRoundComplete = useIsCurrentRoundComplete();
  const {
    competition,
    startTournament,
    startAllGroups,
    generateNextRound,
    generateNextRoundAllGroups,
    undoLastRound,
    resetCompetition,
    updateCompetitionName,
    updatePlayerName,
    togglePlayerDropped,
    removePlayer,
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
    replacePlayers,
    importCompetition,
    setCurrentGroup,
  } = useTournamentStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [showBackupManager, setShowBackupManager] = useState(false);
  const [nameInput, setNameInput] = useState(competition.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [showPlayerManager, setShowPlayerManager] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showFormatManager, setShowFormatManager] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchNames, setBatchNames] = useState('');
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameInput(competition.name);
  }, [competition.name]);

  // 赛事被重置或替换时，清除小组名/选手名/赛事名编辑态，避免残留 stale state
  useEffect(() => {
    setEditingGroupIndex(null);
    setEditGroupNameValue('');
    setEditingPlayerId(null);
    setEditNameValue('');
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

  const handleConfirmEditName = () => {
    if (editingPlayerId && editNameValue.trim()) {
      updatePlayerName(editingPlayerId, editNameValue.trim());
      setEditingPlayerId(null);
      setEditNameValue('');
    }
  };

  const handleStartEditName = (player: { id: string; name: string }) => {
    setEditingPlayerId(player.id);
    setEditNameValue(player.name);
  };

  return (
    <div className="h-full flex flex-col bg-slate-800/40 border border-slate-700/40 rounded-2xl overflow-hidden">
      {/* 赛事名称 */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-gold-400" />
            赛事设置
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
              保存
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
            导出比赛数据
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
                setImportError('比赛已开始，请先重置比赛数据再导入');
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
                setImportError(err instanceof Error ? err.message : '导入失败');
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
            title={competition.groups.some(g => g.status !== 'setup') ? '比赛已开始，请先重置比赛数据再导入' : ''}
          >
            <FileUp className="w-3.5 h-3.5" />
            导入比赛数据
          </button>
        </div>
        {importError && (
          <div className="mt-2 px-3 py-2 bg-rose-500/10 text-rose-400 rounded-lg text-xs">
            {importError}
          </div>
        )}
        {competition.groups.some(g => g.status !== 'setup') && !importError && (
          <div className="mt-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-lg text-[11px] flex items-center gap-1.5 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            比赛已开始，导入功能已禁用，请先重置比赛数据
          </div>
        )}
      </div>

      {/* 当前小组指示器 */}
      <div className="px-4 py-2.5 border-b border-slate-700/50 bg-slate-800/20">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 shrink-0">当前小组</span>
          <span className="flex-1 truncate text-gold-400 font-medium">
            {currentGroup.name}
          </span>
          <span className="text-slate-600 shrink-0">
            {currentGroup.players.length}人
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
            小组管理
            <span className="text-slate-500">({competition.groups.length}组)</span>
          </span>
          {showGroupManager ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showGroupManager && (
          <div className="mt-3 space-y-2">
            {hasAnyStarted && (
              <div className="px-2 py-1.5 rounded-md bg-amber-500/10 text-amber-400 text-[11px] flex items-center gap-1.5 border border-amber-500/20">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                比赛已开始，小组数量不可调整
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">添加 / 移除小组</span>
              <button
                onClick={() => addGroup()}
                disabled={hasAnyStarted}
                className="p-1 rounded hover:bg-slate-700 text-emerald-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title={hasAnyStarted ? '比赛已开始，不可添加小组' : '添加小组'}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* 手动设置小组数量 */}
            <div className="space-y-1">
              <label className="text-xs text-slate-500">小组数量</label>
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
                      title="单击切换小组 / 双击编辑名称"
                    >
                      {group.name}
                    </span>
                  )}
                  <span className="text-slate-500">{group.players.length}人</span>
                  {editingGroupIndex !== index && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setEditingGroupIndex(index);
                        setEditGroupNameValue(group.name);
                      }}
                      className="p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-gold-400 transition-colors"
                      title="编辑小组名称"
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
                      title="删除小组"
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
                赛制管理
                <span className="text-slate-500">
                  ({currentGroup.pairingType === 'swiss' ? '瑞士轮' : '淘汰'} · {currentGroup.gameType.toUpperCase()})
                </span>
              </span>
              {showFormatManager ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showFormatManager && (
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-500">配对方式</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPairingType('swiss')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        currentGroup.pairingType === 'swiss'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      瑞士轮
                    </button>
                    <button
                      onClick={() => setPairingType('single_elimination')}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                        currentGroup.pairingType === 'single_elimination'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      单败淘汰
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-500">比赛局数</label>
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
                  <label className="text-xs text-slate-500">设置参赛人数</label>
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
                    <label className="text-xs text-slate-500">设置轮次</label>
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
                    <label className="text-xs text-slate-500">轮次（自动计算）</label>
                    <div className="px-3 py-2 bg-slate-800/30 rounded-lg text-sm text-slate-400">
                      共 <span className="font-mono text-gold-400 font-bold">{currentGroup.totalRounds}</span> 轮（根据 {currentGroup.players.length} 人自动计算）
                    </div>
                  </div>
                )}

                {currentGroup.pairingType === 'single_elimination' && (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-500">每轮比赛局数</label>
                    <div className="space-y-1.5">
                      {Array.from({ length: currentGroup.totalRounds }, (_, i) => i + 1).map(round => (
                        <div key={round} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-10">第{round}轮</span>
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

                {/* 批量设置所有小组 */}
                <div className="pt-2 border-t border-slate-700/50">
                  <button
                    onClick={() => setShowBatchSettings(!showBatchSettings)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/30 text-xs text-slate-400 hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5" />
                      批量设置所有小组
                    </span>
                    {showBatchSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showBatchSettings && (
                    <div className="mt-2 space-y-3 p-3 bg-slate-800/30 rounded-lg">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">每组人数</label>
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
                          <label className="text-xs text-slate-500">轮次</label>
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
                          <label className="text-xs text-slate-500">轮次（自动计算）</label>
                          <div className="px-3 py-2 bg-slate-800/30 rounded text-sm text-slate-400">
                            根据 <span className="font-mono text-gold-400 font-bold">{batchPlayerCount}</span> 人自动计算
                          </div>
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">配对方式</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setBatchPairingType('swiss')}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                              batchPairingType === 'swiss'
                                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            瑞士轮
                          </button>
                          <button
                            onClick={() => setBatchPairingType('single_elimination')}
                            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                              batchPairingType === 'single_elimination'
                                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            单败淘汰
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">比赛局数</label>
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
                              每轮比赛局数
                              <span className="ml-1 text-slate-600">（共 {computedRounds} 轮，按 {batchPlayerCount} 人计算）</span>
                            </label>
                            <div className="space-y-1.5">
                              {Array.from({ length: computedRounds }, (_, i) => i + 1).map(round => (
                                <div key={round} className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500 w-10 shrink-0">第{round}轮</span>
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
                        应用至所有小组
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 选手管理 */}
        {isSetup && (
          <div className="space-y-2">
            <button
              onClick={() => setShowPlayerManager(!showPlayerManager)}
              className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                选手管理
                <span className="text-slate-500">({currentGroup.players.length}人)</span>
              </span>
              {showPlayerManager ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showPlayerManager && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setShowBatchImport(!showBatchImport)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {showBatchImport ? '收起导入' : '批量导入'}
                </button>

                {showBatchImport && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={batchNames}
                      onChange={e => setBatchNames(e.target.value)}
                      placeholder="每行输入一个选手名称，如：&#10;张三&#10;李四&#10;王五"
                      className="w-full h-24 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold-500/30 resize-none"
                    />
                    <button
                      onClick={() => {
                        const names = batchNames.split('\n').map(n => n.trim()).filter(n => n.length > 0);
                        if (names.length > 0) {
                          replacePlayers(names);
                          setBatchNames('');
                          setShowBatchImport(false);
                        }
                      }}
                      className="w-full py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      导入 {batchNames.split('\n').filter(n => n.trim().length > 0).length} 名选手
                    </button>
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto space-y-1">
                  {currentGroup.players.map((player, index) => (
                    <div key={player.id} className="flex items-center gap-2 px-3 py-2 bg-slate-800/30 rounded-lg group hover:bg-slate-800/50 transition-colors">
                      <span className="text-slate-500 font-mono text-xs w-6">{index + 1}.</span>
                      {editingPlayerId === player.id ? (
                        <>
                          <input
                            type="text" value={editNameValue}
                            onChange={e => setEditNameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleConfirmEditName();
                              if (e.key === 'Escape') { setEditingPlayerId(null); setEditNameValue(''); }
                            }}
                            autoFocus
                            className="flex-1 px-2 py-1 bg-slate-700 border border-gold-500/50 rounded text-sm text-white focus:outline-none"
                          />
                          <button onClick={handleConfirmEditName} className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">确认</button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-slate-300 truncate">{player.name}</span>
                          <button onClick={() => handleStartEditName(player)} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removePlayer(player.id)} className="p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 比赛控制 */}
        <div className="space-y-3">
          {isSetup && currentGroup.players.length >= 2 && (
            <div className="space-y-2">
              <button
                onClick={() => startTournament(currentGroup.totalRounds)}
                className="w-full py-2.5 rounded-lg bg-gold-500/15 text-gold-400 hover:bg-gold-500/25 transition-colors text-sm font-medium flex items-center justify-center gap-2 border border-gold-500/25"
              >
                <Play className="w-4 h-4" />
                开始本组比赛 (共{currentGroup.totalRounds}轮)
              </button>
              {competition.groups.length > 1 && competition.groups.some(g => g.status === 'setup' && g.players.length >= 2) && (
                <button
                  onClick={() => startAllGroups()}
                  className="w-full py-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors text-sm font-medium flex items-center justify-center gap-2 border border-emerald-500/25"
                >
                  <Play className="w-4 h-4" />
                  全部小组同时开赛
                </button>
              )}
            </div>
          )}

          {isInProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  第 {currentGroup.currentRound}/{currentGroup.totalRounds} 轮
                </span>
                <span className="text-gold-400 font-semibold">
                  {currentGroup.matches.filter(m => m.round === currentGroup.currentRound && m.result !== 'pending').length} / {currentGroup.matches.filter(m => m.round === currentGroup.currentRound).length} 场完成
                </span>
              </div>

              {currentGroup.currentRound > 0 && (
                <button
                  onClick={() => setShowUndoConfirm(true)}
                  className="w-full py-2 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors text-sm flex items-center justify-center gap-2 border border-orange-500/25"
                >
                  <Undo2 className="w-4 h-4" />
                  撤回第{currentGroup.currentRound}轮结果
                </button>
              )}

              {!isCurrentRoundComplete && currentGroup.currentRound > 0 && (
                <div className="text-center text-xs text-amber-400 bg-amber-500/10 rounded-lg py-2 px-3">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                  请先完成当前轮所有比赛
                </div>
              )}
            </div>
          )}

          {/* 赛前弃赛 / 赛后弃赛管理 */}
          {isInProgress && (
            <div className="pt-2 border-t border-slate-700/40">
              {(() => {
                // 汇总所有赛前弃赛 match 的"弃赛者本人"（preDrop=true 的败方）
                const preDroppedIds = new Set<string>();
                for (const m of currentGroup.matches) {
                  if (!m.preDrop) continue;
                  if (m.result === 'player1') preDroppedIds.add(m.player2Id); // player2 赛前弃赛
                  else if (m.result === 'player2') preDroppedIds.add(m.player1Id); // player1 赛前弃赛
                }
                return (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-[10px] font-medium text-slate-500">赛前 / 赛后弃赛管理</h3>
                      <span className="text-[8px] text-slate-500 bg-slate-700/30 border border-slate-600/30 px-1.5 py-0.5 rounded-full">两者都等同于退赛</span>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {currentGroup.players.filter(p => !p.dropped && !p.eliminated).map(player => {
                        const isPreDropped = preDroppedIds.has(player.id);
                        return (
                          <div key={player.id} className="flex items-center justify-between gap-2 px-2.5 py-1 bg-slate-800/30 rounded-md">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="text-xs text-slate-300 truncate">{player.name}</span>
                              {isPreDropped && (
                                <span className="shrink-0 text-[8px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-full px-1.5 py-0.5 whitespace-nowrap" title="该选手在之前某轮通过「赛前弃赛」宣布弃权，已自动进入退赛状态（后续不再安排对局）。">
                                  赛前弃赛
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => togglePlayerDropped(player.id)}
                              className={
                                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors shrink-0 ' +
                                (isPreDropped
                                  ? 'text-slate-400 hover:bg-amber-500/10 hover:text-amber-400/80 border border-amber-500/20 bg-amber-500/5'
                                  : 'text-rose-400 hover:bg-rose-500/10')
                              }
                              title={
                                isPreDropped
                                  ? '该选手已因赛前弃赛处于退赛状态。若出现在此处一般是执行过「恢复」操作，点此按钮会重新手动标记退赛（放回「已赛前弃赛」列表）。'
                                  : '赛后弃赛：针对选手个人的退赛标记。后续轮次不再安排对阵（不产生胜负归属给他人），已完赛场次全部保留，战绩冻结在弃赛时刻。'
                              }
                            >
                              <UserX className="w-2.5 h-2.5" />
                              {isPreDropped ? '手动退赛(不必再点)' : '赛后弃赛'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {currentGroup.players.some(p => p.eliminated) && (
                      <div className="mt-1.5">
                        <h4 className="text-[10px] text-slate-500 mb-1">已淘汰</h4>
                        <div className="max-h-16 overflow-y-auto space-y-1">
                          {currentGroup.players.filter(p => p.eliminated).map(player => (
                            <div key={player.id} className="flex items-center justify-between px-2.5 py-1 bg-slate-700/20 rounded-md">
                              <span className="text-xs text-slate-500">{player.name}</span>
                              <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-600/20 border border-slate-500/20">
                                淘汰
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {currentGroup.players.some(p => p.dropped) && (
                      <div className="mt-1.5">
                        <h4 className="text-[10px] text-slate-500 mb-1">已赛前弃赛</h4>
                        <div className="max-h-16 overflow-y-auto space-y-1">
                          {currentGroup.players.filter(p => p.dropped).map(player => (
                            <div key={player.id} className="flex items-center justify-between px-2.5 py-1 bg-rose-500/5 rounded-md">
                              <span className="text-xs text-rose-400/70 line-through">{player.name}</span>
                              <button
                                onClick={() => togglePlayerDropped(player.id)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                title="恢复退赛：将该选手重新纳入后续轮次配对。之前产生的结果不变（赛前弃赛场次仍不计入对手胜率网络）。"
                              >
                                <UserCheck className="w-2.5 h-2.5" />
                                恢复
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-1.5 text-[9px] leading-tight text-slate-500 bg-slate-800/40 border border-slate-700/40 rounded px-2 py-1">
                      赛前弃赛与赛后弃赛<strong>都会让选手退赛、不再安排后续对阵</strong>，本质区别是触发方式与归属：①<strong>赛前弃赛</strong>——针对某一具体对阵（入口在对阵卡片展开后的「赛前弃」按钮）：比赛未开赛即一方宣布弃权，另一方直接记胜场，弃赛方不记败场，该场整体不计入对手胜率网络。②<strong>赛后弃赛</strong>——针对选手个人（入口在本面板「赛后弃赛」按钮）：不产生新的胜负归属给他人，仅手动标记某选手从下一轮起退出赛事，已完赛场次按真实结果正常计入对手胜率网络。两者最终都会使选手进入上方「已赛前弃赛」列表并冻结战绩。
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {isCompleted && (
            <div className="text-center py-3">
              <Trophy className="w-6 h-6 text-gold-400 mx-auto mb-1.5" />
              <p className="text-gold-400 font-semibold text-sm">比赛结束</p>
              <p className="text-xs text-slate-500 mt-0.5">
                共 {currentGroup.totalRounds} 轮
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-slate-700/40 space-y-1.5">
            <button
              onClick={() => setShowBackupManager(true)}
              className="w-full py-1.5 rounded-md bg-slate-800/30 text-slate-500 hover:text-sky-400 hover:bg-sky-500/5 transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" />
              备份管理
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full py-1.5 rounded-md bg-slate-800/30 text-slate-500 hover:text-rose-400 hover:bg-rose-500/5 transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置比赛
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
            生成下一轮对阵
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
              全部小组开始下一轮
            </button>
          )}
        </div>
      )}

      {/* 重置确认（统一使用自制 ConfirmDialog） */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="确认重置"
        message="此操作将清除所有比赛数据，包括选手信息、比赛结果和排名。此操作不可恢复。"
        confirmText="确认重置"
        onConfirm={() => resetCompetition()}
      />

      {/* 撤回确认（替代 window.confirm） */}
      <ConfirmDialog
        isOpen={showUndoConfirm}
        onClose={() => setShowUndoConfirm(false)}
        title="确认撤回"
        message={`确定要撤回第 ${currentGroup.currentRound} 轮的所有比赛结果吗？此操作不可恢复。`}
        confirmText="确认撤回"
        onConfirm={() => undoLastRound()}
      />

      {/* 备份管理面板 */}
      <BackupManager
        isOpen={showBackupManager}
        onClose={() => setShowBackupManager(false)}
      />
    </div>
  );
}
