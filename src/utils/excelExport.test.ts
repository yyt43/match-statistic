import { describe, expect, it } from 'vitest';
import type { Match, TournamentGroup } from '../types';
import { createPlayersFromNames } from './swissPairing';
import { getMatchTableData, getRankingTableData } from './excelExport';

function createGroup(languagePlayers = ['Alice', 'Bob']): TournamentGroup {
  const players = createPlayersFromNames(languagePlayers);
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
    expect(zh.headers).toContain('比赛历史');
    expect(en.headers).toContain('Rank');
    expect(en.headers).toContain('Match History');
  });

  it('builds localized match table rows', () => {
    const group = createGroup();
    const zh = getMatchTableData(group, 1, 'zh');
    const en = getMatchTableData(group, 1, 'en');

    expect(zh.headers).toEqual(['场次', '选手1', '比分', '选手2', '结果']);
    expect(en.headers).toEqual(['#', 'Player 1', 'Score', 'Player 2', 'Result']);
    expect(zh.rows[0]).toEqual([1, 'Alice', '1-0', 'Bob', '选手1胜']);
    expect(en.rows[0]).toEqual([1, 'Alice', '1-0', 'Bob', 'Player 1 win']);
  });
});
