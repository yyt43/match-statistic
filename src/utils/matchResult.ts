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
 * A double loss is recorded as a loss for both sides at the maximum loss
 * score for the current series. Every entry path and display uses this helper
 * so the score and ranking network stay consistent.
 */
export function getDoubleLossScore(gameType: GameType): DoubleLossScore {
  const games = getWinningGames(gameType);
  return {
    player1Games: games,
    player2Games: games,
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

  // Legacy 0-0 draws must remain readable, but newly written draws always
  // carry the symmetric maximum loss score for the current series.
  if (player1Games === 0 && player2Games === 0) {
    return getDoubleLossScore(gameType);
  }

  return {
    player1Games: player1Games ?? player2Games ?? getWinningGames(gameType),
    player2Games: player2Games ?? player1Games ?? getWinningGames(gameType),
  };
}

export function getDoubleLossGames(match: Match): number | null {
  if (match.result !== 'draw') return null;
  return Math.max(match.player1Games ?? 0, match.player2Games ?? 0);
}

export function formatDoubleLoss(
  gameType: GameType,
  isEnglish = false
): string {
  const games = getWinningGames(gameType);
  return isEnglish
    ? `Double loss (both ruled 0-${games})`
    : `双负（双方均以0-${games}判负）`;
}

export function formatRecordedDoubleLoss(
  match: Match,
  isEnglish = false
): string {
  const games = getDoubleLossGames(match);
  if (games === null || games === 0) {
    return isEnglish ? 'Double loss (legacy 0-0)' : '双负（旧口径0-0）';
  }
  return isEnglish
    ? `Double loss (both ruled 0-${games})`
    : `双负（双方均以0-${games}判负）`;
}

export function isLegacyZeroZeroDoubleLoss(match: Match): boolean {
  return match.result === 'draw'
    && match.player1Games === 0
    && match.player2Games === 0;
}
