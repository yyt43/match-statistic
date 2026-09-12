import { advancePlayoffs, clearPlayoffs, recordPlayoffResult, type ThreePlayerFormats } from '../utils/playoffs';
import { create } from 'zustand';
import type { TournamentCompetition, TournamentGroup, Player, MatchResult, TournamentStatus, GameType, PairingType } from '../types';
import { calculateAllWinRates, getRankedPlayers, generatePairings, getRoundGameType } from '../utils/swissPairing';
import { saveCompetition } from '../utils/storage/storage';
import { saveSnapshot } from '../utils/storage/snapshot';
import { evaluateGroupStatus, isRoundComplete, replaceGroupAtIndex, updateGroupAtIndex } from './competitionState';
import { applyMatchResultFast, generateNextRoundFast, recalculateRanking, yieldToMain } from './gameFlow';
import { createNewCompetition } from './tournamentFactory';
import { applyMatchResultToMap, revertMatchResult } from './matchResultMutators';
import { generateNextRoundForCompetition, startAllGroupsInCompetition, startTournamentForGroup } from './roundActions';
import { createCompetitionActions } from './actions/competitionActions';
import { createSnapshotActions } from './actions/snapshotActions';
import { createGroupActions } from './actions/groupActions';
import { createPlayerActions } from './actions/playerActions';
import { logAudit } from '../utils/auditLog';

export interface CompetitionState {
  competition: TournamentCompetition;
  viewRound: number;
  isRandomGenerating: boolean;
  randomGenerateProgress: { total: number; current: number };

  // 赛事级别操作
  initCompetition: (name: string, groupCount?: number, playerCountPerGroup?: number, roundsPerGroup?: number, gameType?: GameType, pairingType?: PairingType) => void;
  loadSavedCompetition: () => Promise<boolean>;
  importCompetition: (competition: TournamentCompetition) => void;
  updateCompetitionName: (name: string) => void;
  setCurrentGroup: (index: number) => void;
  addGroup: () => void;
  removeGroup: (index: number) => void;
  setGroupCount: (count: number) => void;
  batchSetGroupConfig: (playerCount: number, rounds: number, gameType: GameType, pairingType: PairingType, roundGameTypes?: GameType[]) => void;
  updateGroupName: (index: number, name: string) => void;

  // 小组级别操作（操作当前 group）
  addPlayer: (name: string) => void;
  addPlayers: (names: string[]) => void;
  replacePlayers: (names: string[]) => void;
  removePlayer: (playerId: string) => void;
  updatePlayerName: (playerId: string, name: string) => void;
  togglePlayerDropped: (playerId: string) => void;
  setPlayerCount: (count: number) => void;
  setTotalRounds: (rounds: number) => void;
  setGameType: (gameType: GameType) => void;
  setPairingType: (pairingType: PairingType) => void;
  setRoundGameType: (round: number, gameType: GameType) => void;

  startTournament: (totalRounds: number) => void;
  startAllGroups: () => void;
  generateNextRound: () => void;
  generateNextRoundForGroup: (groupIdx: number) => void;
  generateNextRoundAllGroups: () => void;
  undoLastRound: () => void;
  updateMatchResult: (matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => void;
  randomGenerateAllGroups: () => Promise<void>;
  randomGenerateCurrentRoundAllGroups: () => Promise<void>;
  updateMatchResultForGroup: (groupIdx: number, matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => void;
  updateMatchPlayers: (matchId: string, player1Id: string, player2Id: string) => void;
  batchUpdateRoundMatches: (round: number, updates: { matchId: string; player1Id: string; player2Id: string }[]) => void;
  reorderMatches: (round: number, fromMatchId: string, toMatchId: string) => void;
  restoreFromSnapshot: (snapshotId: string) => Promise<boolean>;
  createSnapshot: (label?: string) => Promise<void>;

  /** 生成加赛：检测当前小组排名中是否存在平分选手，若有则生成加赛对阵 */
  generatePlayoff: (formats?: ThreePlayerFormats) => void;
  resetPlayoffs: () => void;

  setViewRound: (round: number) => void;
  resetCompetition: () => void;
}

// 便捷 hook：获取当前小组（响应式）
export function useCurrentGroup(): TournamentGroup {
  return useTournamentStore(state => state.competition.groups[state.competition.currentGroupIndex]);
}

/**
 * 便捷 hook：当前轮是否已全部完成（响应式）。
 * 替代原先挂在 store 上的 isCurrentRoundComplete() getter，
 * 现在基于响应式 selector 派生，组件无需手动重新计算。
 */
export function useIsCurrentRoundComplete(): boolean {
  const group = useCurrentGroup();
  if (group.currentRound === 0) return false;
  const currentMatches = group.matches.filter(m => m.round === group.currentRound);
  return currentMatches.length > 0 && currentMatches.every(m => m.result !== 'pending');
}


const initialCompetition = createNewCompetition('新建赛事');

export const useTournamentStore = create<CompetitionState>((set, get) => ({
  competition: initialCompetition,
  viewRound: 0,
  isRandomGenerating: false,
  randomGenerateProgress: { total: 0, current: 0 },
  ...createCompetitionActions(set),
  ...createSnapshotActions(set, get),
  ...createGroupActions(set, get),
  ...createPlayerActions(set, get),

  updateCompetitionName: (name: string) => {
    const { competition } = get();
    const updated = { ...competition, name: name.trim() || '新建赛事' };
    set({ competition: updated });
    saveCompetition(updated);
  },

  startTournament: (totalRounds: number) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    let updated = startTournamentForGroup(competition, idx, totalRounds);
    set({ competition: updated });
    saveCompetition(updated);

    updated = generateNextRoundForCompetition(updated, idx);
    set({ competition: updated, viewRound: updated.groups[idx].currentRound });
    saveCompetition(updated);
  },

  startAllGroups: () => {
    const { competition } = get();
    let updated = startAllGroupsInCompetition(competition);
    set({ competition: updated });
    saveCompetition(updated);

    for (let i = 0; i < updated.groups.length; i++) {
      const g = updated.groups[i];
      if (g.status === 'in_progress' && g.currentRound === 0) {
        updated = generateNextRoundForCompetition(updated, i);
      }
    }

    const currentGroup = updated.groups[updated.currentGroupIndex];
    set({ competition: updated, viewRound: currentGroup.currentRound > 0 ? currentGroup.currentRound : 0 });
    saveCompetition(updated);
  },

  generateNextRound: () => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const updated = generateNextRoundForCompetition(competition, idx);
    set({ competition: updated, viewRound: updated.groups[idx].currentRound });
    saveCompetition(updated);
  },

  generateNextRoundForGroup: (groupIdx: number) => {
    const { competition } = get();
    const group = competition.groups[groupIdx];
    if (!group || group.status !== 'in_progress') return;

    const nextRound = group.currentRound + 1;
    if (nextRound > group.totalRounds) return;

    const roundGameType = getRoundGameType(group, nextRound);
    const { matches, updatedPlayers: pairedPlayers } = generatePairings(group.players, nextRound, roundGameType, group.pairingType, group.matches);

    // 使用配对后更新的选手（含上下匹配标记/次数）
    const playerMap = new Map(pairedPlayers.map(p => [p.id, { ...p }]));
    for (const match of matches) {
      if (match.isBye && match.result === 'player1') {
        const p = playerMap.get(match.player1Id);
        if (p) {
          p.points += 1;
          p.wins += 1;
          p.playedAgainst.push('bye');
          if (match.player1Games !== undefined && match.player2Games !== undefined) {
            p.totalGames += match.player1Games + match.player2Games;
            p.wonGames += match.player1Games;
          }
        }
      }
    }
    let updatedPlayers = Array.from(playerMap.values());
    const allMatches = [...group.matches, ...matches];
    updatedPlayers = calculateAllWinRates(updatedPlayers, allMatches, group.gameType);

    const updatedGroups = [...competition.groups];
    updatedGroups[groupIdx] = { ...group, currentRound: nextRound, matches: allMatches, players: updatedPlayers };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  generateNextRoundAllGroups: () => {
    const { competition } = get();

    // 为所有 in_progress 且当前轮已完成的小组生成下一轮
    for (let i = 0; i < competition.groups.length; i++) {
      const g = competition.groups[i];
      if (g.status !== 'in_progress') continue;
      if (g.currentRound >= g.totalRounds) continue;

      // 检查当前轮是否全部完成
      const currentMatches = g.matches.filter(m => m.round === g.currentRound);
      const allDone = currentMatches.length > 0 && currentMatches.every(m => m.result !== 'pending');
      if (!allDone) continue;

      get().generateNextRoundForGroup(i);
    }

    // 同步当前小组的 viewRound
    const updated = get().competition;
    const currentGroup = updated.groups[updated.currentGroupIndex];
    set({ viewRound: currentGroup.currentRound > 0 ? currentGroup.currentRound : 0 });
    saveCompetition(updated);
  },

  undoLastRound: () => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = clearPlayoffs(competition.groups[idx]);
    if (group.currentRound <= 0) return;

    const currentRound = group.currentRound;

    // 找到当前轮的所有比赛
    const currentRoundMatches = group.matches.filter(m => m.round === currentRound);

    // 创建选手副本
    const playerMap = new Map<string, Player>(group.players.map(p => [p.id, { ...p }]));
    const isSingleElimination = group.pairingType === 'single_elimination';

    // 回滚每场比赛的结果
    for (const match of currentRoundMatches) {
      const isPlayoff = !!match.isPlayoff;
      const wasPreDrop = !!match.preDrop;

      if (match.isBye) {
        const p1 = playerMap.get(match.player1Id);
        if (p1 && match.result === 'player1') {
          if (isPlayoff) {
            p1.playoffWins = (p1.playoffWins || 0) - 1;
          } else {
            p1.points -= 1; p1.wins -= 1;
            p1.playedAgainst = p1.playedAgainst.filter(id => id !== 'bye');
          }
          if (!isPlayoff && match.player1Games !== undefined && match.player2Games !== undefined) {
            p1.totalGames -= match.player1Games + match.player2Games;
            p1.wonGames -= match.player1Games;
          }
        }
        continue;
      }

      const p1 = playerMap.get(match.player1Id);
      const p2 = playerMap.get(match.player2Id);
      if (!p1 || !p2) continue;

      // 加赛：只撤销 playoffWins
      if (isPlayoff) {
        if (match.result === 'player1') {
          p1.playoffWins = (p1.playoffWins || 0) - 1;
        } else if (match.result === 'player2') {
          p2.playoffWins = (p2.playoffWins || 0) - 1;
        }
        continue;
      }

      if (match.result === 'player1') {
        p1.points -= 1; p1.wins -= 1;
        if (!wasPreDrop) {
          p2.losses -= 1;
          p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2.id);
          p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1.id);
        } else {
          // 赛前弃赛：弃赛方（p2）恢复为未退赛
          p2.dropped = false;
        }
        if (isSingleElimination) p2.eliminated = false;
      } else if (match.result === 'player2') {
        p2.points -= 1; p2.wins -= 1;
        if (!wasPreDrop) {
          p1.losses -= 1;
          p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2.id);
          p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1.id);
        } else {
          // 赛前弃赛：弃赛方（p1）恢复为未退赛
          p1.dropped = false;
        }
        if (isSingleElimination) p1.eliminated = false;
      } else if (match.result === 'draw') {
        p1.losses -= 1; p2.losses -= 1;
        if (!wasPreDrop) {
          p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2.id);
          p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1.id);
        }
        if (isSingleElimination) { p1.eliminated = false; p2.eliminated = false; }
      }

      // 赛前弃赛的局数据未实际发生，不扣减
      if (!wasPreDrop && match.player1Games !== undefined && match.player2Games !== undefined) {
        p1.totalGames -= match.player1Games + match.player2Games;
        p1.wonGames -= match.player1Games;
        p2.totalGames -= match.player1Games + match.player2Games;
        p2.wonGames -= match.player2Games;
      }
    }

    // 删除当前轮的比赛
    const remainingMatches = group.matches.filter(m => m.round !== currentRound);

    // 重新计算胜率
    let updatedPlayers = Array.from(playerMap.values());
    updatedPlayers = calculateAllWinRates(updatedPlayers, remainingMatches, group.gameType);

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = {
      ...group,
      currentRound: currentRound - 1,
      matches: remainingMatches,
      players: updatedPlayers,
      status: currentRound - 1 === 0 ? 'setup' as TournamentStatus : 'in_progress' as TournamentStatus,
    };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated, viewRound: currentRound - 1 });
    saveCompetition(updated);
    void logAudit('round-undo', `Round ${currentRound} undone`, { round: currentRound });
  },

  updateMatchResult: (matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];

    const matchIndex = group.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    const match = group.matches[matchIndex];

    if (match.isPlayoff) {
      const updated = updateGroupAtIndex(competition, idx, currentGroup => recordPlayoffResult(currentGroup, matchId, result, player1Games, player2Games));
      set({ competition: updated }); saveCompetition(updated);
      void logAudit('match-result', `${matchId} -> ${result}`, { matchId, result });
      return;
    }

    const oldResult = match.result;
    const oldPreDrop = !!match.preDrop;

    const playerMap = new Map<string, Player>(group.players.map(p => [p.id, { ...p }]));

    const isSingleElimination = group.pairingType === 'single_elimination';

    if (oldResult !== 'pending') {
      revertMatchResult(playerMap, match, oldResult, oldPreDrop, isSingleElimination);
    }

    if (result !== 'pending') {
      applyMatchResultToMap(playerMap, match, result, !!preDrop, isSingleElimination, player1Games, player2Games);
    }

    const updatedMatches = [...group.matches];
    updatedMatches[matchIndex] = { ...match, result, player1Games, player2Games, preDrop: !!preDrop };

    let updatedPlayers = Array.from(playerMap.values());
    updatedPlayers = calculateAllWinRates(updatedPlayers, updatedMatches, group.gameType);

    const rankedPlayers = getRankedPlayers(updatedPlayers, group.gameType, group.pairingType);
    const previousRankMap = new Map(
      getRankedPlayers(group.players, group.gameType, group.pairingType).map((p, i) => [p.id, i + 1])
    );
    updatedPlayers = rankedPlayers.map(p => ({ ...p, previousRank: previousRankMap.get(p.id) }));

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = {
      ...group,
      matches: updatedMatches,
      players: updatedPlayers,
      status: evaluateGroupStatus({ ...group, matches: updatedMatches, players: updatedPlayers }),
    };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
    void logAudit('match-result', `${matchId} -> ${result}`, { matchId, result });

    const hasCompletedCurrentRound = isRoundComplete({ ...group, matches: updatedMatches, players: updatedPlayers });

    if (hasCompletedCurrentRound) {
      try {
        void saveSnapshot(
          updated,
          `${group.name}·第${group.currentRound}轮完赛`,
          { replaceSameLabel: true }
        );
      } catch { /* 快照失败不影响主流程 */ }
    }
  },

  setViewRound: (round: number) => {
    set({ viewRound: round });
  },

  generatePlayoff: (formats) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = advancePlayoffs(competition.groups[idx], formats);
    const updated = replaceGroupAtIndex(competition, idx, group);
    set({ competition: updated, viewRound: group.matches.some(m => m.isPlayoff) ? 0 : group.currentRound });
    saveCompetition(updated);
  },

  resetPlayoffs: () => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = clearPlayoffs(competition.groups[idx]);
    const updated = replaceGroupAtIndex(competition, idx, group);
    set({ competition: updated, viewRound: group.currentRound });
    saveCompetition(updated);
  },

  updateMatchResultForGroup: (groupIdx: number, matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => {
    const { competition } = get();
    const group = competition.groups[groupIdx];
    if (!group) return;

    const matchIndex = group.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    const match = group.matches[matchIndex];
    if (match.isPlayoff) {
      const groups = [...competition.groups];
      groups[groupIdx] = recordPlayoffResult(group, matchId, result, player1Games, player2Games);
      const updated = { ...competition, groups };
      set({ competition: updated }); saveCompetition(updated);
      void logAudit('match-result', `${matchId} -> ${result}`, { matchId, result });
      return;
    }

    const oldResult = match.result;
    const oldPreDrop = !!match.preDrop;

    const playerMap = new Map<string, Player>(group.players.map(p => [p.id, { ...p }]));

    const isSingleElimination = group.pairingType === 'single_elimination';

    if (oldResult !== 'pending') {
      revertMatchResult(playerMap, match, oldResult, oldPreDrop, isSingleElimination);
    }

    if (result !== 'pending') {
      applyMatchResultToMap(playerMap, match, result, !!preDrop, isSingleElimination, player1Games, player2Games);
    }

    const updatedMatches = [...group.matches];
    updatedMatches[matchIndex] = { ...match, result, player1Games, player2Games, preDrop: !!preDrop };

    let updatedPlayers = Array.from(playerMap.values());
    updatedPlayers = calculateAllWinRates(updatedPlayers, updatedMatches, group.gameType);

    const rankedPlayers = getRankedPlayers(updatedPlayers, group.gameType, group.pairingType);
    const previousRankMap = new Map(
      getRankedPlayers(group.players, group.gameType, group.pairingType).map((p, i) => [p.id, i + 1])
    );
    updatedPlayers = rankedPlayers.map(p => ({ ...p, previousRank: previousRankMap.get(p.id) }));

    const updatedGroups = [...competition.groups];
    updatedGroups[groupIdx] = {
      ...group,
      matches: updatedMatches,
      players: updatedPlayers,
      status: evaluateGroupStatus({ ...group, matches: updatedMatches, players: updatedPlayers }),
    };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
    void logAudit('match-result', `${matchId} -> ${result}`, { matchId, result });
  },

  updateMatchPlayers: (matchId: string, player1Id: string, player2Id: string) => {
    const { competition } = get();
    const group = competition.groups[competition.currentGroupIndex];
    if (!group) return;

    const matchIndex = group.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    const match = group.matches[matchIndex];
    if (match.result !== 'pending') return;

    const updatedMatches = [...group.matches];
    updatedMatches[matchIndex] = { ...match, player1Id, player2Id };

    const updatedGroups = [...competition.groups];
    updatedGroups[competition.currentGroupIndex] = { ...group, matches: updatedMatches };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  batchUpdateRoundMatches: (round: number, updates: { matchId: string; player1Id: string; player2Id: string; isBye?: boolean }[]) => {
    const { competition } = get();
    const group = competition.groups[competition.currentGroupIndex];
    if (!group) return;

    const updatedMatches = group.matches.map(m => {
      const update = updates.find(u => u.matchId === m.id);
      if (update && m.result === 'pending') {
        if (!update.isBye && update.player1Id === update.player2Id) return m;
        const newIsBye = update.isBye ?? m.isBye;
        const roundGt = getRoundGameType(group, round);
        const byeWins = roundGt === 'bo7' ? 4 : roundGt === 'bo5' ? 3 : roundGt === 'bo3' ? 2 : 1;
        return {
          ...m,
          player1Id: update.player1Id,
          player2Id: update.player2Id,
          isBye: newIsBye,
          player1Games: newIsBye ? byeWins : undefined,
          player2Games: newIsBye ? 0 : undefined,
        };
      }
      return m;
    });

    const updatedGroups = [...competition.groups];
    updatedGroups[competition.currentGroupIndex] = { ...group, matches: updatedMatches };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  reorderMatches: (round: number, fromMatchId: string, toMatchId: string) => {
    const { competition } = get();
    if (fromMatchId === toMatchId) return;
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (!group) return;

    // 仅在同一轮内重排：将 fromMatch 移动到 toMatch 的位置
    const roundMatchIds = group.matches.filter(m => m.round === round).map(m => m.id);
    const fromIdx = roundMatchIds.indexOf(fromMatchId);
    const toIdx = roundMatchIds.indexOf(toMatchId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    // 在 round 范围内重排：提取本轮 matches，重排后写回原位置
    const roundMatches = group.matches.filter(m => m.round === round);
    const otherMatches = group.matches.filter(m => m.round !== round);
    const [moved] = roundMatches.splice(fromIdx, 1);
    roundMatches.splice(toIdx, 0, moved);

    // 保持原 matches 数组中其他轮次的相对位置：按 round 顺序插入
    // 简化处理：将 otherMatches + roundMatches 按 round 分组后重组
    const roundOrder: number[] = [];
    const byRound = new Map<number, typeof roundMatches>();
    for (const m of otherMatches) {
      if (!byRound.has(m.round)) { byRound.set(m.round, []); roundOrder.push(m.round); }
      byRound.get(m.round)!.push(m);
    }
    byRound.set(round, roundMatches);
    if (!roundOrder.includes(round)) roundOrder.push(round);
    roundOrder.sort((a, b) => a - b);

    const newMatches: typeof roundMatches = [];
    for (const r of roundOrder) {
      newMatches.push(...(byRound.get(r) || []));
    }

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = { ...group, matches: newMatches };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  randomGenerateAllGroups: async () => {
    if (get().isRandomGenerating) return;
    const { competition } = get();

    // 先算出总的"工作量步"：in_progress 小组数 × 轮次数，用于进度展示
    const workGroups = competition.groups.filter(g => g.status === 'in_progress');
    const totalSteps = workGroups.reduce((s, g) => s + g.totalRounds, 0);
    set({
      isRandomGenerating: true,
      randomGenerateProgress: { total: Math.max(1, totalSteps), current: 0 },
    });

    const updatedGroups = [...competition.groups];
    let doneSteps = 0;

    for (let gi = 0; gi < updatedGroups.length; gi++) {
      const group = updatedGroups[gi];
      if (group.status !== 'in_progress') continue;

      let g = group;
      for (let r = 1; r <= g.totalRounds; r++) {
        const roundMatches = g.matches.filter(m => m.round === r);
        if (roundMatches.length === 0) {
          g = generateNextRoundFast(g);
        }

        const matchesToUpdate = g.matches.filter(m => m.round === r && m.result === 'pending');
        for (const match of matchesToUpdate) {
          if (match.isBye) continue;

          const rand = Math.random();
          let result: MatchResult;
          let p1Games = 0, p2Games = 0;
          const roundGt = getRoundGameType(g, r);

          if (roundGt === 'bo1') {
            result = rand < 0.5 ? 'player1' : 'player2';
            p1Games = result === 'player1' ? 1 : 0;
            p2Games = result === 'player2' ? 1 : 0;
          } else {
            const winScore = roundGt === 'bo7' ? 4 : roundGt === 'bo5' ? 3 : 2;
            const isP1Win = rand < 0.5;
            const loserGames = Math.floor(Math.random() * winScore);
            if (isP1Win) {
              result = 'player1';
              p1Games = winScore; p2Games = loserGames;
            } else {
              result = 'player2';
              p1Games = loserGames; p2Games = winScore;
            }
          }

          g = applyMatchResultFast(g, match.id, result, p1Games, p2Games);
        }

        // 每完成一轮让出一次主线程，避免长时间阻塞 / DevTools 断开
        doneSteps++;
        if (doneSteps % 2 === 0) {
          set({ randomGenerateProgress: { total: Math.max(1, totalSteps), current: doneSteps } });
          await yieldToMain();
        }
      }

      updatedGroups[gi] = recalculateRanking(g);
      // 每完成一个小组让出一次主线程并更新进度
      set({ randomGenerateProgress: { total: Math.max(1, totalSteps), current: doneSteps } });
      await yieldToMain();
    }

    const updated = { ...competition, groups: updatedGroups };
    const currentGroup = updated.groups[updated.currentGroupIndex];
    set({
      competition: updated,
      viewRound: currentGroup.currentRound > 0 ? currentGroup.currentRound : 0,
      isRandomGenerating: false,
      randomGenerateProgress: { total: 0, current: 0 },
    });
    saveCompetition(updated);
  },

  randomGenerateCurrentRoundAllGroups: async () => {
    if (get().isRandomGenerating) return;
    const { competition } = get();

    const workGroups = competition.groups.filter(g => g.status === 'in_progress' && g.currentRound > 0);
    const totalSteps = Math.max(1, workGroups.length);
    set({
      isRandomGenerating: true,
      randomGenerateProgress: { total: totalSteps, current: 0 },
    });

    const updatedGroups = [...competition.groups];
    for (let gi = 0; gi < updatedGroups.length; gi++) {
      const group = updatedGroups[gi];
      if (group.status !== 'in_progress' || group.currentRound === 0) continue;

      let g = group;
      const roundGt = getRoundGameType(g, g.currentRound);
      const pendingMatches = g.matches.filter(
        m => m.round === g.currentRound && m.result === 'pending' && !m.isBye
      );

      for (const match of pendingMatches) {
        const rand = Math.random();
        let result: MatchResult;
        let p1Games = 0, p2Games = 0;

        if (roundGt === 'bo1') {
          result = rand < 0.5 ? 'player1' : 'player2';
          p1Games = result === 'player1' ? 1 : 0;
          p2Games = result === 'player2' ? 1 : 0;
        } else {
          const winScore = roundGt === 'bo7' ? 4 : roundGt === 'bo5' ? 3 : 2;
          const isP1Win = rand < 0.5;
          const loserGames = Math.floor(Math.random() * winScore);
          if (isP1Win) {
            result = 'player1';
            p1Games = winScore; p2Games = loserGames;
          } else {
            result = 'player2';
            p1Games = loserGames; p2Games = winScore;
          }
        }

        g = applyMatchResultFast(g, match.id, result, p1Games, p2Games);
      }

      updatedGroups[gi] = recalculateRanking(g);
      set({ randomGenerateProgress: { total: totalSteps, current: gi + 1 } });
      // 每处理完一个小组让出一次主线程
      await yieldToMain();
    }

    const updated = { ...competition, groups: updatedGroups };
    set({
      competition: updated,
      isRandomGenerating: false,
      randomGenerateProgress: { total: 0, current: 0 },
    });
    saveCompetition(updated);
  },

}));
