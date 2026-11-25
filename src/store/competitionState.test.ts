import { describe, expect, it } from 'vitest';
import type { TournamentCompetition, TournamentGroup } from '../types';
import {
  collectPreDroppedPlayerIds,
  getGroupTotalRounds,
  isFinalRoundScored,
  normalizeCompetitionGroups,
  replaceGroupAtIndex,
  resolveViewRound,
} from './competitionState';

function makeGroup(overrides: Partial<TournamentGroup> = {}): TournamentGroup {
  return {
    id: 'group-1',
    name: '小组01',
    currentRound: 0,
    totalRounds: 3,
    status: 'setup',
    players: [],
    matches: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    pairingType: 'swiss',
    gameType: 'bo1',
    roundGameTypes: ['bo1', 'bo1', 'bo1'],
    ...overrides,
  };
}

describe('competition state helpers', () => {
  it('resolveViewRound should follow the current group when it has already started', () => {
    const competition: TournamentCompetition = {
      id: 'c-1',
      name: '测试赛事',
      currentGroupIndex: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      groups: [
        makeGroup({ currentRound: 2, status: 'in_progress' }),
        makeGroup({ currentRound: 0, status: 'setup' }),
      ],
    };

    expect(resolveViewRound(competition)).toBe(2);
  });

  it('normalizeCompetitionGroups should preserve current ranking order and previousRank metadata', () => {
    const group = makeGroup({
      players: [
        { id: 'p1', name: 'A', points: 2, wins: 2, losses: 0, totalGames: 2, wonGames: 2, winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0, gameWinRate: 0, opponentGameWinRate: 0, playedAgainst: [], previousRank: 2 },
        { id: 'p2', name: 'B', points: 1, wins: 1, losses: 1, totalGames: 2, wonGames: 1, winRate: 0, opponentWinRate: 0, opponentOpponentWinRate: 0, gameWinRate: 0, opponentGameWinRate: 0, playedAgainst: [], previousRank: 1 },
      ],
      matches: [],
    });

    const competition = normalizeCompetitionGroups({
      id: 'c-1',
      name: '测试赛事',
      currentGroupIndex: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      groups: [group],
    });

    expect(competition.groups[0].players.map(p => p.name)).toEqual(['A', 'B']);
    expect(competition.groups[0].players[0].previousRank).toBe(1);
    expect(competition.groups[0].players[1].previousRank).toBe(2);
  });

  it('replaceGroupAtIndex should swap the selected group without mutating unrelated groups', () => {
    const g1 = makeGroup({ id: 'g1', name: 'A' });
    const g2 = makeGroup({ id: 'g2', name: 'B' });
    const competition: TournamentCompetition = {
      id: 'c-1',
      name: '测试赛事',
      currentGroupIndex: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      groups: [g1, g2],
    };

    const next = replaceGroupAtIndex(competition, 1, makeGroup({ id: 'g3', name: 'C' }));

    expect(next.groups[0].name).toBe('A');
    expect(next.groups[1].name).toBe('C');
    expect(next.groups[1].id).toBe('g3');
  });

  it('replaceGroupAtIndex should ignore invalid group indexes without mutating the competition', () => {
    const g1 = makeGroup({ id: 'g1', name: 'A' });
    const g2 = makeGroup({ id: 'g2', name: 'B' });
    const competition: TournamentCompetition = {
      id: 'c-1',
      name: '测试赛事',
      currentGroupIndex: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      groups: [g1, g2],
    };

    const next = replaceGroupAtIndex(competition, 99, makeGroup({ id: 'g3', name: 'C' }));

    expect(next).toEqual(competition);
    expect(next.groups).toHaveLength(2);
  });

  it('collectPreDroppedPlayerIds should only include players who actually lost via pre-drop matches', () => {
    const matches: Array<{
      id: string;
      round: number;
      player1Id: string;
      player2Id: string;
      result: 'player1' | 'player2';
      preDrop?: boolean;
    }> = [
      { id: 'm1', round: 1, player1Id: 'a', player2Id: 'b', result: 'player1', preDrop: true },
      { id: 'm2', round: 2, player1Id: 'c', player2Id: 'd', result: 'player2' },
      { id: 'm3', round: 2, player1Id: 'e', player2Id: 'f', result: 'player1', preDrop: true },
    ];

    expect(collectPreDroppedPlayerIds(matches)).toEqual(new Set(['b', 'f']));
  });

  it('isFinalRoundScored only accepts a fully recorded last round of a running group', () => {
    const matches = [
      { id: 'm1', round: 1, player1Id: 'a', player2Id: 'b', result: 'player1' as const },
      { id: 'm2', round: 1, player1Id: 'c', player2Id: 'd', result: 'pending' as const },
    ];
    const running = makeGroup({ currentRound: 1, totalRounds: 1, status: 'in_progress', matches });
    expect(isFinalRoundScored(running)).toBe(false);

    const scored = makeGroup({
      currentRound: 1,
      totalRounds: 1,
      status: 'in_progress',
      matches: [matches[0], { ...matches[1], result: 'player2' as const }],
    });
    expect(isFinalRoundScored(scored)).toBe(true);
    // 还没打到最后一轮时不算完成。
    expect(isFinalRoundScored(makeGroup({ currentRound: 1, totalRounds: 3, status: 'in_progress', matches: [matches[0]] }))).toBe(false);
    // 已结束或未开赛都返回 false。
    expect(isFinalRoundScored({ ...scored, status: 'completed' })).toBe(false);
    expect(isFinalRoundScored({ ...scored, status: 'setup' })).toBe(false);
  });

  it('getGroupTotalRounds prefers the elimination bracket size for single elimination', () => {
    const bracketGroup = makeGroup({
      pairingType: 'single_elimination',
      totalRounds: 2,
      eliminationBracket: { size: 8, matches: [], createdAt: '2024-01-01T00:00:00.000Z' } as never,
    });
    expect(getGroupTotalRounds(bracketGroup)).toBe(3);
    expect(getGroupTotalRounds(makeGroup({ totalRounds: 5 }))).toBe(5);
  });
});
