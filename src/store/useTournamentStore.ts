import { advancePlayoffs, clearPlayoffs, recordPlayoffResult, type ThreePlayerFormats } from '../utils/playoffs';
import { create } from 'zustand';
import type {
  StageAdvancementPreview,
  TournamentCompetition,
  TournamentGroup,
  Player,
  Match,
  MatchResult,
  TournamentStatus,
  GameType,
  PairingType,
  TiebreakRule,
  TiebreakTemplate,
  PlayerSchemaId,
  EvidenceVerificationStatus,
} from '../types';
import { calculateAllWinRates, getRankedPlayers, generatePairings, getRoundGameType } from '../utils/swissPairing';
import {
  assignEliminationBracketSlot as assignBracketSlot,
  createOrderedEliminationBracket,
  createRandomEliminationBracket,
  getEliminationBracketView,
  hasPlayedDownstreamBracketMatches,
  rebuildEliminationMatchesAfterResult,
  swapEliminationBracketSlots as swapBracketSlots,
  validateEliminationBracket,
  type EliminationBracketView,
} from '../utils/elimination';
import { saveSnapshot } from '../utils/storage/snapshot';
import { evaluateGroupStatus, isRoundComplete, replaceGroupAtIndex, updateGroupAtIndex } from './competitionState';
import { applyMatchResultFast, generateNextRoundFast, recalculateRanking, yieldToMain } from './gameFlow';
import { createNewCompetition } from './tournamentFactory';
import { applyMatchResultToMap, revertMatchResult } from './matchResultMutators';
import { normalizeResultScore } from '../utils/matchResult';
import { generateNextRoundForCompetition, startAllGroupsInCompetition, startTournamentForGroup } from './roundActions';
import { getCurrentStageGroupIndices } from '../utils/multiStage';
import {
  getUnconfirmedUpstreamStageIds,
  isStageResultLocked,
} from '../utils/advancement';
import { createCompetitionActions } from './actions/competitionActions';
import { createSnapshotActions } from './actions/snapshotActions';
import { createGroupActions } from './actions/groupActions';
import { createPlayerActions } from './actions/playerActions';
import { createImportActions } from './actions/importActions';
import { createAdvancementActions } from './actions/advancementActions';
import { logAudit } from '../utils/auditLog';
import {
  cloneCompetition,
  createHistoryEntry,
  createStoreSet,
  HISTORY_LIMIT,
} from './competitionHistory';
import type { CompetitionHistoryEntry } from './historyTypes';
import { validateRoster, type RosterValidationSummary } from '../utils/playerProfiles';

function resetMatchResult(match: Match): Match {
  return {
    ...match,
    result: 'pending',
    player1Games: undefined,
    player2Games: undefined,
    preDrop: undefined,
    resultSource: undefined,
    sourceSubmissionId: undefined,
    sourceSubmittedAt: undefined,
    evidenceRefs: undefined,
    evidenceHash: undefined,
    evidenceVerificationStatus: undefined,
    evidenceVerifiedBy: undefined,
    evidenceVerifiedAt: undefined,
    publicResultStatus: undefined,
    announcedAt: undefined,
    confirmationDeadlineAt: undefined,
    disputedAt: undefined,
    resultOverrides: undefined,
  };
}

function rollbackRoundPlayerStats(
  group: TournamentGroup,
  currentRound: number,
  preserveByes: boolean
): Player[] {
  const currentRoundMatches = group.matches.filter(m => m.round === currentRound);
  const playerMap = new Map<string, Player>(group.players.map(p => [p.id, { ...p }]));
  const isSingleElimination = group.pairingType === 'single_elimination';

  for (const match of currentRoundMatches) {
    const isPlayoff = !!match.isPlayoff;
    const wasPreDrop = !!match.preDrop;

    if (match.isBye) {
      if (preserveByes) continue;
      const p1 = playerMap.get(match.player1Id);
      if (p1 && match.result === 'player1') {
        if (isPlayoff) {
          p1.playoffWins = (p1.playoffWins || 0) - 1;
        } else {
          p1.points -= 1;
          p1.wins -= 1;
          p1.playedAgainst = p1.playedAgainst.filter(id => id !== 'bye');
          if (match.player1Games !== undefined && match.player2Games !== undefined) {
            p1.totalGames -= match.player1Games + match.player2Games;
            p1.wonGames -= match.player1Games;
          }
        }
      }
      continue;
    }

    const p1 = playerMap.get(match.player1Id);
    const p2 = playerMap.get(match.player2Id);
    if (!p1 || !p2) continue;

    if (isPlayoff) {
      if (match.result === 'player1') {
        p1.playoffWins = (p1.playoffWins || 0) - 1;
      } else if (match.result === 'player2') {
        p2.playoffWins = (p2.playoffWins || 0) - 1;
      }
      continue;
    }

    if (match.result === 'player1') {
      p1.points -= 1;
      p1.wins -= 1;
      if (!wasPreDrop) {
        p2.losses -= 1;
        p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2.id);
        p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1.id);
      } else {
        p2.dropped = false;
      }
      if (isSingleElimination) p2.eliminated = false;
    } else if (match.result === 'player2') {
      p2.points -= 1;
      p2.wins -= 1;
      if (!wasPreDrop) {
        p1.losses -= 1;
        p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2.id);
        p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1.id);
      } else {
        p1.dropped = false;
      }
      if (isSingleElimination) p1.eliminated = false;
    } else if (match.result === 'draw') {
      p1.losses -= 1;
      p2.losses -= 1;
      if (!wasPreDrop) {
        p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2.id);
        p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1.id);
      }
      if (isSingleElimination) {
        p1.eliminated = false;
        p2.eliminated = false;
      }
    }

    if (!wasPreDrop && match.player1Games !== undefined && match.player2Games !== undefined) {
      if (match.result === 'draw') {
        const lossGames = Math.max(match.player1Games, match.player2Games);
        p1.totalGames -= lossGames;
        p2.totalGames -= lossGames;
      } else {
        p1.totalGames -= match.player1Games + match.player2Games;
        p1.wonGames -= match.player1Games;
        p2.totalGames -= match.player1Games + match.player2Games;
        p2.wonGames -= match.player2Games;
      }
    }
  }

  return Array.from(playerMap.values());
}

export interface CompetitionState {
  competition: TournamentCompetition;
  viewRound: number;
  isRandomGenerating: boolean;
  randomGenerateProgress: { total: number; current: number };
  historyPast: CompetitionHistoryEntry[];
  historyFuture: CompetitionHistoryEntry[];
  isReadOnly: boolean;

  // 赛事级别操作
  initCompetition: (name: string, groupCount?: number, playerCountPerGroup?: number, roundsPerGroup?: number, gameType?: GameType, pairingType?: PairingType) => void;
  initMultiStageCompetition: (competition: TournamentCompetition) => void;
  previewStageAdvancement: (stageId?: string) => StageAdvancementPreview;
  confirmStageAdvancement: (preview: StageAdvancementPreview) => boolean;
  revertStageAdvancement: (stageId?: string) => boolean;
  loadSavedCompetition: () => Promise<boolean>;
  importCompetition: (competition: TournamentCompetition) => void;
  updateCompetitionName: (name: string) => void;
  setCurrentGroup: (index: number) => void;
  addGroup: () => void;
  removeGroup: (index: number) => void;
  setGroupCount: (count: number) => void;
  applyGroupConfiguration: (
    config: {
      playerCount: number;
      rounds: number;
      gameType: GameType;
      pairingType: PairingType;
      roundGameTypes?: GameType[];
      tiebreakTemplate?: TiebreakTemplate;
      tiebreakRules?: TiebreakRule[];
    },
    target?: 'current' | 'all'
  ) => void;
  updateGroupName: (index: number, name: string) => void;

  // 小组级别操作（操作当前 group）
  addPlayer: (name: string) => void;
  addPlayers: (names: string[]) => void;
  replacePlayers: (names: string[]) => void;
  removePlayer: (playerId: string) => void;
  updatePlayerName: (playerId: string, name: string) => void;
  updatePlayerProfile: (
    playerId: string,
    changes: Record<string, string>,
    groupIndex?: number
  ) => boolean;
  importPlayerProfiles: (players: Array<{
    id?: string;
    name: string;
    groupName?: string;
    participantCode?: string;
    profile?: Record<string, string>;
  }>, distributeAcrossGroups?: boolean) => RosterValidationSummary;
  setPlayerSchema: (schemaId: PlayerSchemaId) => void;
  lockRoster: () => RosterValidationSummary;
  generateMissingParticipantCodes: () => { assigned: number; unresolved: number };
  togglePlayerDropped: (playerId: string) => void;
  setPlayerCount: (count: number) => void;
  setTotalRounds: (rounds: number) => void;
  setGameType: (gameType: GameType) => void;
  setPairingType: (pairingType: PairingType) => void;
  setRoundGameType: (round: number, gameType: GameType) => void;
  setTiebreakTemplate: (template: TiebreakTemplate, rules?: TiebreakRule[]) => void;

  startTournament: (totalRounds: number) => void;
  startAllGroups: () => void;
  prepareEliminationBracket: (groupIdx?: number) => void;
  resetEliminationBracketOrder: (groupIdx?: number) => void;
  randomizeEliminationBracket: (groupIdx?: number) => void;
  swapEliminationBracketSlots: (firstIndex: number, secondIndex: number, groupIdx?: number) => void;
  assignEliminationBracketSlot: (slotIndex: number, playerId: string | null, groupIdx?: number) => void;
  confirmEliminationBracket: (groupIdx?: number) => void;
  confirmEliminationBracketsAndStartAll: (groupIndices: number[]) => void;
  getEliminationBracketView: (groupIdx?: number) => EliminationBracketView;
  canChangeEliminationBracketResult: (groupIdx: number, round: number) => boolean;
  generateNextRound: () => void;
  generateNextRoundForGroup: (groupIdx: number) => void;
  generateNextRoundAllGroups: () => void;
  undoLastRound: () => void;
  returnToPreviousRound: () => void;
  returnToSetup: () => void;
  updateMatchResult: (matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => void;
  randomGenerateAllGroups: () => Promise<void>;
  randomGenerateCurrentRoundAllGroups: () => Promise<void>;
  updateMatchResultForGroup: (groupIdx: number, matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => void;
  updateMatchPlayers: (matchId: string, player1Id: string, player2Id: string) => void;
  batchUpdateRoundMatches: (round: number, updates: { matchId: string; player1Id: string; player2Id: string; isBye?: boolean }[]) => void;
  reorderMatches: (round: number, fromMatchId: string, toMatchId: string) => void;
  applyImportedMatchResults: (candidates: Array<{
    matchId: string;
    groupIndex: number;
    result: Exclude<MatchResult, 'pending'>;
    identityVerified?: boolean;
    player1Games?: number;
    player2Games?: number;
    evidenceRefs?: string[];
    evidenceHash?: string;
    evidenceVerificationStatus?: EvidenceVerificationStatus;
    sourceSubmissionId?: string;
    sourceSubmittedAt?: string;
  }>, label?: string) => void;
  verifyMatchEvidence: (
    matchId: string,
    status: EvidenceVerificationStatus,
    note?: string
  ) => boolean;
  overrideMatchResult: (
    matchId: string,
    result: Exclude<MatchResult, 'pending'>,
    player1Games: number | undefined,
    player2Games: number | undefined,
    reason: string,
    evidenceRefs?: string[]
  ) => boolean;
  restoreFromSnapshot: (snapshotId: string) => Promise<boolean>;
  createSnapshot: (label?: string) => Promise<void>;

  /** 生成加赛：检测当前小组排名中是否存在平分选手，若有则生成加赛对阵 */
  generatePlayoff: (formats?: ThreePlayerFormats) => void;
  resetPlayoffs: () => void;

  setViewRound: (round: number) => void;
  undo: () => boolean;
  redo: () => boolean;
  jumpToHistory: (index: number) => boolean;
  clearHistory: () => void;
  setReadOnly: (readOnly: boolean) => void;
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

function hasPlayoffData(group: TournamentGroup): boolean {
  return (group.playoffBrackets?.length ?? 0) > 0 || group.matches.some(match => match.isPlayoff);
}

function hasRegularResultChanged(
  match: TournamentGroup['matches'][number],
  result: MatchResult,
  player1Games?: number,
  player2Games?: number,
  preDrop?: boolean
): boolean {
  return match.result !== result
    || match.player1Games !== player1Games
    || match.player2Games !== player2Games
    || !!match.preDrop !== !!preDrop;
}


const initialCompetition = createNewCompetition('新建赛事');

export const useTournamentStore = create<CompetitionState>((rawSet, get) => {
  const set = createStoreSet(rawSet, get);

  return {
  competition: initialCompetition,
  viewRound: 0,
  isRandomGenerating: false,
  randomGenerateProgress: { total: 0, current: 0 },
  historyPast: [],
  historyFuture: [],
  isReadOnly: false,
  ...createCompetitionActions(set),
  ...createSnapshotActions(set, get),
  ...createGroupActions(set, get),
  ...createPlayerActions(set, get),
  ...createImportActions(set, get),
  ...createAdvancementActions(set, get),

  undo: () => {
    const state = get();
    const previous = state.historyPast[state.historyPast.length - 1];
    if (!previous || state.isReadOnly) return false;

    const current = createHistoryEntry(state, previous.label);
    const nextCompetition = cloneCompetition(previous.competition);
    set({
      competition: nextCompetition,
      viewRound: previous.viewRound,
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [current, ...state.historyFuture].slice(0, HISTORY_LIMIT),
    }, { history: 'skip' });
    void logAudit('history-undo', `Undo ${previous.label}`, { label: previous.label });
    return true;
  },

  redo: () => {
    const state = get();
    const next = state.historyFuture[0];
    if (!next || state.isReadOnly) return false;

    const current = createHistoryEntry(state, next.label);
    const nextCompetition = cloneCompetition(next.competition);
    set({
      competition: nextCompetition,
      viewRound: next.viewRound,
      historyPast: [...state.historyPast, current].slice(-HISTORY_LIMIT),
      historyFuture: state.historyFuture.slice(1),
    }, { history: 'skip' });
    void logAudit('history-redo', `Redo ${next.label}`, { label: next.label });
    return true;
  },

  jumpToHistory: (index: number) => {
    const state = get();
    const target = state.historyPast[index];
    if (!target || state.isReadOnly) return false;

    const currentLabel = state.historyPast[state.historyPast.length - 1]?.label;
    const future = [
      ...state.historyPast.slice(index + 1).map((entry, offset) => ({
        ...entry,
        label: state.historyPast[index + offset]?.label ?? entry.label,
      })),
      createHistoryEntry(state, currentLabel || '当前状态'),
    ].slice(-HISTORY_LIMIT);

    const nextCompetition = cloneCompetition(target.competition);
    set({
      competition: nextCompetition,
      viewRound: target.viewRound,
      historyPast: state.historyPast.slice(0, index),
      historyFuture: future,
    }, { history: 'skip' });
    void logAudit('history-jump', `Jumped to ${target.label}`, { label: target.label });
    return true;
  },

  clearHistory: () => {
    set({ historyPast: [], historyFuture: [] }, { history: 'replace' });
  },

  setReadOnly: (readOnly: boolean) => {
    set({ isReadOnly: readOnly });
  },

  updateCompetitionName: (name: string) => {
    const { competition } = get();
    const updated = { ...competition, name: name.trim() || '新建赛事' };
    set({ competition: updated }, { label: '修改赛事名称' });
  },

  startTournament: (totalRounds: number) => {
    const { competition } = get();
    if (competition.groups.length > 1) {
      get().startAllGroups();
      return;
    }
    const idx = competition.currentGroupIndex;
    if (!validateRoster(competition).valid) return;
    const currentGroup = competition.groups[idx];
    if (currentGroup?.pairingType === 'single_elimination' && !currentGroup.eliminationBracket?.lockedAt) return;
    let updated = startTournamentForGroup(competition, idx, totalRounds);
    updated = {
      ...updated,
      rosterLockedAt: updated.rosterLockedAt ?? new Date().toISOString(),
    };
    set({ competition: updated }, { label: '开始比赛' });

    updated = generateNextRoundForCompetition(updated, idx);
    set(
      { competition: updated, viewRound: updated.groups[idx].currentRound },
      { label: '开始比赛' }
    );
  },

  startAllGroups: () => {
    const { competition } = get();
    if (!validateRoster(competition).valid) return;
    // 上游赛段还没确认晋级时，下游不允许开赛。
    const stageId = competition.groups[competition.currentGroupIndex]?.stageId;
    if (stageId && getUnconfirmedUpstreamStageIds(competition, stageId).length > 0) return;
    const stageIndices = getCurrentStageGroupIndices(competition);
    const targetIndices = stageIndices ?? competition.groups.map((_, index) => index);
    const hasUnconfirmedEliminationGroup = targetIndices.some(index => {
      const group = competition.groups[index];
      return !!group
        && group.status === 'setup'
        && group.players.length >= 2
        && group.pairingType === 'single_elimination'
        && !group.eliminationBracket?.lockedAt;
    });
    if (hasUnconfirmedEliminationGroup) return;
    let updated = startAllGroupsInCompetition(competition, stageIndices);
    // 多阶段赛事的后续赛段还要继续导入名单，因此不锁定整场名单。
    if (!stageIndices) {
      updated = {
        ...updated,
        rosterLockedAt: updated.rosterLockedAt ?? new Date().toISOString(),
      };
    }
    set({ competition: updated }, { label: '开始全部小组' });

    for (const i of targetIndices) {
      const g = updated.groups[i];
      if (!g) continue;
      if (g.pairingType === 'single_elimination' && !g.eliminationBracket?.lockedAt) continue;
      if (g.status === 'in_progress' && g.currentRound === 0) {
        updated = generateNextRoundForCompetition(updated, i);
      }
    }

    const currentGroup = updated.groups[updated.currentGroupIndex];
    set(
      { competition: updated, viewRound: currentGroup.currentRound > 0 ? currentGroup.currentRound : 0 },
      { label: '开始全部小组' }
    );
  },

  prepareEliminationBracket: (groupIdx) => {
    const { competition } = get();
    const idx = groupIdx ?? competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (!group || group.pairingType !== 'single_elimination' || group.status !== 'setup') return;
    if (group.players.length < 2) return;

    const bracket = group.eliminationBracket?.lockedAt
      ? group.eliminationBracket
      : createOrderedEliminationBracket(group.players);
    if (validateEliminationBracket(bracket, group.players)) return;

    const updated = updateGroupAtIndex(competition, idx, current => ({
      ...current,
      eliminationBracket: bracket,
    }));
    set({ competition: updated }, { label: '准备单败签表' });
  },

  resetEliminationBracketOrder: (groupIdx) => {
    const { competition } = get();
    const idx = groupIdx ?? competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (!group || group.pairingType !== 'single_elimination' || group.eliminationBracket?.lockedAt) return;

    const updated = updateGroupAtIndex(competition, idx, current => ({
      ...current,
      eliminationBracket: createOrderedEliminationBracket(current.players),
    }));
    set({ competition: updated }, { label: '恢复名单顺序组织' });
  },

  randomizeEliminationBracket: (groupIdx) => {
    const { competition } = get();
    const idx = groupIdx ?? competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (!group || group.pairingType !== 'single_elimination' || group.eliminationBracket?.lockedAt) return;

    const updated = updateGroupAtIndex(competition, idx, current => ({
      ...current,
      eliminationBracket: createRandomEliminationBracket(current.players),
    }));
    set({ competition: updated }, { label: '随机重抽单败签表' });
  },

  swapEliminationBracketSlots: (firstIndex, secondIndex, groupIdx) => {
    const { competition } = get();
    const idx = groupIdx ?? competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (!group?.eliminationBracket || group.eliminationBracket.lockedAt) return;

    const updated = updateGroupAtIndex(competition, idx, current => ({
      ...current,
      eliminationBracket: swapBracketSlots(current.eliminationBracket!, firstIndex, secondIndex),
    }));
    set({ competition: updated }, { label: '交换单败签位' });
  },

  assignEliminationBracketSlot: (slotIndex, playerId, groupIdx) => {
    const { competition } = get();
    const idx = groupIdx ?? competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (!group?.eliminationBracket || group.eliminationBracket.lockedAt) return;

    const updated = updateGroupAtIndex(competition, idx, current => ({
      ...current,
      eliminationBracket: assignBracketSlot(current.eliminationBracket!, slotIndex, playerId),
    }));
    set({ competition: updated }, { label: '指定单败签位' });
  },

  confirmEliminationBracket: (groupIdx) => {
    const { competition } = get();
    if (!validateRoster(competition).valid) return;
    const idx = groupIdx ?? competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (!group || group.pairingType !== 'single_elimination') return;
    if (group.status !== 'setup' || group.eliminationBracket?.lockedAt) return;

    const bracket = group.eliminationBracket ?? createOrderedEliminationBracket(group.players);
    if (validateEliminationBracket(bracket, group.players)) return;

    let updated = updateGroupAtIndex(competition, idx, current => ({
      ...current,
      eliminationBracket: {
        ...bracket,
        lockedAt: bracket.lockedAt ?? new Date().toISOString(),
      },
    }));
    updated = {
      ...updated,
      rosterLockedAt: updated.rosterLockedAt ?? new Date().toISOString(),
    };
    updated = startTournamentForGroup(updated, idx, group.totalRounds);
    updated = generateNextRoundForCompetition(updated, idx);
    set(
      { competition: updated, viewRound: updated.groups[idx].currentRound },
      { label: 'Confirm elimination bracket and start' }
    );
  },

  confirmEliminationBracketsAndStartAll: (groupIndices) => {
    const { competition } = get();
    if (!validateRoster(competition).valid) return;

    // 与 startAllGroups 一致：只开当前赛段的小组，避免其它赛段的空小组把开赛整体拦下。
    const scopeIndices = getCurrentStageGroupIndices(competition)
      ?? competition.groups.map((_, index) => index);
    const scope = new Set(scopeIndices);
    const indices = Array.from(new Set(groupIndices)).filter(index =>
      scope.has(index)
      &&
      competition.groups[index]?.pairingType === 'single_elimination'
      && competition.groups[index]?.status === 'setup'
      && !competition.groups[index]?.eliminationBracket?.lockedAt
    );
    const brackets = new Map<number, NonNullable<TournamentGroup['eliminationBracket']>>();
    for (const index of indices) {
      const group = competition.groups[index];
      const bracket = group.eliminationBracket ?? createOrderedEliminationBracket(group.players);
      if (validateEliminationBracket(bracket, group.players)) return;
      brackets.set(index, { ...bracket, lockedAt: bracket.lockedAt ?? new Date().toISOString() });
    }

    let updated: TournamentCompetition = {
      ...competition,
      rosterLockedAt: competition.rosterLockedAt ?? new Date().toISOString(),
      groups: competition.groups.map((group, index) => {
        const bracket = brackets.get(index);
        return bracket ? { ...group, eliminationBracket: bracket } : group;
      }),
    };
    updated = startAllGroupsInCompetition(updated, scopeIndices);
    for (const index of scopeIndices) {
      const group = updated.groups[index];
      if (group.status === 'in_progress' && group.currentRound === 0) {
        updated = generateNextRoundForCompetition(updated, index);
      }
    }

    const currentGroup = updated.groups[updated.currentGroupIndex];
    set(
      {
        competition: updated,
        viewRound: currentGroup.currentRound > 0 ? currentGroup.currentRound : 0,
      },
      { label: 'Confirm all elimination brackets and start' }
    );
  },

  getEliminationBracketView: (groupIdx) => {
    const { competition } = get();
    const idx = groupIdx ?? competition.currentGroupIndex;
    const group = competition.groups[idx];
    return group ? getEliminationBracketView(group) : { rounds: [] };
  },

  canChangeEliminationBracketResult: (groupIdx, round) => {
    const group = get().competition.groups[groupIdx];
    if (!group?.eliminationBracket) return true;
    return !hasPlayedDownstreamBracketMatches(group, round);
  },

  generateNextRound: () => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const updated = generateNextRoundForCompetition(competition, idx);
    set(
      { competition: updated, viewRound: updated.groups[idx].currentRound },
      { label: '生成下一轮' }
    );
  },

  generateNextRoundForGroup: (groupIdx: number) => {
    const { competition } = get();
    const group = competition.groups[groupIdx];
    if (!group || group.status !== 'in_progress') return;

    const nextRound = group.currentRound + 1;
    if (nextRound > group.totalRounds) return;

    if (group.eliminationBracket) {
      const updated = generateNextRoundForCompetition(competition, groupIdx);
      set({ competition: updated }, { label: '生成小组下一轮' });
      return;
    }

    const roundGameType = getRoundGameType(group, nextRound);
    const { matches, updatedPlayers: pairedPlayers } = generatePairings(
      group.players,
      nextRound,
      roundGameType,
      group.pairingType,
      group.matches,
      group.tiebreakRules
    );

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
    set({ competition: updated }, { label: '生成小组下一轮' });
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
  },

  undoLastRound: () => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = clearPlayoffs(competition.groups[idx]);
    if (group.currentRound <= 0) return;

    const currentRound = group.currentRound;

    if (group.eliminationBracket) {
      const resetMatches = group.matches
        .filter(match => !match.bracketNodeId || match.round <= currentRound)
        .map(match =>
          match.round === currentRound && !match.isBye ? resetMatchResult(match) : match
        );
      const updatedPlayers = getRankedPlayers(
        calculateAllWinRates(
          rollbackRoundPlayerStats(group, currentRound, true),
          resetMatches,
          group.gameType
        ),
        group.gameType,
        group.pairingType,
        group.tiebreakRules
      );
      const updatedGroups = [...competition.groups];
      updatedGroups[idx] = {
        ...group,
        matches: resetMatches,
        players: updatedPlayers,
        status: 'in_progress' as TournamentStatus,
      };
      set(
        { competition: { ...competition, groups: updatedGroups }, viewRound: currentRound },
        { label: `Clear round ${currentRound} results` }
      );
      return;
    }

    // Keep the current pairings and reset their results so referees can
    // immediately re-enter them. Automatic byes remain unchanged.
    const remainingMatches = group.matches.map(match =>
      match.round === currentRound && !match.isBye
        ? resetMatchResult(match)
        : match
    );

    const updatedPlayers = calculateAllWinRates(
      rollbackRoundPlayerStats(group, currentRound, true),
      remainingMatches,
      group.gameType
    );

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = {
      ...group,
      currentRound,
      matches: remainingMatches,
      players: updatedPlayers,
      status: 'in_progress' as TournamentStatus,
    };
    const updated = { ...competition, groups: updatedGroups };
    set(
      { competition: updated, viewRound: currentRound },
      { label: `撤回第${currentRound}轮` }
    );
    void logAudit('round-undo', `Round ${currentRound} undone`, { round: currentRound });
  },

  returnToPreviousRound: () => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = clearPlayoffs(competition.groups[idx]);
    const currentRound = group.currentRound;
    if (currentRound <= 1) return;

    if (group.eliminationBracket) {
      const hasEnteredResult = group.matches.some(match =>
        match.round === currentRound && !match.isBye && match.result !== 'pending'
      );
      if (!hasEnteredResult) return;
      const remainingMatches = group.matches.filter(match =>
        !match.bracketNodeId || match.round < currentRound
      );
      const previousRound = currentRound - 1;
      const updatedPlayers = getRankedPlayers(
        calculateAllWinRates(
          rollbackRoundPlayerStats(group, currentRound, false),
          remainingMatches,
          group.gameType
        ),
        group.gameType,
        group.pairingType,
        group.tiebreakRules
      );
      const updatedGroups = [...competition.groups];
      updatedGroups[idx] = {
        ...group,
        currentRound: previousRound,
        matches: remainingMatches,
        players: updatedPlayers,
        status: 'in_progress' as TournamentStatus,
      };
      set(
        {
          competition: { ...competition, groups: updatedGroups },
          viewRound: previousRound,
        },
        { label: `Return from elimination round ${currentRound} to ${previousRound}` }
      );
      void logAudit('round-return', `Returned from elimination round ${currentRound} to ${previousRound}`, {
        fromRound: currentRound,
        toRound: previousRound,
      });
      return;
    }

    const remainingMatches = group.matches.filter(match => match.round !== currentRound);
    const previousRound = currentRound - 1;
    const updatedPlayers = calculateAllWinRates(
      rollbackRoundPlayerStats(group, currentRound, false),
      remainingMatches,
      group.gameType
    );

    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = {
      ...group,
      currentRound: previousRound,
      matches: remainingMatches,
      players: updatedPlayers,
      status: 'in_progress' as TournamentStatus,
    };
    const updated = { ...competition, groups: updatedGroups };
    set(
      { competition: updated, viewRound: previousRound },
      { label: `退回第${previousRound}轮` }
    );
    void logAudit('round-return', `Returned from round ${currentRound} to round ${previousRound}`, {
      fromRound: currentRound,
      toRound: previousRound,
    });
  },

  returnToSetup: () => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = clearPlayoffs(competition.groups[idx]);
    if (group.currentRound !== 1) return;

    if (group.eliminationBracket) {
      const hasEnteredResult = group.matches.some(match =>
        match.round === 1 && !match.isBye && match.result !== 'pending'
      );
      if (hasEnteredResult) return;
      const remainingMatches = group.matches.filter(match => match.round !== 1);
      const updatedPlayers = calculateAllWinRates(
        rollbackRoundPlayerStats(group, 1, false),
        remainingMatches,
        group.gameType
      );
      const updatedGroups = [...competition.groups];
      updatedGroups[idx] = {
        ...group,
        eliminationBracket: {
          ...group.eliminationBracket,
          lockedAt: undefined,
        },
        currentRound: 0,
        matches: remainingMatches,
        players: updatedPlayers,
        status: 'setup' as TournamentStatus,
      };
      const allGroupsInSetup = updatedGroups.every(item => item.status === 'setup');
      set(
        {
          competition: {
            ...competition,
            groups: updatedGroups,
            rosterLockedAt: allGroupsInSetup ? undefined : competition.rosterLockedAt,
          },
          viewRound: 0,
        },
        { label: 'Return to setup' }
      );
      return;
    }

    const hasEnteredResult = group.matches.some(match =>
      match.round === 1
      && !match.isBye
      && match.result !== 'pending'
    );
    if (hasEnteredResult) return;

    const remainingMatches = group.matches.filter(match => match.round !== 1);
    const updatedPlayers = calculateAllWinRates(
      rollbackRoundPlayerStats(group, 1, false),
      remainingMatches,
      group.gameType
    );
    const updatedGroups = [...competition.groups];
    updatedGroups[idx] = {
      ...group,
      currentRound: 0,
      matches: remainingMatches,
      players: updatedPlayers,
      status: 'setup' as TournamentStatus,
    };
    const allGroupsInSetup = updatedGroups.every(item => item.status === 'setup');
    const updated = {
      ...competition,
      groups: updatedGroups,
      rosterLockedAt: allGroupsInSetup ? undefined : competition.rosterLockedAt,
    };
    set(
      { competition: updated, viewRound: 0 },
      { label: '撤回至开赛设置' }
    );
    void logAudit('round-undo', 'Round 1 returned to setup', { round: 1 });
  },

  updateMatchResult: (matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const storedGroup = competition.groups[idx];
    if (storedGroup?.stageId && isStageResultLocked(competition, storedGroup.stageId)) return;

    const matchIndex = storedGroup.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    const storedMatch = storedGroup.matches[matchIndex];
    if (storedMatch.isBye) return;
    if (storedMatch.result !== 'pending'
      && (storedMatch.resultSource === 'import' || storedMatch.resultSource === 'referee_override')
      && (storedMatch.result !== result
        || storedMatch.player1Games !== player1Games
        || storedMatch.player2Games !== player2Games)) {
      return;
    }

    if (storedMatch.isPlayoff) {
      const updated = updateGroupAtIndex(competition, idx, currentGroup => recordPlayoffResult(currentGroup, matchId, result, player1Games, player2Games));
      set({ competition: updated }, { label: '修改加赛结果' });
      void logAudit('match-result', `${matchId} -> ${result}`, { matchId, result });
      return;
    }

    if (
      storedGroup.eliminationBracket
      && result === 'draw'
      && storedMatch.bracketNodeId
    ) {
      return;
    }
    if (
      storedGroup.eliminationBracket
      && storedMatch.bracketNodeId
      && storedMatch.result !== 'pending'
      && (
        result !== storedMatch.result
        || player1Games !== storedMatch.player1Games
        || player2Games !== storedMatch.player2Games
      )
      && !get().canChangeEliminationBracketResult(idx, storedMatch.round)
    ) {
      return;
    }

    const normalizedScore = normalizeResultScore(
      result,
      getRoundGameType(storedGroup, storedMatch.round),
      player1Games,
      player2Games
    );
    const normalizedPlayer1Games = normalizedScore.player1Games;
    const normalizedPlayer2Games = normalizedScore.player2Games;

    const playoffsCleared = hasPlayoffData(storedGroup)
      && hasRegularResultChanged(storedMatch, result, player1Games, player2Games, preDrop);
    const group = playoffsCleared ? clearPlayoffs(storedGroup) : storedGroup;
    const match = group.matches[matchIndex];
    const oldResult = match.result;
    const oldPreDrop = !!match.preDrop;

    const playerMap = new Map<string, Player>(group.players.map(p => [p.id, { ...p }]));

    const isSingleElimination = group.pairingType === 'single_elimination';

    if (oldResult !== 'pending') {
      revertMatchResult(playerMap, match, oldResult, oldPreDrop, isSingleElimination);
    }

    if (result !== 'pending') {
      applyMatchResultToMap(
        playerMap,
        match,
        result,
        !!preDrop,
        isSingleElimination,
        normalizedPlayer1Games,
        normalizedPlayer2Games,
        getRoundGameType(group, match.round)
      );
    }

    let updatedMatches = [...group.matches];
    updatedMatches[matchIndex] = {
      ...match,
      result,
      player1Games: normalizedPlayer1Games,
      player2Games: normalizedPlayer2Games,
      preDrop: !!preDrop,
      resultSource: match.resultSource ?? 'manual',
    };
    if (group.eliminationBracket && match.bracketNodeId && oldResult !== result) {
      updatedMatches = rebuildEliminationMatchesAfterResult(
        { ...group, matches: updatedMatches },
        match.round
      );
    }

    let updatedPlayers = Array.from(playerMap.values());
    updatedPlayers = calculateAllWinRates(updatedPlayers, updatedMatches, group.gameType);

    const rankedPlayers = getRankedPlayers(
      updatedPlayers,
      group.gameType,
      group.pairingType,
      group.tiebreakRules
    );
    const previousRankMap = new Map(
      getRankedPlayers(
        group.players,
        group.gameType,
        group.pairingType,
        group.tiebreakRules
      ).map((p, i) => [p.id, i + 1])
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
    set(
      { competition: updated, ...(playoffsCleared ? { viewRound: group.currentRound } : {}) },
      { label: playoffsCleared ? '修改比赛结果并清除加赛' : '修改比赛结果' }
    );
    void logAudit('match-result', `${matchId} -> ${result}`, { matchId, result, playoffsCleared });

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
    set(
      { competition: updated, viewRound: group.matches.some(m => m.isPlayoff) ? 0 : group.currentRound },
      { label: '生成加赛' }
    );
  },

  resetPlayoffs: () => {
    const { competition } = get();
    const idx = competition.currentGroupIndex;
    const group = clearPlayoffs(competition.groups[idx]);
    const updated = replaceGroupAtIndex(competition, idx, group);
    set(
      { competition: updated, viewRound: group.currentRound },
      { label: '清除加赛' }
    );
  },

  updateMatchResultForGroup: (groupIdx: number, matchId: string, result: MatchResult, player1Games?: number, player2Games?: number, preDrop?: boolean) => {
    const { competition } = get();
    const storedGroup = competition.groups[groupIdx];
    if (!storedGroup) return;
    if (storedGroup.stageId && isStageResultLocked(competition, storedGroup.stageId)) return;

    const matchIndex = storedGroup.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    const storedMatch = storedGroup.matches[matchIndex];
    if (storedMatch.isBye) return;
    if (storedMatch.result !== 'pending'
      && (storedMatch.resultSource === 'import' || storedMatch.resultSource === 'referee_override')
      && (storedMatch.result !== result
        || storedMatch.player1Games !== player1Games
        || storedMatch.player2Games !== player2Games)) {
      return;
    }
    if (storedMatch.isPlayoff) {
      const groups = [...competition.groups];
      groups[groupIdx] = recordPlayoffResult(storedGroup, matchId, result, player1Games, player2Games);
      const updated = { ...competition, groups };
      set({ competition: updated }, { label: '修改小组比赛结果' });
      void logAudit('match-result', `${matchId} -> ${result}`, { matchId, result });
      return;
    }

    if (storedGroup.eliminationBracket && result === 'draw' && storedMatch.bracketNodeId) {
      return;
    }
    if (
      storedGroup.eliminationBracket
      && storedMatch.bracketNodeId
      && storedMatch.result !== 'pending'
      && (
        result !== storedMatch.result
        || player1Games !== storedMatch.player1Games
        || player2Games !== storedMatch.player2Games
      )
      && !get().canChangeEliminationBracketResult(groupIdx, storedMatch.round)
    ) {
      return;
    }

    const normalizedScore = normalizeResultScore(
      result,
      getRoundGameType(storedGroup, storedMatch.round),
      player1Games,
      player2Games
    );
    const normalizedPlayer1Games = normalizedScore.player1Games;
    const normalizedPlayer2Games = normalizedScore.player2Games;

    const playoffsCleared = hasPlayoffData(storedGroup)
      && hasRegularResultChanged(storedMatch, result, player1Games, player2Games, preDrop);
    const group = playoffsCleared ? clearPlayoffs(storedGroup) : storedGroup;
    const match = group.matches[matchIndex];
    const oldResult = match.result;
    const oldPreDrop = !!match.preDrop;

    const playerMap = new Map<string, Player>(group.players.map(p => [p.id, { ...p }]));

    const isSingleElimination = group.pairingType === 'single_elimination';

    if (oldResult !== 'pending') {
      revertMatchResult(playerMap, match, oldResult, oldPreDrop, isSingleElimination);
    }

    if (result !== 'pending') {
      applyMatchResultToMap(
        playerMap,
        match,
        result,
        !!preDrop,
        isSingleElimination,
        normalizedPlayer1Games,
        normalizedPlayer2Games,
        getRoundGameType(group, match.round)
      );
    }

    let updatedMatches = [...group.matches];
    updatedMatches[matchIndex] = {
      ...match,
      result,
      player1Games: normalizedPlayer1Games,
      player2Games: normalizedPlayer2Games,
      preDrop: !!preDrop,
      resultSource: match.resultSource ?? 'manual',
    };
    if (group.eliminationBracket && match.bracketNodeId && oldResult !== result) {
      updatedMatches = rebuildEliminationMatchesAfterResult(
        { ...group, matches: updatedMatches },
        match.round
      );
    }

    let updatedPlayers = Array.from(playerMap.values());
    updatedPlayers = calculateAllWinRates(updatedPlayers, updatedMatches, group.gameType);

    const rankedPlayers = getRankedPlayers(
      updatedPlayers,
      group.gameType,
      group.pairingType,
      group.tiebreakRules
    );
    const previousRankMap = new Map(
      getRankedPlayers(
        group.players,
        group.gameType,
        group.pairingType,
        group.tiebreakRules
      ).map((p, i) => [p.id, i + 1])
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
    const shouldResetViewRound = playoffsCleared && groupIdx === competition.currentGroupIndex;
    if (shouldResetViewRound) {
      set({ viewRound: group.currentRound });
    }
    set({ competition: updated }, { label: '修改小组比赛结果' });
    void logAudit('match-result', `${matchId} -> ${result}`, { matchId, result, playoffsCleared });
  },

  updateMatchPlayers: (matchId: string, player1Id: string, player2Id: string) => {
    const { competition } = get();
    const group = competition.groups[competition.currentGroupIndex];
    if (!group) return;

    const matchIndex = group.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    const match = group.matches[matchIndex];
    if (match.result !== 'pending') return;
    if (group.eliminationBracket?.lockedAt) return;

    const updatedMatches = [...group.matches];
    updatedMatches[matchIndex] = { ...match, player1Id, player2Id };

    const updatedGroups = [...competition.groups];
    updatedGroups[competition.currentGroupIndex] = { ...group, matches: updatedMatches };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated }, { label: '调整对阵选手' });
  },

  batchUpdateRoundMatches: (round: number, updates: { matchId: string; player1Id: string; player2Id: string; isBye?: boolean }[]) => {
    const { competition } = get();
    const group = competition.groups[competition.currentGroupIndex];
    if (!group) return;
    if (group.eliminationBracket?.lockedAt) return;

    const updatedMatches = group.matches.map(m => {
      const update = updates.find(u => u.matchId === m.id);
      if (update && m.result === 'pending') {
        const newIsBye = update.isBye ?? m.isBye;
        if (newIsBye && update.player1Id === 'bye') return m;
        if (!newIsBye && (update.player1Id === 'bye' || update.player2Id === 'bye')) return m;
        if (!newIsBye && update.player1Id === update.player2Id) return m;
        const roundGt = getRoundGameType(group, round);
        const byeWins = roundGt === 'bo7' ? 4 : roundGt === 'bo5' ? 3 : roundGt === 'bo3' ? 2 : 1;
        return {
          ...m,
          player1Id: update.player1Id,
          player2Id: newIsBye ? 'bye' : update.player2Id,
          isBye: newIsBye,
          result: newIsBye ? 'player1' as const : 'pending' as const,
          player1Games: newIsBye ? byeWins : undefined,
          player2Games: newIsBye ? 0 : undefined,
        };
      }
      return m;
    });

    const playerMap = new Map(group.players.map(player => [player.id, { ...player }]));
    const isSingleElimination = group.pairingType === 'single_elimination';
    let addedAutomaticBye = false;
    updatedMatches.forEach((match, index) => {
      const previous = group.matches[index];
      if (previous.result === 'pending' && match.isBye && match.result === 'player1') {
        applyMatchResultToMap(
          playerMap,
          match,
          'player1',
          false,
          isSingleElimination,
          match.player1Games,
          match.player2Games
        );
        addedAutomaticBye = true;
      }
    });

    let updatedPlayers = group.players;
    if (addedAutomaticBye) {
      const recalculated = calculateAllWinRates(Array.from(playerMap.values()), updatedMatches, group.gameType);
      const rankedPlayers = getRankedPlayers(
        recalculated,
        group.gameType,
        group.pairingType,
        group.tiebreakRules
      );
      const previousRankMap = new Map(
        getRankedPlayers(
          group.players,
          group.gameType,
          group.pairingType,
          group.tiebreakRules
        ).map((player, index) => [player.id, index + 1])
      );
      updatedPlayers = rankedPlayers.map(player => ({
        ...player,
        previousRank: previousRankMap.get(player.id),
      }));
    }

    const updatedGroups = [...competition.groups];
    updatedGroups[competition.currentGroupIndex] = {
      ...group,
      matches: updatedMatches,
      players: updatedPlayers,
      status: evaluateGroupStatus({ ...group, matches: updatedMatches, players: updatedPlayers }),
    };
    const updated = { ...competition, groups: updatedGroups };
    set({ competition: updated }, { label: '批量调整对阵' });
  },

  reorderMatches: (round: number, fromMatchId: string, toMatchId: string) => {
    const { competition } = get();
    if (fromMatchId === toMatchId) return;
    const idx = competition.currentGroupIndex;
    const group = competition.groups[idx];
    if (!group) return;
    if (group.eliminationBracket?.lockedAt) return;

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
    set({ competition: updated }, { label: '调整对阵顺序' });
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
    }, { label: '随机生成全部赛果' });
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
    }, { label: '随机生成当前轮赛果' });
  },

  };
});
