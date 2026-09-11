import { advancePlayoffs, clearPlayoffs, recordPlayoffResult, type ThreePlayerFormats } from '../utils/playoffs';
import { create } from 'zustand';
import type { TournamentCompetition, TournamentGroup, Player, MatchResult, TournamentStatus, GameType, PairingType } from '../types';
import { calculateAllWinRates, getRankedPlayers, createPlayersFromNames, getSingleEliminationRounds, generatePairings, getRoundGameType } from '../utils/swissPairing';
import { saveCompetition, loadCompetition } from '../utils/storage';
import { saveSnapshot, getSnapshot } from '../utils/snapshot';
import { evaluateGroupStatus, isRoundComplete, normalizeCompetitionGroups, replaceGroupAtIndex, resolveViewRound, updateGroupAtIndex } from './competitionState';
import { applyMatchResultFast, generateNextRoundFast, recalculateRanking, yieldToMain } from './gameFlow';
import { createNewCompetition, createNewGroup, generateId } from './tournamentFactory';
import { updateCurrentGroup } from './competitionMutators';
import { applyMatchResultToMap, revertMatchResult } from './matchResultMutators';
import { generateNextRoundForCompetition, startAllGroupsInCompetition, startTournamentForGroup } from './roundActions';

interface CompetitionState {
  competition: TournamentCompetition;
  viewRound: number;
  isRandomGenerating: boolean;
  randomGenerateProgress: { total: number; current: number };

  // 赛事级别操作
  initCompetition: (name: string, groupCount?: number, playerCountPerGroup?: number, roundsPerGroup?: number, gameType?: GameType, pairingType?: PairingType) => void;
  loadSavedCompetition: () => boolean;
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
  restoreFromSnapshot: (snapshotId: string) => boolean;
  createSnapshot: (label?: string) => void;

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

  initCompetition: (name: string, groupCount?: number, playerCountPerGroup?: number, roundsPerGroup?: number, gameType?: GameType, pairingType?: PairingType) => {
    const competition = createNewCompetition(
      name,
      groupCount || 1,
      playerCountPerGroup || 32,
      roundsPerGroup || 5,
      gameType || 'bo1',
      pairingType || 'swiss'
    );
    set({ competition, viewRound: 0, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } });
    saveCompetition(competition);
  },

  loadSavedCompetition: () => {
    const rawSaved = loadCompetition();
    const saved = rawSaved ? normalizeCompetitionGroups(rawSaved) : null;
    if (saved) {
      set({
        competition: saved,
        viewRound: resolveViewRound(saved),
        isRandomGenerating: false,
        randomGenerateProgress: { total: 0, current: 0 },
      });
      return true;
    }
    return false;
  },

  importCompetition: (competition: TournamentCompetition) => {
    const normalized = normalizeCompetitionGroups(competition);
    const viewRound = resolveViewRound(normalized);
    set({ competition: normalized, viewRound, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } });
    saveCompetition(normalized);
  },

  updateCompetitionName: (name: string) => {
    const { competition } = get();
    const updated = { ...competition, name: name.trim() || '新建赛事' };
    set({ competition: updated });
    saveCompetition(updated);
  },

  setCurrentGroup: (index: number) => {
    const { competition } = get();
    if (index < 0 || index >= competition.groups.length) return;
    const group = competition.groups[index];
    set({
      competition: { ...competition, currentGroupIndex: index },
      viewRound: group.currentRound > 0 ? group.currentRound : 0,
    });
  },

  addGroup: () => {
    const { competition } = get();
    // 比赛进行中或已完成时不允许新增小组
    if (competition.groups.some(g => g.status !== 'setup')) return;
    let maxPlayerIdx = 0;
    for (const g of competition.groups) {
      for (const p of g.players) {
        const num = parseInt(p.name.replace(/\D/g, ''));
        if (!isNaN(num) && num > maxPlayerIdx) maxPlayerIdx = num;
      }
    }
    const newGroup = createNewGroup(
      `小组${String(competition.groups.length + 1).padStart(2, '0')}`,
      32,
      5,
      'bo1',
      'swiss',
      maxPlayerIdx + 1
    );
    const updated = {
      ...competition,
      groups: [...competition.groups, newGroup],
    };
    set({ competition: updated });
    saveCompetition(updated);
  },

  removeGroup: (index: number) => {
    const { competition } = get();
    if (competition.groups.length <= 1) return;
    // 已开始比赛的小组不允许删除
    if (competition.groups[index]?.status !== 'setup') return;
    const newGroups = competition.groups.filter((_, i) => i !== index);
    const newIndex = Math.min(competition.currentGroupIndex, newGroups.length - 1);
    const updated = {
      ...competition,
      groups: newGroups,
      currentGroupIndex: newIndex,
    };
    set({ competition: updated });
    saveCompetition(updated);
  },

  setGroupCount: (count: number) => {
    const { competition } = get();
    // 比赛进行中或已完成时不允许调整小组数量
    if (competition.groups.some(g => g.status !== 'setup')) return;
    const targetCount = Math.max(1, Math.min(20, Math.floor(count)));
    const currentCount = competition.groups.length;
    if (targetCount === currentCount) return;

    // 计算当前所有小组中的最大选手编号，便于新增小组时延续命名
    let maxPlayerIdx = 0;
    for (const g of competition.groups) {
      for (const p of g.players) {
        const num = parseInt(p.name.replace(/\D/g, ''));
        if (!isNaN(num) && num > maxPlayerIdx) maxPlayerIdx = num;
      }
    }

    // 参考首个小组的配置（仅当其处于 setup 时取其配置，否则用默认值）
    const refGroup = competition.groups[0];
    const refPlayerCount = refGroup?.status === 'setup' ? refGroup.players.length : 32;
    const refRounds = refGroup?.status === 'setup' ? refGroup.totalRounds : 5;
    const refGameType = refGroup?.gameType ?? 'bo1';
    const refPairingType = refGroup?.pairingType ?? 'swiss';

    let newGroups: TournamentGroup[];
    if (targetCount > currentCount) {
      // 新增小组
      const added: TournamentGroup[] = [];
      for (let i = currentCount; i < targetCount; i++) {
        const startIdx = maxPlayerIdx + 1 + (i - currentCount) * refPlayerCount;
        added.push(createNewGroup(
          `小组${String(i + 1).padStart(2, '0')}`,
          refPlayerCount,
          refRounds,
          refGameType,
          refPairingType,
          startIdx
        ));
      }
      newGroups = [...competition.groups, ...added];
    } else {
      // 减少小组：仅当未开始比赛时才允许删除（已开始的会被保留）
      // 优先删除末尾的 setup 状态小组；若末尾不是 setup，则不删除
      const kept = [...competition.groups];
      while (kept.length > targetCount) {
        const last = kept[kept.length - 1];
        if (last.status === 'setup') {
          kept.pop();
        } else {
          // 末尾小组已开始比赛，不能删除，回退到前面找 setup
          const setupIdx = kept.slice(0, -1).findIndex(g => g.status === 'setup');
          if (setupIdx === -1) break;
          kept.splice(setupIdx, 1);
        }
      }
      newGroups = kept;
    }

    if (newGroups.length === currentCount) return;

    const newIndex = Math.min(competition.currentGroupIndex, newGroups.length - 1);
    const updated = {
      ...competition,
      groups: newGroups,
      currentGroupIndex: newIndex,
    };
    set({ competition: updated });
    saveCompetition(updated);
  },

  batchSetGroupConfig: (playerCount: number, rounds: number, gameType: GameType, pairingType: PairingType, roundGameTypes?: GameType[]) => {
    const { competition } = get();
    let startIdx = 1;
    const updatedGroups = competition.groups.map(g => {
      if (g.status !== 'setup') {
        startIdx += g.players.length;
        return g;
      }
      const newCount = Math.max(2, Math.min(200, playerCount));
      const newPlayers: Player[] = [];
      for (let i = 0; i < newCount; i++) {
        newPlayers.push({
          id: generateId(),
          name: `选手${String(startIdx + i).padStart(3, '0')}`,
          points: 0, wins: 0, losses: 0,
          totalGames: 0, wonGames: 0,
          winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0,
          gameWinRate: 0, opponentGameWinRate: 0,
          playedAgainst: [], dropped: false,
        });
      }
      startIdx += newCount;
      const finalRounds = pairingType === 'single_elimination'
        ? getSingleEliminationRounds(newCount)
        : Math.max(1, Math.min(20, rounds));
      // 单败淘汰模式下，若提供了每轮赛制数组且长度匹配则使用，否则全部使用 gameType
      let finalRoundGameTypes: GameType[];
      if (pairingType === 'single_elimination' && roundGameTypes && roundGameTypes.length === finalRounds) {
        finalRoundGameTypes = [...roundGameTypes];
      } else {
        finalRoundGameTypes = new Array(finalRounds).fill(gameType);
      }
      return {
        ...g,
        players: newPlayers,
        totalRounds: finalRounds,
        gameType,
        pairingType,
        roundGameTypes: finalRoundGameTypes,
      };
    });

    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  updateGroupName: (index: number, name: string) => {
    const { competition } = get();
    const updatedGroups = [...competition.groups];
    updatedGroups[index] = { ...updatedGroups[index], name: name.trim() };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  // ===== 小组级别操作 =====
  addPlayer: (name: string) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const newPlayer: Player = {
      id: generateId(),
      name: name.trim(),
      points: 0, wins: 0, losses: 0,
      totalGames: 0, wonGames: 0,
      winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0,
      gameWinRate: 0, opponentGameWinRate: 0,
      playedAgainst: [], dropped: false,
    };

    const updated = updateCurrentGroup(competition, group => ({ ...group, players: [...group.players, newPlayer] }));
    set({ competition: updated });
    saveCompetition(updated);
  },

  addPlayers: (names: string[]) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const newPlayers = names.filter(n => n.trim()).map(name => ({
      id: generateId(),
      name: name.trim(),
      points: 0, wins: 0, losses: 0,
      totalGames: 0, wonGames: 0,
      winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0,
      gameWinRate: 0, opponentGameWinRate: 0,
      playedAgainst: [], dropped: false,
    }));

    const updated = updateCurrentGroup(competition, group => ({ ...group, players: [...group.players, ...newPlayers] }));
    set({ competition: updated });
    saveCompetition(updated);
  },

  replacePlayers: (names: string[]) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const newPlayers = createPlayersFromNames(names.filter(n => n.trim()));
    const updated = updateCurrentGroup(competition, group => ({ ...group, players: newPlayers }));
    set({ competition: updated });
    saveCompetition(updated);
  },

  removePlayer: (playerId: string) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const updated = updateCurrentGroup(competition, group => ({ ...group, players: group.players.filter(p => p.id !== playerId) }));
    set({ competition: updated });
    saveCompetition(updated);
  },

  updatePlayerName: (playerId: string, name: string) => {
    const { competition } = get();

    const updated = updateCurrentGroup(competition, group => ({
      ...group,
      players: group.players.map(p => p.id === playerId ? { ...p, name: name.trim() } : p),
    }));
    set({ competition: updated });
    saveCompetition(updated);
  },

  togglePlayerDropped: (playerId: string) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'in_progress') return;

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = {
      ...group,
      players: group.players.map(p => p.id === playerId ? { ...p, dropped: !p.dropped } : p),
    };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  setPlayerCount: (count: number) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const newCount = Math.max(2, Math.min(200, count));
    const currentCount = group.players.length;
    if (newCount === currentCount) return;

    const updatedPlayers = [...group.players];
    if (newCount > currentCount) {
      for (let i = currentCount + 1; i <= newCount; i++) {
        updatedPlayers.push({
          id: generateId(),
          name: `选手${String(i).padStart(3, '0')}`,
          points: 0, wins: 0, losses: 0,
          totalGames: 0, wonGames: 0,
          winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0,
          gameWinRate: 0, opponentGameWinRate: 0,
          playedAgainst: [], dropped: false,
        });
      }
    } else {
      updatedPlayers.splice(newCount);
    }

    // 单败淘汰模式下根据新人数自动重算总轮次及每轮赛制
    let updatedTotalRounds = group.totalRounds;
    let updatedRoundGameTypes = group.roundGameTypes;
    if (group.pairingType === 'single_elimination') {
      updatedTotalRounds = getSingleEliminationRounds(newCount);
      // 复用旧 roundGameTypes 长度对齐；不足部分用 gameType 补齐，多余截断
      const baseGameType = group.gameType;
      const oldArr = group.roundGameTypes ?? [];
      if (oldArr.length === updatedTotalRounds) {
        updatedRoundGameTypes = [...oldArr];
      } else if (oldArr.length > updatedTotalRounds) {
        updatedRoundGameTypes = oldArr.slice(0, updatedTotalRounds);
      } else {
        updatedRoundGameTypes = [
          ...oldArr,
          ...new Array(updatedTotalRounds - oldArr.length).fill(baseGameType),
        ];
      }
    }

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = {
      ...group,
      players: updatedPlayers,
      totalRounds: updatedTotalRounds,
      roundGameTypes: updatedRoundGameTypes,
    };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  setTotalRounds: (rounds: number) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const newRounds = Math.max(1, Math.min(20, rounds));
    const oldRounds = group.totalRounds;
    let roundGameTypes = group.roundGameTypes ? [...group.roundGameTypes] : new Array(oldRounds).fill(group.gameType);
    if (newRounds > oldRounds) {
      roundGameTypes = roundGameTypes.concat(new Array(newRounds - oldRounds).fill(group.gameType));
    } else if (newRounds < oldRounds) {
      roundGameTypes = roundGameTypes.slice(0, newRounds);
    }

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = { ...group, totalRounds: newRounds, roundGameTypes };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  setGameType: (gameType: GameType) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const roundGameTypes = new Array(group.totalRounds).fill(gameType);
    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = { ...group, gameType, roundGameTypes };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  setPairingType: (pairingType: PairingType) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const totalRounds = pairingType === 'single_elimination'
      ? getSingleEliminationRounds(group.players.length)
      : group.totalRounds;

    let roundGameTypes = group.roundGameTypes ? [...group.roundGameTypes] : new Array(group.totalRounds).fill(group.gameType);
    if (totalRounds > roundGameTypes.length) {
      roundGameTypes = roundGameTypes.concat(new Array(totalRounds - roundGameTypes.length).fill(group.gameType));
    } else if (totalRounds < roundGameTypes.length) {
      roundGameTypes = roundGameTypes.slice(0, totalRounds);
    }

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = { ...group, pairingType, totalRounds, roundGameTypes };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated });
    saveCompetition(updated);
  },

  setRoundGameType: (round: number, gameType: GameType) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (group.status !== 'setup') return;

    const roundGameTypes = group.roundGameTypes ? [...group.roundGameTypes] : new Array(group.totalRounds).fill(group.gameType);
    if (round >= 1 && round <= roundGameTypes.length) {
      roundGameTypes[round - 1] = gameType;
    }

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = { ...group, roundGameTypes };
    const updated = { ...competition, groups: updatedGroups };
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

    const hasCompletedCurrentRound = isRoundComplete({ ...group, matches: updatedMatches, players: updatedPlayers });

    if (hasCompletedCurrentRound) {
      try {
        saveSnapshot(updated, `${group.name}·第${group.currentRound}轮完赛`);
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

  createSnapshot: (label?: string) => {
    const { competition } = get();
    const currentGroup = competition.groups[competition.currentGroupIndex];
    const defaultLabel = currentGroup
      ? `${currentGroup.name}·第${currentGroup.currentRound}轮`
      : '手动备份';
    saveSnapshot(competition, label || defaultLabel);
  },

  restoreFromSnapshot: (snapshotId: string) => {
    const snapshot = getSnapshot(snapshotId);
    if (!snapshot) return false;
    const restored = snapshot.data;
    // 快照压缩时将胜率字段置 0，恢复后需要为每个小组重算胜率与排名
    const recalcGroups = restored.groups.map(g => {
      const updatedPlayers = calculateAllWinRates(g.players, g.matches, g.gameType);
      const rankedPlayers = getRankedPlayers(updatedPlayers, g.gameType, g.pairingType);
      // 恢复时 previousRank 设为当前 rank（避免显示异常升降箭头）
      const finalPlayers = rankedPlayers.map((p, i) => ({ ...p, previousRank: i + 1 }));
      return { ...g, players: finalPlayers };
    });
    const finalCompetition = { ...restored, groups: recalcGroups };
    const viewRound = finalCompetition.groups[finalCompetition.currentGroupIndex]?.currentRound > 0
      ? finalCompetition.groups[finalCompetition.currentGroupIndex].currentRound
      : 0;
    set({ competition: finalCompetition, viewRound, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } });
    saveCompetition(finalCompetition);
    return true;
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

  resetCompetition: () => {
    const competition = createNewCompetition('新建赛事');
    set({ competition, viewRound: 0, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } });
    saveCompetition(competition);
  },
}));
