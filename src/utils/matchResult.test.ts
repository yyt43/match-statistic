import { describe, expect, it } from 'vitest';
import type { Match, Player } from '../types';
import {
  formatDoubleLoss,
  formatRecordedDoubleLoss,
  getDoubleLossGames,
  getDoubleLossScore,
  normalizeResultScore,
} from './matchResult';
import { calculateAllWinRates } from './swissPairing';

function player(id: string, name: string): Player {
  return {
    id,
    name,
    points: 0,
    wins: 0,
    losses: 0,
    totalGames: 0,
    wonGames: 0,
    winRate: 0,
    opponentWinRate: 0,
    opponentOpponentWinRate: 0,
    gameWinRate: 0,
    opponentGameWinRate: 0,
    playedAgainst: [],
    dropped: false,
    eliminated: false,
    downMatchCount: 0,
    upMatchCount: 0,
    hasDownPriority: false,
    hasUpPriority: false,
  };
}

describe('double loss scoring', () => {
  it.each([
    ['bo1', 1],
    ['bo3', 2],
    ['bo5', 3],
    ['bo7', 4],
  ] as const)('uses the maximum loss score for %s', (gameType, games) => {
    expect(getDoubleLossScore(gameType)).toEqual({
      player1Games: games,
      player2Games: games,
    });
    expect(formatDoubleLoss(gameType)).toContain(`0-${games}`);
  });

  it('labels legacy 0-0 separately and labels current symmetric scores accurately', () => {
    const legacy: Match = {
      id: 'legacy',
      round: 1,
      player1Id: 'a',
      player2Id: 'b',
      result: 'draw',
      player1Games: 0,
      player2Games: 0,
    };
    const current: Match = {
      ...legacy,
      id: 'current',
      player1Games: 2,
      player2Games: 2,
    };

    expect(getDoubleLossGames(legacy)).toBe(0);
    expect(formatRecordedDoubleLoss(legacy)).toBe('双负（旧口径0-0）');
    expect(formatRecordedDoubleLoss(current)).toBe('双负（双方均以0-2判负）');
  });

  it('counts the same loss games for both sides in the opponent network', () => {
    const a = player('a', 'A');
    const b = player('b', 'B');
    const match: Match = {
      id: 'm1',
      round: 1,
      player1Id: 'a',
      player2Id: 'b',
      result: 'draw',
      player1Games: 2,
      player2Games: 2,
    };

    const [aR, bR] = calculateAllWinRates(
      [
        { ...a, losses: 1, totalGames: 2 },
        { ...b, losses: 1, totalGames: 2 },
      ],
      [match],
      'bo3'
    );

    expect(aR).toMatchObject({ losses: 1, wonGames: 0, totalGames: 2, gameWinRate: 0, opponentGameWinRate: 0 });
    expect(bR).toMatchObject({ losses: 1, wonGames: 0, totalGames: 2, gameWinRate: 0, opponentGameWinRate: 0 });
  });

  it('normalizes newly written legacy-style 0-0 draws to the current series score', () => {
    expect(normalizeResultScore('draw', 'bo3', 0, 0)).toEqual({
      player1Games: 2,
      player2Games: 2,
    });
    expect(normalizeResultScore('draw', 'bo5', undefined, undefined)).toEqual({
      player1Games: 3,
      player2Games: 3,
    });
    expect(normalizeResultScore('player1', 'bo3', 2, 0)).toEqual({
      player1Games: 2,
      player2Games: 0,
    });
  });
});
