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
    'bo1',
    'bo3',
    'bo5',
    'bo7',
  ] as const)('uses 0-0 for both players in %s', () => {
    expect(getDoubleLossScore()).toEqual({
      player1Games: 0,
      player2Games: 0,
    });
    expect(formatDoubleLoss()).toContain('0-0');
  });

  it('labels current 0-0 and marks older positive double-loss scores as legacy', () => {
    const current: Match = {
      id: 'legacy',
      round: 1,
      player1Id: 'a',
      player2Id: 'b',
      result: 'draw',
      player1Games: 0,
      player2Games: 0,
    };
    const legacy: Match = {
      ...current,
      id: 'legacy-score',
      player1Games: 2,
      player2Games: 2,
    };

    expect(getDoubleLossGames(current)).toBe(0);
    expect(formatRecordedDoubleLoss(current)).toBe('双负（0-0）');
    expect(formatRecordedDoubleLoss(legacy)).toBe('双负（旧口径2-2）');
  });

  it('counts the loss for both sides without adding played games for a 0-0 double loss', () => {
    const a = player('a', 'A');
    const b = player('b', 'B');
    const match: Match = {
      id: 'm1',
      round: 1,
      player1Id: 'a',
      player2Id: 'b',
      result: 'draw',
      player1Games: 0,
      player2Games: 0,
    };

    const [aR, bR] = calculateAllWinRates(
      [
        { ...a, losses: 1 },
        { ...b, losses: 1 },
      ],
      [match],
      'bo3'
    );

    expect(aR).toMatchObject({ losses: 1, wonGames: 0, totalGames: 0, gameWinRate: 0, opponentGameWinRate: 0 });
    expect(bR).toMatchObject({ losses: 1, wonGames: 0, totalGames: 0, gameWinRate: 0, opponentGameWinRate: 0 });
  });

  it('normalizes every newly written draw to 0-0', () => {
    expect(normalizeResultScore('draw', 'bo3', 0, 0)).toEqual({
      player1Games: 0,
      player2Games: 0,
    });
    expect(normalizeResultScore('draw', 'bo5', undefined, undefined)).toEqual({
      player1Games: 0,
      player2Games: 0,
    });
    expect(normalizeResultScore('draw', 'bo3', 2, 2)).toEqual({
      player1Games: 0,
      player2Games: 0,
    });
    expect(normalizeResultScore('player1', 'bo3', 2, 0)).toEqual({
      player1Games: 2,
      player2Games: 0,
    });
  });
});
