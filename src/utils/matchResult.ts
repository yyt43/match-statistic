import type { GameType, Match } from '../types';

export function getWinningGames(gameType: GameType): number {
  switch (gameType) {
    case 'bo7':
      return 4;
    case 'bo5':
      return 3;
    case 'bo3':
      return 2;
    case 'bo1':
    default:
      return 1;
  }
}

export interface DoubleLossScore {
  player1Games: number;
  player2Games: number;
}

/**
 * A double loss is recorded as 0-0 for both sides. The result itself still
 * counts as a loss for each player; the 0-0 score does not add played games.
 */
export function getDoubleLossScore(): DoubleLossScore {
  return {
    player1Games: 0,
    player2Games: 0,
  };
}

export function normalizeResultScore(
  result: Match['result'],
  gameType: GameType,
  player1Games?: number,
  player2Games?: number
): { player1Games?: number; player2Games?: number } {
  if (result !== 'draw') {
    return { player1Games, player2Games };
  }

  void gameType;
  return getDoubleLossScore();
}

export function getDoubleLossGames(match: Match): number | null {
  if (match.result !== 'draw') return null;
  return Math.max(match.player1Games ?? 0, match.player2Games ?? 0);
}

export function formatDoubleLoss(
  isEnglish = false
): string {
  return isEnglish ? 'Double loss (0-0)' : '双负（0-0）';
}

export function formatRecordedDoubleLoss(
  match: Match,
  isEnglish = false
): string {
  const games = getDoubleLossGames(match);
  if (games !== null && games > 0) {
    return isEnglish
      ? `Double loss (legacy ${match.player1Games ?? 0}-${match.player2Games ?? 0})`
      : `双负（旧口径${match.player1Games ?? 0}-${match.player2Games ?? 0}）`;
  }
  return formatDoubleLoss(isEnglish);
}

export function hasRecordedDoubleLossGames(match: Match): boolean {
  return match.result === 'draw' && getDoubleLossGames(match) !== 0;
}
