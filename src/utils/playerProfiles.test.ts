import { describe, expect, it } from 'vitest';
import { createNewCompetition } from '../store/tournamentFactory';
import {
  generateParticipantCodes,
  getDefaultPlayerFields,
  normalizeUid,
  validateRoster,
} from './playerProfiles';

function poetryCompetition() {
  const competition = createNewCompetition('Poetry', 2, 2, 3, 'bo3');
  competition.playerSchemaId = 'poetryCupS2';
  competition.playerFields = getDefaultPlayerFields('poetryCupS2');
  return competition;
}

describe('player profile schema', () => {
  it('generates stable group participant codes', () => {
    const competition = poetryCompetition();
    const generated = generateParticipantCodes(competition);
    expect(generated.groups[0].players.map(player => player.participantCode)).toEqual(['A01', 'A02']);
    expect(generated.groups[1].players.map(player => player.participantCode)).toEqual(['B01', 'B02']);
  });

  it('accepts a complete poem cup roster with unique UIDs', () => {
    const competition = generateParticipantCodes(poetryCompetition());
    competition.groups[0].players[0].profile = { uid: '180748058', qq: '2957815893' };
    competition.groups[0].players[1].profile = { uid: '338916899', qq: '1615852778' };
    competition.groups[1].players[0].profile = { uid: '346732256', qq: '2133152813' };
    competition.groups[1].players[1].profile = { uid: '283093920', qq: '639177928' };

    expect(validateRoster(competition).valid).toBe(true);
  });

  it('rejects duplicate UIDs and duplicate participant codes', () => {
    const competition = generateParticipantCodes(poetryCompetition());
    competition.groups[0].players[0].profile = { uid: '180748058', qq: '2957815893' };
    competition.groups[0].players[1].profile = { uid: '180748058', qq: '1615852778' };
    competition.groups[1].players[0].profile = { uid: '346732256', qq: '2133152813' };
    competition.groups[1].players[1].profile = { uid: '283093920', qq: '639177928' };
    competition.groups[1].players[1].participantCode = 'A01';

    const summary = validateRoster(competition);
    expect(summary.valid).toBe(false);
    expect(summary.issues.some(issue => issue.code === 'DUPLICATE_UID')).toBe(true);
    expect(summary.issues.some(issue => issue.code === 'DUPLICATE_PARTICIPANT_CODE')).toBe(true);
  });

  it('normalizes common UID input separators', () => {
    expect(normalizeUid(' 180-748-058 ')).toBe('180748058');
  });
});
