import type { Match, MatchResult, Player, TournamentGroup } from '../types';
import { calculateAllWinRates, getRankedPlayers, getRoundGameType, generatePairings } from '../utils/swissPairing';

export function generateNextRoundFast(group: TournamentGroup): TournamentGroup {
  if (group.status !== 'in_progress') return group;
  const nextRound = group.currentRound + 1;
  if (nextRound > group.totalRounds) return group;

  const roundGameType = getRoundGameType(group, nextRound);
  const { matches, updatedPlayers: pairedPlayers } = generatePairings(group.players, nextRound, roundGameType, group.pairingType, group.matches);

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

  const updatedPlayers = Array.from(playerMap.values());
  const allMatches = [...group.matches, ...matches];
  return { ...group, currentRound: nextRound, matches: allMatches, players: updatedPlayers };
}

export function applyMatchResultFast(
  group: TournamentGroup,
  matchId: string,
  result: MatchResult,
  player1Games?: number,
  player2Games?: number,
  preDrop?: boolean
): TournamentGroup {
  const matchIndex = group.matches.findIndex(m => m.id === matchId);
  if (matchIndex === -1) return group;

  const match = group.matches[matchIndex];
  const oldResult = match.result;
  const oldPreDrop = !!match.preDrop;

  const playerMap = new Map<string, Player>(group.players.map(p => [p.id, { ...p }]));
  const isSingleElimination = group.pairingType === 'single_elimination';

  if (oldResult !== 'pending') {
    const p1Id = match.player1Id;
    const p2Id = match.player2Id;
    const p1 = playerMap.get(p1Id);
    const p2 = playerMap.get(p2Id);
    if (p2Id === 'bye') {
      const p = playerMap.get(p1Id);
      if (p && oldResult === 'player1') {
        p.points -= 1;
        p.wins -= 1;
        p.playedAgainst = p.playedAgainst.filter(id => id !== 'bye');
        if (match.player1Games !== undefined && match.player2Games !== undefined) {
          p.totalGames -= match.player1Games + match.player2Games;
          p.wonGames -= match.player1Games;
        }
      }
    } else if (p1 && p2) {
      const isPlayoff = !!match.isPlayoff;
      if (isPlayoff) {
        if (oldResult === 'player1') p1.playoffWins = (p1.playoffWins || 0) - 1;
        else if (oldResult === 'player2') p2.playoffWins = (p2.playoffWins || 0) - 1;
      } else if (oldResult === 'player1') {
        p1.points -= 1;
        p1.wins -= 1;
        if (!oldPreDrop) {
          p2.losses -= 1;
          p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2Id);
          p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1Id);
        } else {
          p2.dropped = false;
        }
        if (isSingleElimination) p2.eliminated = false;
        if (!oldPreDrop && match.player1Games !== undefined && match.player2Games !== undefined) {
          p1.totalGames -= match.player1Games + match.player2Games;
          p1.wonGames -= match.player1Games;
          p2.totalGames -= match.player1Games + match.player2Games;
          p2.wonGames -= match.player2Games;
        }
      } else if (oldResult === 'player2') {
        p2.points -= 1;
        p2.wins -= 1;
        if (!oldPreDrop) {
          p1.losses -= 1;
          p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2Id);
          p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1Id);
        } else {
          p1.dropped = false;
        }
        if (isSingleElimination) p1.eliminated = false;
        if (!oldPreDrop && match.player1Games !== undefined && match.player2Games !== undefined) {
          p1.totalGames -= match.player1Games + match.player2Games;
          p1.wonGames -= match.player1Games;
          p2.totalGames -= match.player1Games + match.player2Games;
          p2.wonGames -= match.player2Games;
        }
      } else if (oldResult === 'draw') {
        p1.losses -= 1;
        p2.losses -= 1;
        if (!oldPreDrop) {
          p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2Id);
          p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1Id);
        }
        if (isSingleElimination) { p1.eliminated = false; p2.eliminated = false; }
      }
    }
  }

  if (result !== 'pending') {
    const p1Id = match.player1Id;
    const p2Id = match.player2Id;
    const p1 = playerMap.get(p1Id);
    const p2 = playerMap.get(p2Id);
    if (p2Id === 'bye') {
      const p = playerMap.get(p1Id);
      if (p && result === 'player1') {
        p.points += 1;
        p.wins += 1;
        p.playedAgainst.push('bye');
        if (player1Games !== undefined && player2Games !== undefined) {
          p.totalGames += player1Games + player2Games;
          p.wonGames += player1Games;
        }
      }
    } else if (p1 && p2) {
      const isPlayoff = !!match.isPlayoff;
      if (isPlayoff) {
        if (result === 'player1') p1.playoffWins = (p1.playoffWins || 0) + 1;
        else if (result === 'player2') p2.playoffWins = (p2.playoffWins || 0) + 1;
      } else if (result === 'player1') {
        p1.points += 1;
        p1.wins += 1;
        if (!preDrop) p2.losses += 1;
        if (!preDrop) {
          p1.playedAgainst.push(p2Id);
          p2.playedAgainst.push(p1Id);
        } else {
          p2.dropped = true;
        }
        if (isSingleElimination) p2.eliminated = true;
        if (!preDrop && player1Games !== undefined && player2Games !== undefined) {
          p1.totalGames += player1Games + player2Games;
          p1.wonGames += player1Games;
          p2.totalGames += player1Games + player2Games;
          p2.wonGames += player2Games;
        }
      } else if (result === 'player2') {
        p2.points += 1;
        p2.wins += 1;
        if (!preDrop) p1.losses += 1;
        if (!preDrop) {
          p1.playedAgainst.push(p2Id);
          p2.playedAgainst.push(p1Id);
        } else {
          p1.dropped = true;
        }
        if (isSingleElimination) p1.eliminated = true;
        if (!preDrop && player1Games !== undefined && player2Games !== undefined) {
          p1.totalGames += player1Games + player2Games;
          p1.wonGames += player1Games;
          p2.totalGames += player1Games + player2Games;
          p2.wonGames += player2Games;
        }
      } else if (result === 'draw') {
        p1.losses += 1;
        p2.losses += 1;
        if (!preDrop) {
          p1.playedAgainst.push(p2Id);
          p2.playedAgainst.push(p1Id);
        }
        if (isSingleElimination) { p1.eliminated = true; p2.eliminated = true; }
      }
    }
  }

  const updatedMatches = [...group.matches];
  updatedMatches[matchIndex] = { ...match, result, player1Games, player2Games, preDrop: !!preDrop };

  const allCurrentRoundMatches = updatedMatches.filter(m => m.round === group.currentRound);
  const allDone = allCurrentRoundMatches.length > 0 && allCurrentRoundMatches.every(m => m.result !== 'pending');
  const isLastRound = group.currentRound >= group.totalRounds;

  return {
    ...group,
    matches: updatedMatches,
    players: Array.from(playerMap.values()),
    status: allDone && isLastRound ? 'completed' as const : group.status,
  };
}

export function recalculateRanking(group: TournamentGroup): TournamentGroup {
  const updatedPlayers = calculateAllWinRates(group.players, group.matches, group.gameType);
  const rankedPlayers = getRankedPlayers(updatedPlayers, group.gameType, group.pairingType);
  const previousRankMap = new Map(group.players.map(p => [p.id, p.previousRank]));
  const finalPlayers = rankedPlayers.map(p => ({
    ...p,
    previousRank: previousRankMap.get(p.id),
  }));
  return { ...group, players: finalPlayers };
}

export function yieldToMain(): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}
