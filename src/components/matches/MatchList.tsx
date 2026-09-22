import { Swords, Trophy, Award, Medal, ChevronDown, ChevronUp, Dice3, Pencil, GripVertical } from 'lucide-react';
import { useTournamentStore, useCurrentGroup } from '../../store/useTournamentStore';
import { RoundTabs } from '../competition/RoundTabs';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { Match, MatchResult } from '../../types';
import { useMemo, useState, useEffect } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { ResultButtons } from './ResultButtons';
import { RoundEditor } from './RoundEditor';
import { getPlayerDisplayName } from '../../utils/playerProfiles';

interface MatchListProps {
  testMode?: boolean;
}
export function MatchList({ testMode = false }: MatchListProps) {
  const currentGroup = useCurrentGroup();
  const { viewRound, updateMatchResult, competition, randomGenerateAllGroups, randomGenerateCurrentRoundAllGroups, batchUpdateRoundMatches, reorderMatches, isRandomGenerating, randomGenerateProgress, markResultDisputed, overrideMatchResult } = useTournamentStore();
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  // 拖拽改序状态
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // 统一确认弹窗（替代 window.confirm）
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [overrideRequest, setOverrideRequest] = useState<{
    matchId: string;
    result: Exclude<MatchResult, 'pending'>;
    player1Games?: number;
    player2Games?: number;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (currentGroup.currentRound === 0) {
      setEditMode(false);
      setExpandedMatch(null);
    }
  }, [currentGroup.currentRound]);
  
  const matches = useMemo(() => {
    return currentGroup.matches.filter(m => m.round === viewRound);
  }, [currentGroup.matches, viewRound]);
  
  const playerMap = useMemo(() => {
    const map = new Map();
    currentGroup.players.forEach(p => map.set(p.id, p));
    return map;
  }, [currentGroup.players]);

  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';

  const getPlayerName = (id: string) => {
    if (id === 'bye') return isEnglish ? 'Bye' : '轮空';
    const player = playerMap.get(id);
    return player ? getPlayerDisplayName(player) : (isEnglish ? 'Unknown player' : '未知选手');
  };

  const getPlayerUid = (id: string) => {
    if (id === 'bye') return '';
    return playerMap.get(id)?.profile?.uid ?? '';
  };

  const getPlayerRank = (id: string) => {
    if (id === 'bye') return null;
    return playerMap.get(id)?.previousRank;
  };

  const getPlayerRecord = (id: string) => {
    if (id === 'bye') return null;
    const p = playerMap.get(id);
    return `${p?.wins || 0}-${p?.losses || 0}`;
  };

  const canEdit = (match: Match) => {
    if (match.isBye) return false;
    // 加赛比赛始终允许编辑（即使比赛已结束）
    if (match.isPlayoff) return !!match.playoffBracketId;
    if (currentGroup.status === 'completed') return false;
    if (viewRound !== currentGroup.currentRound) return false;
    return true;
  };

  const isWinner = (match: Match, playerNum: 1 | 2) => {
    if (match.result === 'player1') return playerNum === 1;
    if (match.result === 'player2') return playerNum === 2;
    return false;
  };

  const isLoser = (match: Match, playerNum: 1 | 2) => {
    if (match.result === 'player1') return playerNum === 2;
    if (match.result === 'player2') return playerNum === 1;
    return false;
  };

  const isDraw = (match: Match) => match.result === 'draw';

  const getEvidenceStatusLabel = (status: Match['evidenceVerificationStatus']) => {
    const labels = isEnglish
      ? {
          not_required: 'Optional',
          pending: 'Pending',
          verified: 'Verified',
          mismatch: 'Mismatch',
          unreadable: 'Unreadable',
          missing: 'Missing',
        }
      : {
          not_required: '无需核验',
          pending: '待核验',
          verified: '已核验',
          mismatch: '证据不符',
          unreadable: '图片不清',
          missing: '缺少截图',
        };
    return status ? labels[status] : '';
  };

  const getPublicStatusLabel = (status: Match['publicResultStatus']) => {
    const labels = isEnglish
      ? {
          not_announced: 'Not announced',
          announced: 'Announced',
          default_confirmed: 'Confirmed',
          disputed: 'Disputed',
        }
      : {
          not_announced: '未公示',
          announced: '已公示',
          default_confirmed: '默认确认',
          disputed: '有异议',
        };
    return status ? labels[status] : '';
  };

  const getRankIcon = (rank: number | undefined) => {
    if (!rank) return null;
    if (rank === 1) return <Trophy className="w-3 h-3 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-3 h-3 text-slate-300" />;
    if (rank === 3) return <Award className="w-3 h-3 text-amber-600" />;
    return null;
  };

  const getResultText = (match: Match) => {
    if (match.isBye) return isEnglish ? 'Bye' : '轮空';
    if (match.isPlayoff && match.playoffBracketId) {
      const bracket = currentGroup.playoffBrackets?.find(b => b.id === match.playoffBracketId);
      return isEnglish
        ? `${bracket?.startRank ?? '?'}th-place tie group · Stage ${match.playoffStage} · ${match.playoffRole === 'placement' ? '3rd/4th place match · ' : ''}${match.result === 'pending' ? 'Pending' : 'Completed'}`
        : `第${bracket?.startRank ?? '?'}名同分组 · 第${match.playoffStage}阶段 · ${match.playoffRole === 'placement' ? '第3/4名赛 · ' : ''}${match.result === 'pending' ? '待进行' : '已完成'}`;
    }
    if (match.result === 'pending') return isEnglish ? 'Pending' : '待进行';
    if (match.preDrop) return isEnglish ? 'Pre-drop' : '赛前弃赛';
    return isEnglish ? 'Completed' : '已完成';
  };

  const getResultColor = (match: Match) => {
    if (match.isBye) return 'text-amber-400 bg-amber-500/10';
    if (match.result === 'pending') return 'text-slate-400 bg-slate-500/20';
    if (match.preDrop) return 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
    return 'text-emerald-400 bg-emerald-500/20';
  };

  // 赛前弃赛时的弃赛方文本（在卡片中部展示）
  const getPreDropNote = (match: Match): string | null => {
    if (!match.preDrop) return null;
    if (match.result === 'player1') {
      return isEnglish
        ? `${getPlayerName(match.player2Id) || 'Right side'} pre-dropped · ${getPlayerName(match.player1Id) || 'Left side'} wins`
        : `${getPlayerName(match.player2Id) || '右侧'} 赛前弃赛 · ${getPlayerName(match.player1Id) || '左侧'}直接获胜`;
    }
    if (match.result === 'player2') {
      return isEnglish
        ? `${getPlayerName(match.player1Id) || 'Left side'} pre-dropped · ${getPlayerName(match.player2Id) || 'Right side'} wins`
        : `${getPlayerName(match.player1Id) || '左侧'} 赛前弃赛 · ${getPlayerName(match.player2Id) || '右侧'}直接获胜`;
    }
    return null;
  };

  const handleSetResult = (matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => {
    const match = currentGroup.matches.find(m => m.id === matchId);
    if (match && match.result !== 'pending'
      && (match.resultSource === 'import' || match.resultSource === 'referee_override')
      && (match.result !== result || match.player1Games !== player1Games || match.player2Games !== player2Games)) {
      if (result === 'pending') {
        setConfirmState({
          open: true,
          title: isEnglish ? 'Reset imported result' : '重置导入结果',
          message: isEnglish
            ? 'Imported results cannot be reset directly. Use the referee override path with a new result.'
            : '导入结果不能直接清空，请通过裁判改判写入新的正式结果。',
          onConfirm: () => {},
        });
        return;
      }
      setOverrideRequest({
        matchId,
        result: result as Exclude<MatchResult, 'pending'>,
        player1Games,
        player2Games,
      });
      setOverrideReason('');
      return;
    }
    if (match?.playoffStage === 1 && result !== match.result && currentGroup.matches.some(m => m.playoffBracketId === match.playoffBracketId && m.playoffStage === 2)) {
      setConfirmState({
        open: true,
        title: isEnglish ? 'Change first-stage playoff result' : '修改首阶段加赛结果',
        message: isEnglish ? 'Changing the winner or resetting this match will clear the second-stage playoff bracket for this tied group. Other tied groups are unaffected.' : '修改胜者或重置后，将清除这个同分组的第二阶段对阵与赛果；其他同分组不受影响。',
        onConfirm: () => updateMatchResult(matchId, result, player1Games, player2Games, preDrop),
      });
      return;
    }
    updateMatchResult(matchId, result, player1Games, player2Games, preDrop);
  };

  const handleToggleExpand = (matchId: string) => {
    if (!canEdit(currentGroup.matches.find(m => m.id === matchId)!)) return;
    setExpandedMatch(expandedMatch === matchId ? null : matchId);
  };

  const isSingleElimination = currentGroup.pairingType === 'single_elimination';

  const canEditRound = useMemo(() => {
    if (!isSingleElimination) return false;
    if (viewRound !== currentGroup.currentRound) return false;
    if (currentGroup.status === 'completed') return false;
    const roundMatches = currentGroup.matches.filter(m => m.round === viewRound);
    return roundMatches.length > 0 && roundMatches.some(m => m.result === 'pending');
  }, [isSingleElimination, viewRound, currentGroup.currentRound, currentGroup.status, currentGroup.matches]);

  if (currentGroup.currentRound === 0) {
    return (
      <div className="glass-panel rounded-2xl p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Swords className="w-5 h-5 text-gold-400" />
            {isEnglish ? 'Match list' : '对阵表'}
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <Swords className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm">{isEnglish ? 'Tournament has not started yet' : '比赛尚未开始'}</p>
            <p className="text-xs mt-1">{isEnglish ? 'Click “Start match” on the right to generate pairings.' : '点击右侧"开始比赛"生成对阵'}</p>
          </div>
        </div>
      </div>
    );
  }

  const isPlayoffView = viewRound === 0;
  const roundGameType = isPlayoffView
    ? currentGroup.gameType
    : currentGroup.roundGameTypes?.[viewRound - 1] ?? currentGroup.gameType;
  const gameTypeLabel = currentGroup.pairingType === 'single_elimination'
    ? (isEnglish ? `Single elimination ${roundGameType.toUpperCase()}` : `单败淘汰 ${roundGameType.toUpperCase()}`)
    : roundGameType.toUpperCase();

  return (
    <div className="glass-panel rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
          <Swords className={`w-4 h-4 ${isPlayoffView ? 'text-amber-400' : 'text-gold-400'}`} />
          {isPlayoffView ? (isEnglish ? 'Playoff match list' : '加赛对阵表') : (isEnglish ? `Round ${viewRound} match list` : `第 ${viewRound} 轮对阵表`)}
        </h2>
        <div className="flex items-center gap-2">
          {canEditRound && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gold-500/15 text-gold-400 hover:bg-gold-500/25 transition-colors text-xs border border-gold-500/25"
              title={isEnglish ? "Edit this round's pairings" : '编辑本轮对阵'}
            >
              <Pencil className="w-3.5 h-3.5" />
              {isEnglish ? 'Edit pairings' : '编辑对阵'}
            </button>
          )}
          <span className="text-xs text-slate-500 font-mono">{gameTypeLabel}</span>
          {!editMode && <RoundTabs />}
        </div>
      </div>

      {testMode && currentGroup.currentRound > 0 && !editMode && (
        <div className="mb-3 space-y-1.5">
          {isRandomGenerating && (
            <div className="text-[11px] text-amber-300 font-medium flex items-center justify-between px-1 mb-2">
              <span>{isEnglish ? 'Generating results...' : '随机生成中...'} {randomGenerateProgress.current}/{randomGenerateProgress.total}</span>
              <span>{randomGenerateProgress.total > 0 ? Math.round((randomGenerateProgress.current / randomGenerateProgress.total) * 100) : 0}%</span>
            </div>
          )}
          {isRandomGenerating && (
            <div className="w-full h-1 rounded-full bg-slate-700/60 overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-fuchsia-500 transition-all"
                style={{
                  width: `${randomGenerateProgress.total > 0 ? Math.min(100, (randomGenerateProgress.current / randomGenerateProgress.total) * 100) : 0}%`,
                }}
              />
            </div>
          )}
          <button
            disabled={isRandomGenerating}
            onClick={() => {
              if (isRandomGenerating) return;
              const currentMatches = currentGroup.matches.filter(
                m => m.round === currentGroup.currentRound && m.result === 'pending' && !m.isBye
              );
              for (const match of currentMatches) {
                const roundGt = currentGroup.roundGameTypes?.[currentGroup.currentRound - 1] ?? currentGroup.gameType;
                const winScore = roundGt === 'bo7' ? 4 : roundGt === 'bo5' ? 3 : roundGt === 'bo3' ? 2 : 1;
                if (roundGt === 'bo1') {
                  const roll = Math.random();
                  const result: MatchResult = roll < 0.5 ? 'player1' : 'player2';
                  updateMatchResult(match.id, result, result === 'player1' ? 1 : 0, result === 'player2' ? 1 : 0);
                } else {
                  const isP1Win = Math.random() < 0.5;
                  const loserGames = Math.floor(Math.random() * winScore);
                  if (isP1Win) {
                    updateMatchResult(match.id, 'player1', winScore, loserGames);
                  } else {
                    updateMatchResult(match.id, 'player2', loserGames, winScore);
                  }
                }
              }
            }}
            className="w-full py-1.5 rounded-md bg-gradient-to-r from-violet-500/20 to-violet-600/20 text-violet-300 hover:from-violet-500/30 hover:to-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium flex items-center justify-center gap-1.5 border border-violet-500/30"
          >
            <Dice3 className={`w-3 h-3 ${isRandomGenerating ? 'animate-spin' : ''}`} />
            {isEnglish ? 'Randomize current round results' : '随机生成当前轮结果'}
          </button>

          {competition.groups.filter(g => g.status === 'in_progress' && g.currentRound > 0).length > 1 && (
            <button
              disabled={isRandomGenerating}
              onClick={() => {
                if (isRandomGenerating) return;
                setConfirmState({
                  open: true,
                  title: isEnglish ? 'Confirm random generation' : '确认随机生成',
                  message: isEnglish ? 'Are you sure you want to randomize all groups for the current round?' : '确定要随机生成所有小组当前轮次的结果吗？',
                  onConfirm: () => randomGenerateCurrentRoundAllGroups(),
                });
              }}
              className="w-full py-1.5 rounded-md bg-gradient-to-r from-indigo-500/20 to-indigo-600/20 text-indigo-300 hover:from-indigo-500/30 hover:to-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium flex items-center justify-center gap-1.5 border border-indigo-500/30"
            >
              <Dice3 className={`w-3 h-3 ${isRandomGenerating ? 'animate-spin' : ''}`} />
              {isEnglish ? 'Randomize all groups current round' : '随机生成所有小组当前轮结果'}
            </button>
          )}

          {competition.groups.some(g => g.status === 'in_progress') && (() => {
            const inProgressCount = competition.groups.filter(g => g.status === 'in_progress').length;
            const isSingleGroup = inProgressCount <= 1;
            const btnText = isEnglish
              ? (isSingleGroup ? 'Randomize all rounds of match results' : 'Randomize all groups match results')
              : (isSingleGroup ? '随机生成所有轮次比赛结果' : '随机生成所有小组比赛结果');
            const confirmText = isEnglish
              ? (isSingleGroup ? 'Are you sure you want to randomize all match results for every round? This action cannot be undone.' : 'Are you sure you want to randomize all match results for every group and every round? This action cannot be undone.')
              : (isSingleGroup ? '确定要随机生成所有轮次的比赛结果吗？此操作不可恢复。' : '确定要随机生成所有小组的所有轮次比赛结果吗？此操作不可恢复。');
            return (
              <button
                disabled={isRandomGenerating}
                onClick={() => {
                  if (isRandomGenerating) return;
                  setConfirmState({
                    open: true,
                    title: isEnglish ? 'Confirm random generation' : '确认随机生成',
                    message: confirmText,
                    onConfirm: () => randomGenerateAllGroups(),
                  });
                }}
                className="w-full py-1.5 rounded-md bg-gradient-to-r from-fuchsia-500/20 to-fuchsia-600/20 text-fuchsia-300 hover:from-fuchsia-500/30 hover:to-fuchsia-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium flex items-center justify-center gap-1.5 border border-fuchsia-500/30"
              >
                <Dice3 className={`w-3 h-3 ${isRandomGenerating ? 'animate-spin' : ''}`} />
                {btnText}
              </button>
            );
          })()}
        </div>
      )}

      {editMode && canEditRound && (
        <RoundEditor
          matches={matches}
          players={currentGroup.players}
          isEnglish={isEnglish}
          onCancel={() => setEditMode(false)}
          onSave={(updates) => {
            batchUpdateRoundMatches(viewRound, updates);
            setEditMode(false);
          }}
        />
      )}

      {!editMode && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          {matches.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Swords className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{isEnglish ? 'No match information yet' : '暂无对阵信息'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {matches.map((match, index) => {
                const isExpanded = expandedMatch === match.id;
                const canEditMatch = canEdit(match);
                const isDragged = draggedId === match.id;
                const isDragOver = dragOverId === match.id && draggedId !== null && draggedId !== match.id;

                return (
                  <div
                    key={match.id}
                    draggable={!editMode}
                    onDragStart={(e) => {
                      if (editMode) return;
                      setDraggedId(match.id);
                      e.dataTransfer.effectAllowed = 'move';
                      try { e.dataTransfer.setData('text/plain', match.id); } catch { /* ignore */ }
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      if (editMode || !draggedId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverId !== match.id) setDragOverId(match.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverId === match.id) setDragOverId(null);
                    }}
                    onDrop={(e) => {
                      if (editMode || !draggedId) return;
                      e.preventDefault();
                      if (draggedId !== match.id) {
                        reorderMatches(viewRound, draggedId, match.id);
                      }
                      setDraggedId(null);
                      setDragOverId(null);
                    }}
                    className={`
                      bg-slate-800/40 rounded-lg overflow-hidden transition-all
                      border border-slate-700/40 relative group
                      ${isExpanded ? 'border-gold-500/30' : ''}
                      ${!editMode ? 'cursor-grab active:cursor-grabbing' : ''}
                      ${isDragged ? 'opacity-40 ring-2 ring-gold-500/40' : ''}
                      ${isDragOver ? 'border-t-2 border-t-gold-500' : ''}
                    `}
                  >
                    {/* 拖拽手柄（hover 时显示） */}
                    {!editMode && (
                      <div
                        className="absolute top-1.5 left-1.5 z-10 p-0.5 rounded bg-slate-900/60 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                        title={isEnglish ? 'Drag to reorder' : '拖拽调整顺序'}
                      >
                        <GripVertical className="w-3 h-3" />
                      </div>
                    )}
                    <div
                      className="p-3"
                      onClick={() => canEditMatch && handleToggleExpand(match.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-mono">
                            #{String(index + 1).padStart(2, '0')}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getResultColor(match)}`}>
                            {getResultText(match)}
                          </span>
                        </div>
                        {canEditMatch && (
                          <button className="text-slate-500 hover:text-white transition-colors">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      <div className="flex items-stretch gap-3">
                        <div className={`
                          flex-1 rounded-md p-2.5 transition-all font-bold text-center
                          ${isWinner(match, 1) ? 'bg-yellow-500 text-white' : ''}
                          ${isLoser(match, 1) ? 'bg-slate-700 text-slate-300' : ''}
                          ${isDraw(match) ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50' : ''}
                          ${match.result === 'pending' && !match.isBye && canEditMatch ? 'bg-slate-700/40 text-white cursor-pointer' : ''}
                          ${match.result === 'pending' && !match.isBye && !canEditMatch ? 'bg-slate-700/20 text-slate-400' : ''}
                          ${match.isBye && match.player1Id !== 'bye' ? 'bg-amber-500 text-white' : ''}
                          ${match.player1Id === 'bye' ? 'bg-slate-800/30 text-slate-500' : ''}
                        `}>
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            {getRankIcon(getPlayerRank(match.player1Id))}
                            <span className="truncate text-sm">{getPlayerName(match.player1Id)}</span>
                          </div>
                          {getPlayerUid(match.player1Id) && (
                            <div className="truncate text-[9px] font-mono opacity-65">
                              UID {getPlayerUid(match.player1Id)}
                            </div>
                          )}
                          {match.player1Id !== 'bye' && (
                            <div className="text-[10px] opacity-70">
                              {getPlayerRecord(match.player1Id)}
                            </div>
                          )}
                          {match.result !== 'pending' && match.player1Id !== 'bye' && match.player1Games !== undefined && (
                            <div className="text-base font-bold mt-0.5">
                              {match.player1Games}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600/50">
                            <span className="font-display text-[10px] font-bold text-slate-400">VS</span>
                          </div>
                          {match.preDrop && getPreDropNote(match) && (
                            <div className="w-32 -mx-2 text-[9px] text-rose-400 text-center leading-tight bg-rose-500/10 border border-rose-500/20 rounded-md px-1.5 py-0.5">
                              {getPreDropNote(match)}
                            </div>
                          )}
                        </div>

                        <div className={`
                          flex-1 rounded-md p-2.5 transition-all font-bold text-center
                          ${isWinner(match, 2) ? 'bg-yellow-500 text-white' : ''}
                          ${isLoser(match, 2) ? 'bg-slate-700 text-slate-300' : ''}
                          ${isDraw(match) ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50' : ''}
                          ${match.result === 'pending' && !match.isBye && canEditMatch ? 'bg-slate-700/40 text-white cursor-pointer' : ''}
                          ${match.result === 'pending' && !match.isBye && !canEditMatch ? 'bg-slate-700/20 text-slate-400' : ''}
                          ${match.player2Id === 'bye' ? 'bg-amber-500 text-white' : ''}
                        `}>
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            {getRankIcon(getPlayerRank(match.player2Id))}
                            <span className="truncate text-sm">{getPlayerName(match.player2Id)}</span>
                          </div>
                          {getPlayerUid(match.player2Id) && (
                            <div className="truncate text-[9px] font-mono opacity-65">
                              UID {getPlayerUid(match.player2Id)}
                            </div>
                          )}
                          {match.player2Id !== 'bye' && (
                            <div className="text-[10px] opacity-70">
                              {getPlayerRecord(match.player2Id)}
                            </div>
                          )}
                          {match.result !== 'pending' && match.player2Id !== 'bye' && match.player2Games !== undefined && (
                            <div className="text-base font-bold mt-0.5">
                              {match.player2Games}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && canEditMatch && (
                      <div className="px-3 pb-3">
                        <div className="p-2.5 bg-slate-900/40 rounded-lg space-y-2.5">
                          {(match.evidenceVerificationStatus || match.publicResultStatus || match.resultSource) && (
                            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[9px]">
                              {match.resultSource && (
                                <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-sky-300">
                                  {match.resultSource === 'import' ? '导入结果' : match.resultSource === 'referee_override' ? '裁判改判' : '手工录入'}
                                </span>
                              )}
                              {match.evidenceVerificationStatus && (
                                <span className={`rounded border px-1.5 py-0.5 ${
                                  match.evidenceVerificationStatus === 'verified'
                                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                    : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                                }`}>
                                  {isEnglish ? 'Evidence' : '截图'}：{getEvidenceStatusLabel(match.evidenceVerificationStatus)}
                                </span>
                              )}
                              {match.publicResultStatus && (
                                <span className={`rounded border px-1.5 py-0.5 ${
                                  match.publicResultStatus === 'disputed'
                                    ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                                    : 'border-slate-600 bg-slate-700/40 text-slate-300'
                                }`}>
                                  {isEnglish ? 'Publication' : '公示'}：{getPublicStatusLabel(match.publicResultStatus)}
                                </span>
                              )}
                              {match.evidenceRefs?.[0] && (
                                <span className="max-w-full truncate rounded border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 font-mono text-slate-400">
                                  {match.evidenceRefs[0]}
                                </span>
                              )}
                            </div>
                          )}
                          <div>
                            <div className="text-[10px] text-slate-400 mb-2 text-center">{match.isPlayoff
                              ? (isEnglish
                                ? `Playoff stage ${match.playoffStage ?? 1} · ${match.playoffRole === 'placement' ? '3rd/4th place' : match.playoffRole === 'final' ? 'final' : 'opening bracket match'}`
                                : `加赛第${match.playoffStage ?? 1}阶段 · ${match.playoffRole === 'placement' ? '第3/4名赛' : match.playoffRole === 'final' ? '决胜场' : '首场抽签对阵'}`)
                              : (isEnglish ? 'Select match result' : '选择比赛结果')}</div>
                            <ResultButtons
                              gameType={roundGameType}
                              playoff={!!match.isPlayoff}
                              isEnglish={isEnglish}
                              onResult={(result, p1g, p2g, preDrop) => handleSetResult(match.id, result, p1g, p2g, preDrop)}
                            />
                          </div>
                          {match.preDrop && (
                            <div className="text-[10px] text-rose-300 text-center bg-rose-500/10 border border-rose-500/20 rounded-md py-1.5">
                              {isEnglish ? 'This match is marked as a pre-drop; it does not count toward opponent win rate. Choose any normal score above to clear this flag.' : '当前标记为赛前弃赛（该场不计入对手胜率）。选择上方任意"正常比分"按钮即可取消标记。'}
                            </div>
                          )}
                          {match.result !== 'pending' && !match.preDrop && (
                            <button
                              onClick={() => markResultDisputed(match.id, 'Referee marked from match list')}
                              className="w-full rounded-md border border-rose-500/20 bg-rose-500/5 py-1.5 text-[10px] text-rose-300"
                            >
                              {isEnglish ? 'Mark result as disputed' : '标记本场结果有异议'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.open}
        onClose={() => setConfirmState(s => ({ ...s, open: false }))}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={isEnglish ? 'Confirm' : '确认'}
        onConfirm={() => {
          confirmState.onConfirm();
          setConfirmState(s => ({ ...s, open: false }));
        }}
      />

      {overrideRequest && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white">
              {isEnglish ? 'Referee result override' : '裁判改判'}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {isEnglish
                ? 'This match came from an import. A reason is required, and unplayed later rounds will be invalidated.'
                : '该场来自结果导入。必须填写改判原因；尚未开赛的后续轮次会失效并重新计算。'}
            </p>
            <textarea
              value={overrideReason}
              onChange={event => setOverrideReason(event.target.value)}
              className="mt-3 h-24 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-rose-500/40"
              placeholder={isEnglish ? 'Reason and evidence reference...' : '填写改判原因和证据引用...'}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOverrideRequest(null)}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-300"
              >
                {isEnglish ? 'Cancel' : '取消'}
              </button>
              <button
                disabled={!overrideReason.trim()}
                onClick={() => {
                  const targetMatch = currentGroup.matches.find(item => item.id === overrideRequest.matchId);
                  const applied = overrideMatchResult(
                    overrideRequest.matchId,
                    overrideRequest.result,
                    overrideRequest.player1Games,
                    overrideRequest.player2Games,
                    overrideReason,
                    targetMatch?.evidenceRefs
                  );
                  if (!applied) {
                    setConfirmState({
                      open: true,
                      title: isEnglish ? 'Cannot override' : '无法改判',
                      message: isEnglish
                        ? 'Later rounds already contain played matches. Manual tournament-director handling is required.'
                        : '后续轮次已经有已开赛结果，不能自动重排，需要赛事总负责人处理。',
                      onConfirm: () => {},
                    });
                  }
                  setOverrideRequest(null);
                }}
                className="rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-300 disabled:opacity-40"
              >
                {isEnglish ? 'Confirm override' : '确认改判'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
