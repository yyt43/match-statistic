import type { TournamentCompetition, TournamentGroup } from '../types';
import { calculateAllWinRates, getRankedPlayers } from '../utils/swissPairing';

export function normalizeCompetitionGroups(competition: TournamentCompetition): TournamentCompetition {
  return {
    ...competition,
    groups: competition.groups.map(group => {
      const updatedPlayers = calculateAllWinRates(group.players, group.matches, group.gameType);
      const rankedPlayers = getRankedPlayers(updatedPlayers, group.gameType, group.pairingType);
      return {
        ...group,
        players: rankedPlayers.map((player, index) => ({
          ...player,
          previousRank: index + 1,
        })),
      };
    }),
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
