import type { Match, MatchResult, Player } from '../types';

export function revertMatchResult(
  playerMap: Map<string, Player>,
  match: Match,
  res: MatchResult,
  wasPreDrop: boolean,
  isSingleElimination: boolean
): void {
  const isPlayoff = !!match.isPlayoff;
  const p1Id = match.player1Id;
  const p2Id = match.player2Id;

  if (p2Id === 'bye') {
    const p1 = playerMap.get(p1Id);
    if (!p1) return;
    if (res === 'player1') {
      if (isPlayoff) {
        p1.playoffWins = (p1.playoffWins || 0) - 1;
      } else {
        p1.points -= 1; p1.wins -= 1;
        p1.playedAgainst = p1.playedAgainst.filter(id => id !== 'bye');
      }
    }
    if (!isPlayoff && match.player1Games !== undefined && match.player2Games !== undefined) {
      p1.totalGames -= match.player1Games + match.player2Games;
      p1.wonGames -= match.player1Games;
    }
    return;
  }

  const p1 = playerMap.get(p1Id);
  const p2 = playerMap.get(p2Id);
  if (!p1 || !p2) return;

  if (isPlayoff) {
    if (res === 'player1') {
      p1.playoffWins = (p1.playoffWins || 0) - 1;
    } else if (res === 'player2') {
      p2.playoffWins = (p2.playoffWins || 0) - 1;
    }
    return;
  }

  if (res === 'player1') {
    p1.points -= 1; p1.wins -= 1;
    if (!wasPreDrop) p2.losses -= 1;
    if (!wasPreDrop) {
      p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2Id);
      p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1Id);
    } else {
      p2.dropped = false;
    }
    if (isSingleElimination) p2.eliminated = false;
  } else if (res === 'player2') {
    p2.points -= 1; p2.wins -= 1;
    if (!wasPreDrop) p1.losses -= 1;
    if (!wasPreDrop) {
      p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2Id);
      p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1Id);
    } else {
      p1.dropped = false;
    }
    if (isSingleElimination) p1.eliminated = false;
  } else if (res === 'draw') {
    p1.losses -= 1; p2.losses -= 1;
    if (!wasPreDrop) {
      p1.playedAgainst = p1.playedAgainst.filter(id => id !== p2Id);
      p2.playedAgainst = p2.playedAgainst.filter(id => id !== p1Id);
    }
    if (isSingleElimination) {
      p1.eliminated = false;
      p2.eliminated = false;
    }
  }

  if (!wasPreDrop && match.player1Games !== undefined && match.player2Games !== undefined) {
    p1.totalGames -= match.player1Games + match.player2Games;
    p1.wonGames -= match.player1Games;
    p2.totalGames -= match.player1Games + match.player2Games;
    p2.wonGames -= match.player2Games;
  }
}

export function applyMatchResultToMap(
  playerMap: Map<string, Player>,
  match: Match,
  res: MatchResult,
  isPreDrop: boolean,
  isSingleElimination: boolean,
  player1Games?: number,
  player2Games?: number
): void {
  const isPlayoff = !!match.isPlayoff;
  const p1Id = match.player1Id;
  const p2Id = match.player2Id;

  if (p2Id === 'bye') {
    const p1 = playerMap.get(p1Id);
    if (!p1) return;
    if (res === 'player1') {
      if (isPlayoff) {
        p1.playoffWins = (p1.playoffWins || 0) + 1;
      } else {
        p1.points += 1; p1.wins += 1;
        p1.playedAgainst.push('bye');
      }
    }
    if (!isPlayoff && player1Games !== undefined && player2Games !== undefined) {
      p1.totalGames += player1Games + player2Games;
      p1.wonGames += player1Games;
    }
    return;
  }

  const p1 = playerMap.get(p1Id);
  const p2 = playerMap.get(p2Id);
  if (!p1 || !p2) return;

  if (isPlayoff) {
    if (res === 'player1') {
      p1.playoffWins = (p1.playoffWins || 0) + 1;
    } else if (res === 'player2') {
      p2.playoffWins = (p2.playoffWins || 0) + 1;
    }
    return;
  }

  if (res === 'player1') {
    p1.points += 1; p1.wins += 1;
    if (!isPreDrop) p2.losses += 1;
    if (!isPreDrop) {
      p1.playedAgainst.push(p2Id);
      p2.playedAgainst.push(p1Id);
    } else {
      p2.dropped = true;
    }
    if (isSingleElimination) p2.eliminated = true;
  } else if (res === 'player2') {
    p2.points += 1; p2.wins += 1;
    if (!isPreDrop) p1.losses += 1;
    if (!isPreDrop) {
      p1.playedAgainst.push(p2Id);
      p2.playedAgainst.push(p1Id);
    } else {
      p1.dropped = true;
    }
    if (isSingleElimination) p1.eliminated = true;
  } else if (res === 'draw') {
    p1.losses += 1; p2.losses += 1;
    if (!isPreDrop) {
      p1.playedAgainst.push(p2Id);
      p2.playedAgainst.push(p1Id);
    }
    if (isSingleElimination) {
      p1.eliminated = true;
      p2.eliminated = true;
    }
  }

  if (!isPreDrop && player1Games !== undefined && player2Games !== undefined) {
    p1.totalGames += player1Games + player2Games;
    p1.wonGames += player1Games;
    p2.totalGames += player1Games + player2Games;
    p2.wonGames += player2Games;
  }
}
