import { describe, expect, it } from 'vitest';
import { createNewCompetition } from '../store/tournamentFactory';
import {
  getDefaultPlayerFields,
  normalizeUid,
  sortPlayersByParticipantCode,
  validateRoster,
} from './playerProfiles';

function poetryCompetition() {
  const competition = createNewCompetition('Poetry', 2, 2, 3, 'bo3');
  competition.groups[0].name = 'A组';
  competition.groups[1].name = 'B组';
  competition.playerSchemaId = 'poetryCupS2';
  competition.playerFields = getDefaultPlayerFields('poetryCupS2');
  return competition;
}

function withParticipantCodes(competition: ReturnType<typeof poetryCompetition>) {
  return {
    ...competition,
    groups: competition.groups.map((group, groupIndex) => ({
      ...group,
      players: group.players.map((player, playerIndex) => ({
        ...player,
        participantCode: `${String.fromCharCode(65 + groupIndex)}${String(playerIndex + 1).padStart(2, '0')}`,
      })),
    })),
  };
}

describe('player profile schema', () => {
  it('accepts a complete poem cup roster with unique UIDs', () => {
    const competition = withParticipantCodes(poetryCompetition());
    competition.groups[0].players[0].profile = { uid: '180748058', qq: '2957815893' };
    competition.groups[0].players[1].profile = { uid: '338916899', qq: '1615852778' };
    competition.groups[1].players[0].profile = { uid: '346732256', qq: '2133152813' };
    competition.groups[1].players[1].profile = { uid: '283093920', qq: '639177928' };

    expect(validateRoster(competition).valid).toBe(true);
  });

  it('rejects duplicate UIDs and duplicate participant codes', () => {
    const competition = withParticipantCodes(poetryCompetition());
    competition.groups[0].players[0].profile = { uid: '180748058', qq: '2957815893' };
    competition.groups[0].players[1].profile = { uid: '180748058', qq: '1615852778' };
    competition.groups[1].players[0].profile = { uid: '346732256', qq: '2133152813' };
    competition.groups[1].players[1].profile = { uid: '283093920', qq: '639177928' };
    competition.groups[1].players[1].participantCode = 'A01';

    const summary = validateRoster(competition);
    expect(summary.valid).toBe(false);
    expect(summary.issues.some(issue => issue.code === 'DUPLICATE_UID')).toBe(true);
    expect(summary.issues.some(issue => issue.code === 'DUPLICATE_PARTICIPANT_CODE')).toBe(true);
    expect(summary.issues.find(issue => issue.code === 'DUPLICATE_UID')?.message)
      .toContain('A组 / A02 /');
  });

  it('normalizes common UID input separators', () => {
    expect(normalizeUid(' 180-748-058 ')).toBe('180748058');
  });

  it('sorts players strictly by participant code', () => {
    const players = [
      { id: '3', name: 'three', participantCode: 'A10', points: 0, wins: 0, losses: 0, totalGames: 0, wonGames: 0, winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0, gameWinRate: 0, opponentGameWinRate: 0, playedAgainst: [] },
      { id: '1', name: 'one', participantCode: 'A02', points: 0, wins: 0, losses: 0, totalGames: 0, wonGames: 0, winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0, gameWinRate: 0, opponentGameWinRate: 0, playedAgainst: [] },
      { id: '2', name: 'two', points: 0, wins: 0, losses: 0, totalGames: 0, wonGames: 0, winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0, gameWinRate: 0, opponentGameWinRate: 0, playedAgainst: [] },
    ];
    expect(sortPlayersByParticipantCode(players).map(player => player.id)).toEqual(['1', '3', '2']);
  });
});
