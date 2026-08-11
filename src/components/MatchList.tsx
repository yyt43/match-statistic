import { Swords, X, Trophy, Award, Medal, ChevronDown, ChevronUp, Dice3, Pencil, ArrowLeftRight, Shuffle, ListOrdered } from 'lucide-react';
import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';
import { RoundTabs } from './RoundTabs';
import type { Match, MatchResult, GameType, Player } from '../types';
import { useMemo, useState, useEffect } from 'react';

interface MatchListProps {
  testMode?: boolean;
}

export function MatchList({ testMode = false }: MatchListProps) {
  const currentGroup = useCurrentGroup();
  const { viewRound, updateMatchResult, competition, randomGenerateAllGroups, randomGenerateCurrentRoundAllGroups, batchUpdateRoundMatches, isRandomGenerating, randomGenerateProgress } = useTournamentStore();
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

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

  const getPlayerName = (id: string) => {
    if (id === 'bye') return '轮空';
    return playerMap.get(id)?.name || '未知选手';
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
    if (currentGroup.status === 'completed') return false;
    if (match.isBye) return false;
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

  const getRankIcon = (rank: number | undefined) => {
    if (!rank) return null;
    if (rank === 1) return <Trophy className="w-3 h-3 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-3 h-3 text-slate-300" />;
    if (rank === 3) return <Award className="w-3 h-3 text-amber-600" />;
    return null;
  };

  const getResultText = (match: Match) => {
    if (match.isBye) return '轮空';
    if (match.result === 'pending') return '待进行';
    return '已完成';
  };

  const getResultColor = (match: Match) => {
    if (match.isBye) return 'text-amber-400 bg-amber-500/10';
    if (match.result === 'pending') return 'text-slate-400 bg-slate-500/20';
    return 'text-emerald-400 bg-emerald-500/20';
  };

  const handleSetResult = (matchId: string, result: MatchResult, player1Games?: number, player2Games?: number) => {
    updateMatchResult(matchId, result, player1Games, player2Games);
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
            对阵表
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <Swords className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm">比赛尚未开始</p>
            <p className="text-xs mt-1">点击右侧"开始比赛"生成对阵</p>
          </div>
        </div>
      </div>
    );
  }

  const roundGameType = currentGroup.roundGameTypes?.[viewRound - 1] ?? currentGroup.gameType;
  const gameTypeLabel = currentGroup.pairingType === 'single_elimination'
    ? `单败淘汰 ${roundGameType.toUpperCase()}`
    : roundGameType.toUpperCase();

  return (
    <div className="glass-panel rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
          <Swords className="w-4 h-4 text-gold-400" />
          第 {viewRound} 轮对阵表
        </h2>
        <div className="flex items-center gap-2">
          {canEditRound && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gold-500/15 text-gold-400 hover:bg-gold-500/25 transition-colors text-xs border border-gold-500/25"
              title="编辑本轮对阵"
            >
              <Pencil className="w-3.5 h-3.5" />
              编辑对阵
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
              <span>随机生成中... {randomGenerateProgress.current}/{randomGenerateProgress.total}</span>
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
            随机生成当前轮结果
          </button>

          {competition.groups.filter(g => g.status === 'in_progress' && g.currentRound > 0).length > 1 && (
            <button
              disabled={isRandomGenerating}
              onClick={() => {
                if (isRandomGenerating) return;
                if (window.confirm('确定要随机生成所有小组当前轮次的结果吗？')) {
                  randomGenerateCurrentRoundAllGroups();
                }
              }}
              className="w-full py-1.5 rounded-md bg-gradient-to-r from-indigo-500/20 to-indigo-600/20 text-indigo-300 hover:from-indigo-500/30 hover:to-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium flex items-center justify-center gap-1.5 border border-indigo-500/30"
            >
              <Dice3 className={`w-3 h-3 ${isRandomGenerating ? 'animate-spin' : ''}`} />
              随机生成所有小组当前轮结果
            </button>
          )}

          {competition.groups.some(g => g.status === 'in_progress') && (() => {
            const inProgressCount = competition.groups.filter(g => g.status === 'in_progress').length;
            const isSingleGroup = inProgressCount <= 1;
            const btnText = isSingleGroup ? '随机生成所有轮次比赛结果' : '随机生成所有小组比赛结果';
            const confirmText = isSingleGroup
              ? '确定要随机生成所有轮次的比赛结果吗？此操作不可恢复。'
              : '确定要随机生成所有小组的所有轮次比赛结果吗？此操作不可恢复。';
            return (
              <button
                disabled={isRandomGenerating}
                onClick={() => {
                  if (isRandomGenerating) return;
                  if (window.confirm(confirmText)) {
                    randomGenerateAllGroups();
                  }
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
              <p className="text-sm">暂无对阵信息</p>
            </div>
          ) : (
            <div className="space-y-2">
              {matches.map((match, index) => {
                const isExpanded = expandedMatch === match.id;
                const canEditMatch = canEdit(match);

                return (
                  <div
                    key={match.id}
                    className={`
                      bg-slate-800/40 rounded-lg overflow-hidden transition-all
                      border border-slate-700/40
                      ${isExpanded ? 'border-gold-500/30' : ''}
                    `}
                  >
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

                        <div className="flex flex-col items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600/50">
                            <span className="font-display text-[10px] font-bold text-slate-400">VS</span>
                          </div>
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
                        <div className="p-2.5 bg-slate-900/40 rounded-lg">
                          <div className="text-[10px] text-slate-400 mb-2 text-center">选择比赛结果</div>
                          <ResultButtons
                            gameType={roundGameType}
                            onResult={(result, p1g, p2g) => handleSetResult(match.id, result, p1g, p2g)}
                          />
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
    </div>
  );
}

function ResultButtons({ gameType, onResult }: { gameType: GameType; onResult: (result: 'player1' | 'player2' | 'draw' | 'pending', p1g?: number, p2g?: number) => void }) {
  if (gameType === 'bo1') {
    return (
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => onResult('player1', 1, 0)} className="py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30">左侧胜 (1-0)</button>
        <button onClick={() => onResult('player2', 0, 1)} className="py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30">右侧胜 (0-1)</button>
        <button onClick={() => onResult('draw', 0, 0)} className="py-2 rounded-lg text-sm font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition-colors border border-orange-500/30">双负 (0-0)</button>
      </div>
    );
  }

  const winScore = gameType === 'bo7' ? 4 : gameType === 'bo5' ? 3 : 2;
  const options: Array<{ result: 'player1' | 'player2'; p1g: number; p2g: number; label: string }> = [];

  for (let loserGames = 0; loserGames < winScore; loserGames++) {
    options.push({ result: 'player1', p1g: winScore, p2g: loserGames, label: `左侧 ${winScore}-${loserGames}` });
  }
  for (let loserGames = winScore - 1; loserGames >= 0; loserGames--) {
    options.push({ result: 'player2', p1g: loserGames, p2g: winScore, label: `右侧 ${winScore}-${loserGames}` });
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => onResult(opt.result, opt.p1g, opt.p2g)}
          className="py-2 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30"
        >
          {opt.label}
        </button>
      ))}
      <button onClick={() => onResult('draw', 0, 0)} className="py-2 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition-colors border border-orange-500/30">双负 (0-0)</button>
      <button onClick={() => onResult('pending')} className="py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1"><X className="w-3 h-3" />重置</button>
    </div>
  );
}

function RoundEditor({ matches, players, onSave, onCancel }: {
  matches: Match[];
  players: Player[];
  onSave: (updates: { matchId: string; player1Id: string; player2Id: string; isBye?: boolean }[]) => void;
  onCancel: () => void;
}) {
  const editableMatches = matches.filter(m => m.result === 'pending');
  const [slots, setSlots] = useState<Record<string, { p1: string; p2: string; isBye: boolean }>>(() => {
    const init: Record<string, { p1: string; p2: string; isBye: boolean }> = {};
    for (const m of editableMatches) {
      init[m.id] = { p1: m.player1Id, p2: m.player2Id, isBye: !!m.isBye };
    }
    return init;
  });
  const [selected, setSelected] = useState<{ matchId: string; side: 'p1' | 'p2' } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerName = (id: string) => id === 'bye' ? '轮空' : (players.find(p => p.id === id)?.name || '未知');

  const isByeSlot = (matchId: string, side: 'p1' | 'p2') => {
    return slots[matchId]?.isBye && side === 'p2';
  };

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 1200);
  };

  const handleSlotClick = (matchId: string, side: 'p1' | 'p2') => {
    if (isByeSlot(matchId, side)) return;
    if (!selected) {
      setSelected({ matchId, side });
      return;
    }
    if (isByeSlot(selected.matchId, selected.side)) return;
    if (selected.matchId === matchId && selected.side === side) {
      setSelected(null);
      return;
    }
    const fromId = slots[selected.matchId][selected.side];
    const toId = slots[matchId][side];
    setSlots(prev => {
      const next = { ...prev };
      next[selected.matchId] = {
        ...prev[selected.matchId],
        [selected.side]: toId,
      };
      next[matchId] = {
        ...next[matchId],
        [side]: fromId,
      };
      return next;
    });
    setSelected(null);
    showFlash('已交换');
  };

  // 随机分配：将所有参赛选手打乱后重新两两配对
  const handleRandomAssign = () => {
    const allPlayerIds: string[] = [];
    for (const m of editableMatches) {
      if (slots[m.id].p1 !== 'bye') allPlayerIds.push(slots[m.id].p1);
      if (slots[m.id].p2 !== 'bye') allPlayerIds.push(slots[m.id].p2);
    }
    // Fisher-Yates 洗牌
    for (let i = allPlayerIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPlayerIds[i], allPlayerIds[j]] = [allPlayerIds[j], allPlayerIds[i]];
    }
    const next: Record<string, { p1: string; p2: string; isBye: boolean }> = { ...slots };
    let idx = 0;
    for (const m of editableMatches) {
      if (slots[m.id].isBye) {
        const p1 = allPlayerIds[idx++];
        if (p1) {
          next[m.id] = { p1, p2: 'bye', isBye: true };
        }
      } else {
        const p1 = allPlayerIds[idx++];
        const p2 = allPlayerIds[idx++];
        if (p1 && p2 && p1 !== p2) {
          next[m.id] = { p1, p2, isBye: false };
        }
      }
    }
    setSlots(next);
    setSelected(null);
    setError(null);
    showFlash('已随机分配');
  };

  // 按录入顺序：选手1 vs 选手2, 选手3 vs 选手4 ...
  const handleSequentialAssign = () => {
    const ordered = players.filter(p => !p.dropped && !p.eliminated);
    const next: Record<string, { p1: string; p2: string; isBye: boolean }> = { ...slots };
    let idx = 0;
    let conflict = false;
    for (const m of editableMatches) {
      if (slots[m.id].isBye) {
        const p1 = ordered[idx];
        if (!p1) {
          conflict = true;
          break;
        }
        next[m.id] = { p1: p1.id, p2: 'bye', isBye: true };
        idx += 1;
      } else {
        const p1 = ordered[idx];
        const p2 = ordered[idx + 1];
        if (!p1 || !p2) {
          conflict = true;
          break;
        }
        if (p1.id === p2.id) {
          conflict = true;
          break;
        }
        next[m.id] = { p1: p1.id, p2: p2.id, isBye: false };
        idx += 2;
      }
    }
    setSlots(next);
    setSelected(null);
    if (conflict) {
      setError('选手数量不足以填满所有对阵，剩余对阵保持原值');
    } else {
      setError(null);
      showFlash('已按录入顺序分配');
    }
  };

  const handleSave = () => {
    const updates = editableMatches.map(m => ({
      matchId: m.id,
      player1Id: slots[m.id].p1,
      player2Id: slots[m.id].p2,
      isBye: slots[m.id].isBye,
    }));
    onSave(updates);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="mb-3 px-3 py-2 bg-gold-500/10 rounded-lg border border-gold-500/20 flex items-center gap-2">
        <ArrowLeftRight className="w-3.5 h-3.5 text-gold-400 flex-shrink-0" />
        <span className="text-[11px] text-gold-300/90">
          点击选手高亮选中，再点击另一选手即可交换；点击已选中选手可取消
        </span>
      </div>

      {/* 一键分配工具栏 */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={handleRandomAssign}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 transition-colors text-xs border border-violet-500/30"
        >
          <Shuffle className="w-3.5 h-3.5" />
          随机分配
        </button>
        <button
          onClick={handleSequentialAssign}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors text-xs border border-emerald-500/30"
        >
          <ListOrdered className="w-3.5 h-3.5" />
          按录入顺序
        </button>
      </div>

      {error && (
        <div className="mb-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {editableMatches.map((match, index) => {
          const p1Selected = selected?.matchId === match.id && selected.side === 'p1';
          const p2Selected = selected?.matchId === match.id && selected.side === 'p2';
          const isBye = slots[match.id].isBye;
          const samePerson = !isBye && slots[match.id].p1 === slots[match.id].p2;
          return (
            <div
              key={match.id}
              className={`bg-slate-800/40 rounded-lg p-3 border ${
                samePerson ? 'border-rose-500/50 bg-rose-500/5' : isBye ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700/40'
              }`}
            >
              <div className="text-[10px] text-slate-500 font-mono mb-2">
                #{String(index + 1).padStart(2, '0')}
                {isBye && (
                  <span className="ml-2 text-amber-400">轮空</span>
                )}
                {samePerson && (
                  <span className="ml-2 text-rose-400">双方为同一人，请调整</span>
                )}
              </div>
              <div className="flex items-stretch gap-3">
                <button
                  onClick={() => handleSlotClick(match.id, 'p1')}
                  className={`
                    flex-1 rounded-md p-2.5 font-bold text-center transition-all relative
                    ${p1Selected
                      ? 'bg-gold-500/50 text-white ring-2 ring-gold-400 scale-[1.03] shadow-lg shadow-gold-500/20'
                      : 'bg-slate-700/40 text-white hover:bg-slate-700/60'}
                  `}
                >
                  {p1Selected && (
                    <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-gold-300 animate-pulse" />
                  )}
                  <span className="truncate text-sm block">{playerName(slots[match.id].p1)}</span>
                </button>
                <div className="flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600/50">
                    <span className="font-display text-[10px] font-bold text-slate-400">VS</span>
                  </div>
                </div>
                {isBye ? (
                  <div className="flex-1 rounded-md p-2.5 font-bold text-center bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-not-allowed">
                    <span className="truncate text-sm block">轮空</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSlotClick(match.id, 'p2')}
                    className={`
                      flex-1 rounded-md p-2.5 font-bold text-center transition-all relative
                      ${p2Selected
                        ? 'bg-gold-500/50 text-white ring-2 ring-gold-400 scale-[1.03] shadow-lg shadow-gold-500/20'
                        : 'bg-slate-700/40 text-white hover:bg-slate-700/60'}
                    `}
                  >
                    {p2Selected && (
                      <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-gold-300 animate-pulse" />
                    )}
                    <span className="truncate text-sm block">{playerName(slots[match.id].p2)}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 交换反馈 toast */}
      {flash && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-gold-500/30 text-gold-200 text-xs border border-gold-400/40 backdrop-blur-sm pointer-events-none">
          {flash}
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-slate-700/40 mt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg bg-slate-700/40 text-slate-300 hover:bg-slate-700/60 transition-colors text-sm"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 rounded-lg bg-gold-500/20 text-gold-400 hover:bg-gold-500/30 border border-gold-500/30 transition-colors text-sm font-medium"
        >
          保存对阵
        </button>
      </div>
    </div>
  );
}
