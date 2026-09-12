import { describe, expect, it } from 'vitest';
import type { TournamentCompetition } from '../../types';
import { CURRENT_STORAGE_VERSION, migrateCompetitionData } from './migrations';

function legacyCompetition(): TournamentCompetition {
  return {
    id: 'legacy',
    name: 'Legacy',
    currentGroupIndex: 0,
    createdAt: '2026-09-11T00:00:00.000Z',
    groups: [{
      id: 'group',
      name: 'A',
      currentRound: 0,
      totalRounds: 3,
      status: 'setup',
      createdAt: '2026-09-11T00:00:00.000Z',
      pairingType: undefined as never,
      gameType: 'swiss' as never,
      roundGameTypes: undefined,
      players: [{
        id: 'p1',
        name: 'Alice',
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
      }],
      matches: [],
    }],
  };
}

describe('storage migrations', () => {
  it('migrates legacy group fields to the current schema', () => {
    const migrated = migrateCompetitionData(legacyCompetition(), 1);
    expect(migrated.groups[0].pairingType).toBe('swiss');
    expect(migrated.groups[0].gameType).toBe('bo1');
    expect(migrated.groups[0].roundGameTypes).toHaveLength(3);
    expect(migrated.groups[0].players[0].downMatchCount).toBe(0);
  });

  it('normalizes round game type length', () => {
    const competition = legacyCompetition();
    competition.groups[0].pairingType = 'swiss';
    competition.groups[0].gameType = 'bo3';
    competition.groups[0].roundGameTypes = ['bo1'];

    const migrated = migrateCompetitionData(competition, 3);
    expect(migrated.groups[0].roundGameTypes).toEqual(['bo1', 'bo3', 'bo3']);
  });

  it('rejects data from a newer unsupported version', () => {
    expect(() => migrateCompetitionData(legacyCompetition(), CURRENT_STORAGE_VERSION + 1))
      .toThrow(/newer than supported/);
  });
});
