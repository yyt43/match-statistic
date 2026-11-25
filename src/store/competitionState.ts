import type { TournamentCompetition, TournamentGroup } from '../types';
import { getEliminationBracketRounds } from '../utils/elimination';
import { calculateAllWinRates, getRankedPlayers } from '../utils/swissPairing';
import { getDefaultTiebreakTemplate, normalizeTiebreakRules } from '../utils/tiebreak';
import { getDefaultPlayerFields, getPlayerSchemaId } from '../utils/playerProfiles';

export function buildRankedGroup(group: TournamentGroup): TournamentGroup {
  const updatedPlayers = calculateAllWinRates(group.players, group.matches, group.gameType);
  const rankedPlayers = getRankedPlayers(
    updatedPlayers,
    group.gameType,
    group.pairingType,
    group.tiebreakRules
  );

  return {
    ...group,
    tiebreakTemplate: group.tiebreakTemplate ?? getDefaultTiebreakTemplate(group.gameType),
    tiebreakRules: normalizeTiebreakRules(group.tiebreakRules, group.gameType),
    players: rankedPlayers.map((player, index) => ({
      ...player,
      previousRank: index + 1,
    })),
  };
}

export function isRoundComplete(group: TournamentGroup, round: number = group.currentRound): boolean {
  if (round <= 0) return false;
  const matches = group.matches.filter(match => match.round === round);
  return matches.length > 0 && matches.every(match => match.result !== 'pending');
}

/** 小组实际轮数：单败淘汰按签表规模推导，其余用开赛时设定的轮数。 */
export function getGroupTotalRounds(group: TournamentGroup): number {
  if (group.pairingType === 'single_elimination' && group.eliminationBracket) {
    const bracketRounds = getEliminationBracketRounds(group.eliminationBracket.size);
    if (bracketRounds > 0) return bracketRounds;
  }
  return group.totalRounds;
}

/**
 * 最后一轮是否已全部录完、可以确认结束比赛。
 * 录满不再自动结束：必须由用户点「确认结束比赛」，以便核对或修改最后一轮赛果。
 */
export function isFinalRoundScored(group: TournamentGroup): boolean {
  if (group.status !== 'in_progress') return false;
  const totalRounds = getGroupTotalRounds(group);
  if (totalRounds <= 0 || group.currentRound < totalRounds) return false;
  return isRoundComplete(group, group.currentRound);
}

export function normalizeCompetitionGroups(competition: TournamentCompetition): TournamentCompetition {
  const playerSchemaId = getPlayerSchemaId(competition);
  return {
    ...competition,
    playerSchemaId,
    playerFields: competition.playerFields?.length
      ? competition.playerFields
      : getDefaultPlayerFields(playerSchemaId),
    groups: competition.groups.map(group => buildRankedGroup({
      ...group,
      players: group.players.map(player => ({
        ...player,
        profile: player.profile ?? {},
      })),
    })),
  };
}

export function resolveViewRound(competition: TournamentCompetition): number {
  const currentGroup = competition.groups[competition.currentGroupIndex];
  return currentGroup && currentGroup.currentRound > 0 ? currentGroup.currentRound : 0;
}

export function replaceGroupAtIndex(
  competition: TournamentCompetition,
  groupIndex: number,
  group: TournamentGroup
): TournamentCompetition {
  if (!Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex >= competition.groups.length) {
    return competition;
  }

  const groups = [...competition.groups];
  groups[groupIndex] = group;
  return { ...competition, groups };
}

export function updateGroupAtIndex(
  competition: TournamentCompetition,
  groupIndex: number,
  updater: (group: TournamentGroup) => TournamentGroup
): TournamentCompetition {
  return replaceGroupAtIndex(competition, groupIndex, updater(competition.groups[groupIndex]));
}

export function collectPreDroppedPlayerIds(matches: Array<{ preDrop?: boolean; result?: string; player1Id: string; player2Id: string }>): Set<string> {
  const preDroppedIds = new Set<string>();

  for (const match of matches) {
    if (!match.preDrop || !match.result) continue;
    if (match.result === 'player1') preDroppedIds.add(match.player2Id);
    else if (match.result === 'player2') preDroppedIds.add(match.player1Id);
  }

  return preDroppedIds;
}
