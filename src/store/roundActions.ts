import type { TournamentCompetition, TournamentGroup, TournamentStatus, MatchResult, Player } from '../types';
import { calculateAllWinRates, generatePairings, getRankedPlayers, getRoundGameType, getSingleEliminationRounds } from '../utils/swissPairing';

export function startTournamentForGroup(
  competition: TournamentCompetition,
  groupIdx: number,
  totalRoundsOverride?: number
): TournamentCompetition {
  const group = competition.groups[groupIdx];
  if (!group || group.players.length < 2) return competition;

  const rounds = group.pairingType === 'single_elimination'
    ? getSingleEliminationRounds(group.players.length)
    : totalRoundsOverride ?? group.totalRounds;

  const updatedGroups = [...competition.groups];
  updatedGroups[groupIdx] = { ...group, totalRounds: rounds, status: 'in_progress' as TournamentStatus, currentRound: 0 };
  return { ...competition, groups: updatedGroups };
}

export function startAllGroupsInCompetition(competition: TournamentCompetition): TournamentCompetition {
  const updatedGroups = competition.groups.map(group => {
    if (group.status !== 'setup' || group.players.length < 2) return group;
    const rounds = group.pairingType === 'single_elimination'
      ? getSingleEliminationRounds(group.players.length)
      : group.totalRounds;
    return { ...group, totalRounds: rounds, status: 'in_progress' as TournamentStatus, currentRound: 0 };
  });
  return { ...competition, groups: updatedGroups };
}

export function generateNextRoundForCompetition(
  competition: TournamentCompetition,
  groupIdx: number
): TournamentCompetition {
  const group = competition.groups[groupIdx];
  if (!group || group.status !== 'in_progress') return competition;

  const nextRound = group.currentRound + 1;
  if (nextRound > group.totalRounds) return competition;

  const roundGameType = getRoundGameType(group, nextRound);
  const { matches, updatedPlayers: pairedPlayers } = generatePairings(
    group.players,
    nextRound,
    roundGameType,
    group.pairingType,
    group.matches
  );

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
  return { ...competition, groups: updatedGroups };
}

export function generateNextRoundAllGroupsInCompetition(
  competition: TournamentCompetition,
  groupIndices: number[]
): TournamentCompetition {
  let nextCompetition = competition;
  for (const index of groupIndices) {
    nextCompetition = generateNextRoundForCompetition(nextCompetition, index);
  }
  return nextCompetition;
}

export function resolveTournamentStatusForGroup(
  group: TournamentGroup,
  currentRound: number
): TournamentStatus {
  return currentRound <= 0 ? 'setup' : 'in_progress';
}

export function buildUpdatedPlayersFromMatches(
  players: Player[],
  matches: TournamentGroup['matches'],
  gameType: TournamentGroup['gameType']
): Player[] {
  const refreshed = calculateAllWinRates(players, matches, gameType);
  return getRankedPlayers(refreshed, gameType, 'swiss');
}
