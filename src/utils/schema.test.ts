import { describe, expect, it } from 'vitest';
import type { TournamentCompetition } from '../types';
import { createNewCompetition } from '../store/tournamentFactory';
import { validateCompetitionData } from './schema';
import { normalizeCompetitionGroups } from '../store/competitionState';
import { getCompetitionKind, getOrderedStages } from './multiStage';

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

  it('rejects duplicate tiebreak rules', () => {
    const competition = validCompetition();
    competition.groups[0].tiebreakRules = ['points', 'points'];

    const result = validateCompetitionData(competition);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain('tiebreakRules');
  });

  it('rejects duplicate participant codes and UIDs across groups', () => {
    const competition = validCompetition();
    competition.playerSchemaId = 'poetryCupS2';
    competition.groups[0].players[0].participantCode = 'A01';
    competition.groups[0].players[0].profile = { uid: '180748058' };
    competition.groups[0].players[1].participantCode = 'A01';
    competition.groups[0].players[1].profile = { uid: '180748058' };

    const result = validateCompetitionData(competition);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('duplicate');
      expect(result.message).toContain('uid');
    }
  });

  it('rejects invalid fixed-bracket slots and dangling node references', () => {
    const competition = validCompetition();
    const group = competition.groups[0];
    group.eliminationBracket = {
      id: 'bracket-1',
      size: 4,
      slots: [group.players[0].id, group.players[0].id, group.players[1].id, null],
      source: 'roster_order',
    };
    group.matches.push({
      id: 'bracket-match',
      round: 1,
      player1Id: group.players[0].id,
      player2Id: group.players[1].id,
      result: 'pending',
      bracketNodeId: 'r1-m0',
    });

    const result = validateCompetitionData(competition);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('duplicate player reference');
      expect(result.message).toContain('must contain every player exactly once');
    }
  });
});

describe('legacy export compatibility', () => {
  it('accepts an export without any multi-stage fields', () => {
    const legacy = JSON.parse(
      JSON.stringify(createNewCompetition('Legacy', 2, 4, 3, 'bo3', 'swiss'))
    );
    expect(legacy.format).toBeUndefined();
    expect(legacy.stages).toBeUndefined();
    expect(legacy.groups[0].stageId).toBeUndefined();

    const result = validateCompetitionData(legacy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(getCompetitionKind(result.data as TournamentCompetition)).toBe('single_stage');
      expect(getOrderedStages(result.data as TournamentCompetition)).toEqual([]);
    }
  });

  it('accepts a trimmed legacy payload and fills the profile defaults', () => {
    const raw = JSON.parse(
      JSON.stringify(createNewCompetition('Legacy trimmed', 1, 4, 3, 'bo1', 'swiss'))
    ) as Record<string, unknown>;
    delete raw.playerSchemaId;
    delete raw.playerFields;
    (raw.groups as Array<Record<string, unknown>>).forEach(group => {
      (group.players as Array<Record<string, unknown>>).forEach(player => {
        delete player.profile;
      });
    });

    const result = validateCompetitionData(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const normalized = normalizeCompetitionGroups(result.data as TournamentCompetition);
      expect(normalized.playerFields?.length).toBeGreaterThan(0);
      expect(normalized.groups[0].players[0].profile).toEqual({});
    }
  });

  it('still rejects duplicate participant codes inside single-stage groups', () => {
    const competition = createNewCompetition('Legacy duplicates', 2, 4, 3, 'bo1', 'swiss');
    competition.groups[1].players[0].participantCode =
      competition.groups[0].players[0].participantCode;

    const result = validateCompetitionData(JSON.parse(JSON.stringify(competition)));
    expect(result.success).toBe(false);
  });
});
