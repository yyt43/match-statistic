import { describe, expect, it } from 'vitest';
import { buildQuickScoreOptions } from './quickScoreOptions';

describe('quick score keyboard options', () => {
  it('maps every BO3 score from the visible winner perspective', () => {
    expect(buildQuickScoreOptions('bo3')).toEqual([
      { result: 'player1', player1Games: 2, player2Games: 0, shortcut: '1' },
      { result: 'player2', player1Games: 0, player2Games: 2, shortcut: '2' },
      { result: 'player1', player1Games: 2, player2Games: 1, shortcut: '3' },
      { result: 'player2', player1Games: 1, player2Games: 2, shortcut: '4' },
    ]);
  });

  it('extends the same side-first shortcut pattern for BO5 and BO7', () => {
    expect(buildQuickScoreOptions('bo5').map(option => option.shortcut))
      .toEqual(['1', '2', '3', '4', '5', '6']);
    expect(buildQuickScoreOptions('bo7').at(-1)).toEqual({
      result: 'player2',
      player1Games: 3,
      player2Games: 4,
      shortcut: '8',
    });
  });
});
