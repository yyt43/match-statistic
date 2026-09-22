import { describe, expect, it } from 'vitest';
import type { Match, TournamentGroup } from '../../types';
import { createPlayersFromNames } from '../swissPairing';
import { getMatchTableData, getRankingTableData } from './excelExport';

function createGroup(languagePlayers = ['Alice', 'Bob']): TournamentGroup {
  const players = createPlayersFromNames(languagePlayers);
  players[0].participantCode = 'A01';
  players[0].profile = { uid: '180748058' };
  players[1].participantCode = 'A02';
  players[1].profile = { uid: '338916899' };
  const match: Match = {
    id: 'match-1',
    round: 1,
    player1Id: players[0].id,
    player2Id: players[1].id,
    result: 'player1',
    player1Games: 1,
    player2Games: 0,
  };

  return {
    id: 'group-1',
    name: 'A',
    currentRound: 1,
    totalRounds: 1,
    status: 'completed',
    players,
    matches: [match],
    createdAt: '2026-09-11T00:00:00.000Z',
    pairingType: 'swiss',
    gameType: 'bo1',
    roundGameTypes: ['bo1'],
  };
}

describe('excel export data', () => {
  it('builds localized ranking headers', () => {
    const group = createGroup();
    const zh = getRankingTableData(group, 'zh');
    const en = getRankingTableData(group, 'en');

    expect(zh.headers).toContain('排名');
    expect(zh.headers.slice(0, 4)).toEqual(['排名', '选手编号', '选手名称', 'UID']);
    expect(zh.headers).toContain('比赛历史');
    expect(en.headers).toContain('Rank');
    expect(en.headers.slice(0, 4)).toEqual(['Rank', 'Participant code', 'Player', 'UID']);
    expect(en.headers).toContain('Match History');
    expect(zh.rows[0].slice(0, 4)).toEqual([1, 'A01', 'Alice', '180748058']);
    expect(en.rows[0].slice(0, 4)).toEqual([1, 'A01', 'Alice', '180748058']);
  });

  it('builds localized match table rows', () => {
    const group = createGroup();
    const zh = getMatchTableData(group, 1, 'zh');
    const en = getMatchTableData(group, 1, 'en');

    expect(zh.headers).toEqual([
      '场次',
      '选手编号 1',
      '选手名称 1',
      'UID 1',
      '比分',
      '选手编号 2',
      '选手名称 2',
      'UID 2',
      '结果',
    ]);
    expect(en.headers).toEqual([
      '#',
      'Participant code 1',
      'Player 1',
      'UID 1',
      'Score',
      'Participant code 2',
      'Player 2',
      'UID 2',
      'Result',
    ]);
    expect(zh.rows[0]).toEqual([1, 'A01', 'Alice', '180748058', '1-0', 'A02', 'Bob', '338916899', '选手1胜']);
    expect(en.rows[0]).toEqual([1, 'A01', 'Alice', '180748058', '1-0', 'A02', 'Bob', '338916899', 'Player 1 win']);
  });
});
