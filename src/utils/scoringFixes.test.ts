import { describe, expect, it } from 'vitest';
import { maximumMatching } from './maximumMatching';
import { calculateAllWinRates, createPlayersFromNames, matchDownPoolInternal } from './swissPairing';
import type { Match, Player } from '../types';
const player = (id: string, playedAgainst: string[] = []): Player => ({ ...createPlayersFromNames([id])[0], id, playedAgainst });
const states = (players: Player[]) => players.map((p, rank) => ({ player: p, rank, playedAgainst: new Set(p.playedAgainst), downMatchCount: 0, upMatchCount: 0, hasDownPriority: false, hasUpPriority: false }));
const maxPairs = (edges: boolean[][], ids = edges.map((_, i) => i)): number => {
  if (ids.length < 2) return 0;
  const [first, ...rest] = ids;
  let best = maxPairs(edges, rest);
  for (const next of rest) if (edges[first][next]) best = Math.max(best, 1 + maxPairs(edges, rest.filter(i => i !== next)));
  return best;
};
describe('下移组部分配对', () => {
  it('三人均可交手时先配成一场，再留下一个人', () => {
    const result = matchDownPoolInternal(states(['A', 'B', 'C'].map(id => player(id))));
    expect(result.pairs).toHaveLength(1); expect(result.remaining).toHaveLength(1);
  });
  it('偶数池无法完全配对时保留已有的有效配对', () => {
    const result = matchDownPoolInternal(states([player('A', ['C', 'D']), player('B', ['C', 'D']), player('C', ['A', 'B', 'D']), player('D', ['A', 'B', 'C'])]));
    expect(result.pairs.map(pair => pair.map(s => s.player.id))).toEqual([['A', 'B']]);
    expect(result.remaining.map(s => s.player.id)).toEqual(['C', 'D']);
  });
  it('最大匹配对所有6顶点无向图均与独立穷举结果一致', () => {
    const n = 6; const links: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) links.push([i, j]);
    for (let mask = 0; mask < 2 ** links.length; mask++) {
      const edges = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
      links.forEach(([a, b], bit) => { edges[a][b] = edges[b][a] = !!(mask & (1 << bit)); });
      const matching = maximumMatching(edges);
      expect(matching.filter(i => i >= 0).length / 2).toBe(maxPairs(edges));
      matching.forEach((partner, i) => { if (partner >= 0) { expect(edges[i][partner]).toBe(true); expect(matching[partner]).toBe(i); } });
    }
  }, 15000);
});
describe('多次轮空小分', () => {
  const matches: Match[] = [
    { id: 'bye1', round: 1, player1Id: 'A', player2Id: 'bye', isBye: true, result: 'player1', player1Games: 2, player2Games: 0 },
    { id: 'bye2', round: 2, player1Id: 'A', player2Id: 'bye', isBye: true, result: 'player1', player1Games: 2, player2Games: 0 },
    { id: 'AB', round: 3, player1Id: 'A', player2Id: 'B', result: 'player1', player1Games: 2, player2Games: 0 },
    { id: 'BC', round: 1, player1Id: 'B', player2Id: 'C', result: 'player1', player1Games: 2, player2Games: 0 },
  ];
  it('两次轮空逐场计入SOS和对手局胜率', () => {
    const result = calculateAllWinRates(['A', 'B', 'C'].map(id => player(id)), matches, 'bo3');
    const a = result.find(p => p.id === 'A')!;
    expect(a.opponentWinRate).toBeCloseTo(1 / 4);
    expect(a.opponentGameWinRate).toBeCloseTo(2 / 8);
    // B的对手A有两次轮空和真实对手B；C的真实对手也是B。
    expect(result.find(p => p.id === 'B')!.opponentOpponentWinRate).toBeCloseTo(2 / 6);
  });
  it('撤去一次轮空后分母随场次更新；序列化不会合并轮空', () => {
    const ps = ['A', 'B', 'C'].map(id => player(id));
    const copy = JSON.parse(JSON.stringify(matches));
    expect(calculateAllWinRates(ps, copy, 'bo3')[0].opponentWinRate).toBeCloseTo(.25);
    expect(calculateAllWinRates(ps, copy.filter((m: Match) => m.id !== 'bye2'), 'bo3')[0].opponentWinRate).toBeCloseTo(1 / 3);
  });
  it('赛前弃赛和加赛中的轮空记录仍排除在常规小分之外', () => {
    const extra = [{ ...matches[0], id: 'playoff', isPlayoff: true }, { ...matches[0], id: 'predrop', preDrop: true }];
    const ps = ['A', 'B', 'C'].map(id => player(id));
    expect(calculateAllWinRates(ps, [...matches, ...extra], 'bo3')).toEqual(calculateAllWinRates(ps, matches, 'bo3'));
  });
});
