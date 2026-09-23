import { describe, expect, it } from 'vitest';
import { resolveRoundUndoMode } from './roundUndoMode';
import type { Match } from '../../types';

const pending = (round: number): Match => ({
  id: `pending-${round}`,
  round,
  player1Id: 'a',
  player2Id: 'b',
  result: 'pending',
});

describe('round undo mode', () => {
  it('returns to the previous round when the current round has no entered result', () => {
    expect(resolveRoundUndoMode(2, [pending(1), pending(2)])).toBe('return-previous');
  });

  it('clears results while keeping pairings once any result was entered', () => {
    expect(resolveRoundUndoMode(2, [
      pending(1),
      { ...pending(2), result: 'player1', player1Games: 1, player2Games: 0 },
    ])).toBe('clear-results');
  });

  it('returns to setup when round one has no entered results', () => {
    expect(resolveRoundUndoMode(1, [pending(1)])).toBe('return-setup');
  });

  it('ignores automatic byes when deciding whether results were entered', () => {
    expect(resolveRoundUndoMode(2, [
      {
        ...pending(2),
        player2Id: 'bye',
        isBye: true,
        result: 'player1',
      },
    ])).toBe('return-previous');
  });
});
