import type { Match } from '../../types';

export type RoundUndoMode = 'none' | 'clear-results' | 'return-previous' | 'return-setup';

export function resolveRoundUndoMode(
  currentRound: number,
  matches: Match[]
): RoundUndoMode {
  const hasEnteredResult = matches.some(match =>
    match.round === currentRound
    && !match.isBye
    && match.result !== 'pending'
  );
  if (hasEnteredResult) return 'clear-results';
  if (currentRound > 1) return 'return-previous';
  return currentRound === 1 ? 'return-setup' : 'none';
}
