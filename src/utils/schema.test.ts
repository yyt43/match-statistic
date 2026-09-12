import { describe, expect, it } from 'vitest';
import { createNewCompetition } from '../store/tournamentFactory';
import { validateCompetitionData } from './schema';

function validCompetition() {
  return createNewCompetition('Schema test', 1, 4, 3);
}

describe('competition schema', () => {
  it('accepts a valid competition', () => {
    const result = validateCompetitionData(validCompetition());
    expect(result.success).toBe(true);
  });

  it('rejects an out-of-range current group index', () => {
    const competition = validCompetition();
    competition.currentGroupIndex = 3;

    const result = validateCompetitionData(competition);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain('currentGroupIndex');
  });

  it('rejects duplicate player ids and dangling match references', () => {
    const competition = validCompetition();
    const group = competition.groups[0];
    group.players[1].id = group.players[0].id;
    group.matches.push({
      id: 'match-1',
      round: 1,
      player1Id: 'missing-player',
      player2Id: group.players[0].id,
      result: 'pending',
    });

    const result = validateCompetitionData(competition);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('duplicate id');
      expect(result.message).toContain('unknown player reference');
    }
  });

  it('rejects malformed bye and round game type data', () => {
    const competition = validCompetition();
    const group = competition.groups[0];
    group.roundGameTypes = ['bo1'];
    group.matches.push({
      id: 'bye-1',
      round: 1,
      player1Id: group.players[0].id,
      player2Id: 'bye',
      isBye: true,
      result: 'pending',
    });

    const result = validateCompetitionData(competition);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('roundGameTypes');
      expect(result.message).toContain('invalid bye match');
    }
  });
});
