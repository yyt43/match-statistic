import { describe, expect, it } from 'vitest';
import { createPlayersFromNames, getRankedPlayers } from './swissPairing';
import { normalizeTiebreakRules } from './tiebreak';
import type { TiebreakRule } from '../types';

function rankedIds(rules: TiebreakRule[]): string[] {
  const [a, b] = createPlayersFromNames(['A', 'B']);
  a.wins = 2;
  b.wins = 2;
  a.opponentWinRate = 0.2;
  b.opponentWinRate = 0.8;
  a.points = 5;
  b.points = 3;
  return getRankedPlayers([a, b], 'bo3', 'swiss', rules).map(player => player.name);
}

describe('tiebreak configuration', () => {
  it('uses the configured rule order', () => {
    expect(rankedIds(['points', 'opponentWinRate'])).toEqual(['A', 'B']);
    expect(rankedIds(['opponentWinRate', 'points'])).toEqual(['B', 'A']);
  });

  it('normalizes duplicates and falls back to the game type defaults', () => {
    expect(normalizeTiebreakRules([
      'points',
      'points',
      'opponentWinRate',
    ], 'bo3')).toEqual(['points', 'opponentWinRate']);
    expect(normalizeTiebreakRules([], 'bo3').length).toBeGreaterThan(0);
  });
});
