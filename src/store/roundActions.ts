import type { TournamentCompetition, TournamentGroup, TournamentStatus, Player, Match } from '../types';
import { calculateAllWinRates, generatePairings, getRankedPlayers, getRoundGameType, getSingleEliminationRounds } from '../utils/swissPairing';
import {
  createEliminationFirstRoundMatches,
  createEliminationNextRoundMatches,
} from '../utils/elimination';

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
    if (group.pairingType === 'single_elimination' && !group.eliminationBracket?.lockedAt) {
      return group;
    }
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

  const bracketMatches: Match[] | null = group.eliminationBracket
    ? (nextRound === 1
      ? createEliminationFirstRoundMatches(group, group.eliminationBracket)
      : createEliminationNextRoundMatches(group, nextRound))
    : null;
  const generated = bracketMatches
    ? { matches: bracketMatches, updatedPlayers: group.players }
    : generatePairings(
      group.players,
      nextRound,
      getRoundGameType(group, nextRound),
      group.pairingType,
      group.matches,
      group.tiebreakRules
    );
  const matches = generated.matches;
  const pairedPlayers = generated.updatedPlayers;

  if (group.eliminationBracket && matches.length === 0) return competition;

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

  const isBracketComplete = !!group.eliminationBracket
    && nextRound === getSingleEliminationRounds(group.eliminationBracket.size);

  const updatedGroups = [...competition.groups];
  const updatedGroup = {
    ...group,
    currentRound: nextRound,
    matches: allMatches,
    players: updatedPlayers,
    status: isBracketComplete && allMatches
      .filter(match => match.round === nextRound)
      .every(match => match.result !== 'pending')
      ? 'completed' as TournamentStatus
      : group.status,
  };
  updatedGroups[groupIdx] = updatedGroup;
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

export function buildUpdatedPlayersFromMatches(
  players: Player[],
  matches: TournamentGroup['matches'],
  gameType: TournamentGroup['gameType'],
  tiebreakRules?: TournamentGroup['tiebreakRules']
): Player[] {
  const refreshed = calculateAllWinRates(players, matches, gameType);
  return getRankedPlayers(refreshed, gameType, 'swiss', tiebreakRules);
}
