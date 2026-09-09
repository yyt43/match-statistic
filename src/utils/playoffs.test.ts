import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePlayoffs, clearPlayoffs, getPlayoffOrder, recordPlayoffResult } from './playoffs';
import { calculateAllWinRates, createPlayersFromNames, detectTieGroups, getRankedPlayers } from './swissPairing';
import { useTournamentStore } from '../store/useTournamentStore';
import type { Match, TournamentGroup } from '../types';
import { listSnapshots } from './snapshot';
const makeGroup = (count: number): TournamentGroup => {
  const players = createPlayersFromNames(Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i)))
    .map(p => ({ ...p, id: p.name, wins: 1, losses: 1, points: 1, playedAgainst: [] as string[] }));
  const matches: Match[] = players.map((p, i) => ({ id: `regular-${i}`, round: i + 1, player1Id: p.id, player2Id: players[(i + 1) % count].id, result: 'player1', player1Games: 2, player2Games: 0 }));
  return { id: 'g', name: '小组', players: calculateAllWinRates(players, matches, 'bo3'), matches, currentRound: count, totalRounds: count, gameType: 'bo3', pairingType: 'swiss', status: 'completed', createdAt: '' };
};
const playoffMatches = (g: TournamentGroup) => g.matches.filter(m => m.isPlayoff);
const finish = (g: TournamentGroup, m: Match, right = false) => recordPlayoffResult(g, m.id, right ? 'player2' : 'player1', right ? 0 : 2, right ? 2 : 0);
const normalStats = (g: TournamentGroup) => g.players.map(({ playoffWins: _a, playoffRank: _b, playoffBracketId: _c, ...p }) => p).sort((a, b) => a.id.localeCompare(b.id));

describe('手册6.4D加赛路径', () => {
  it('两人历史上已交手，仍直接决胜；不计入常规数据且重复录分不累加', () => {
    const before = makeGroup(2);
    before.players[0].playedAgainst = [before.players[1].id]; before.players[1].playedAgainst = [before.players[0].id];
    let g = advancePlayoffs(before); const match = playoffMatches(g)[0];
    expect(playoffMatches(g)).toHaveLength(1); expect(match.isBye).not.toBe(true);
    g = finish(g, match); g = finish(g, match);
    expect(normalStats(g)).toEqual(normalStats(before));
    expect(getRankedPlayers(g.players, 'bo3')[0].id).toBe(match.player1Id);
    expect(g.players.find(p => p.id === match.player1Id)!.playoffWins).toBe(1);
    expect(detectTieGroups(g.players, 'bo3')).toHaveLength(0);
    expect(advancePlayoffs(g).matches).toHaveLength(g.matches.length);
  });
  it.each(['three_one', 'three_two'] as const)('%s按手册选择第二场对手及最终名次', (format) => {
    const before = makeGroup(3); let g = advancePlayoffs(before, { A: format });
    const bracket = g.playoffBrackets![0]; const first = playoffMatches(g)[0];
    expect(bracket.format).toBe(format); expect(playoffMatches(g)).toHaveLength(1);
    expect(g.players.find(p => p.id === bracket.waitingPlayerId)!.playoffWins).toBe(0);
    expect(advancePlayoffs(g).matches).toHaveLength(g.matches.length); // 首场未完赛不提前排第二场。
    g = finish(g, first); g = advancePlayoffs(g);
    const final = playoffMatches(g).find(m => m.playoffStage === 2)!;
    expect(final.player1Id).toBe(format === 'three_one' ? first.player1Id : first.player2Id);
    expect(final.player2Id).toBe(bracket.waitingPlayerId);
    // 等候者赢下最后一场，不能用胜场数替代比赛路径排序。
    g = finish(g, final, true);
    const expected = format === 'three_one'
      ? [bracket.waitingPlayerId, first.player1Id, first.player2Id]
      : [first.player1Id, bracket.waitingPlayerId, first.player2Id];
    expect(getPlayoffOrder(bracket, g.matches)).toEqual(expected);
    expect(getRankedPlayers(g.players, 'bo3').map(p => p.id)).toEqual(expected);
    expect(normalStats(g)).toEqual(normalStats(before));
  });
  it('四人首轮胜者及败者分别继续，并正确输出1至4名', () => {
    let g = advancePlayoffs(makeGroup(4)); const first = playoffMatches(g);
    g = finish(g, first[0]); g = finish(g, first[1]); g = advancePlayoffs(g);
    const final = playoffMatches(g).find(m => m.playoffRole === 'final')!;
    const placement = playoffMatches(g).find(m => m.playoffRole === 'placement')!;
    expect([final.player1Id, final.player2Id]).toEqual(first.map(m => m.player1Id));
    expect([placement.player1Id, placement.player2Id]).toEqual(first.map(m => m.player2Id));
    g = finish(g, final); g = finish(g, placement, true);
    expect(getRankedPlayers(g.players, 'bo3').map(p => p.id)).toEqual([final.player1Id, final.player2Id, placement.player2Id, placement.player1Id]);
    expect(advancePlayoffs(g).matches).toHaveLength(g.matches.length);
  });
  it('不同战绩的同分组独立生成，绝不跨组配对', () => {
    const before = makeGroup(4); before.players.forEach((p, i) => { p.wins = p.points = i < 2 ? 3 : 1; });
    const g = advancePlayoffs(before);
    expect(g.playoffBrackets).toHaveLength(2);
    for (const m of playoffMatches(g)) expect(g.players.find(p => p.id === m.player1Id)!.wins).toBe(g.players.find(p => p.id === m.player2Id)!.wins);
  });
  it('改判一个同分组首场只使该组后续比赛失效', () => {
    const before = makeGroup(8); before.players.forEach((p, i) => { p.wins = p.points = i < 4 ? 3 : 1; });
    let g = advancePlayoffs(before); const first = playoffMatches(g);
    for (const match of first) g = finish(g, match);
    g = advancePlayoffs(g);
    for (const m of playoffMatches(g).filter(m => m.playoffStage === 2)) g = finish(g, m);
    const changed = first[0]; const other = g.playoffBrackets!.find(b => b.id !== changed.playoffBracketId)!;
    const otherMatches = g.matches.filter(m => m.playoffBracketId === other.id);
    g = finish(g, changed, true);
    expect(g.matches.filter(m => m.playoffBracketId === changed.playoffBracketId && m.playoffStage === 2)).toHaveLength(0);
    expect(g.matches.filter(m => m.playoffBracketId === other.id)).toEqual(otherMatches);
    expect(g.players.filter(p => p.playoffBracketId === changed.playoffBracketId).every(p => p.playoffRank === undefined)).toBe(true);
    g = advancePlayoffs(g);
    expect(g.matches.find(m => m.playoffBracketId === changed.playoffBracketId && m.playoffRole === 'final')!.player1Id).toBe(changed.player2Id);
  });
  it('只改首场小比分而不改胜者时，保留第二阶段赛程', () => {
    let g = advancePlayoffs(makeGroup(3)); const first = playoffMatches(g)[0];
    g = advancePlayoffs(finish(g, first));
    const second = playoffMatches(g).find(m => m.playoffStage === 2)!;
    g = recordPlayoffResult(g, first.id, 'player1', 2, 1);
    expect(g.matches.find(m => m.id === second.id)).toEqual(second);
  });
  it('刷新导入保存的完整赛程后仍能继续，且不会重新抽签', () => {
    let g = advancePlayoffs(makeGroup(3), { A: 'three_two' }); const first = playoffMatches(g)[0];
    g = finish(g, first);
    const restored: TournamentGroup = JSON.parse(JSON.stringify(g));
    g = advancePlayoffs(restored);
    expect(g.playoffBrackets).toEqual(restored.playoffBrackets);
    expect(playoffMatches(g).find(m => m.playoffStage === 2)!.player1Id).toBe(first.player2Id);
  });
  it('整场双负和不合法比分不能推进决胜加赛', () => {
    const g = advancePlayoffs(makeGroup(2)); const m = playoffMatches(g)[0];
    expect(recordPlayoffResult(g, m.id, 'draw', 0, 0)).toBe(g);
    expect(recordPlayoffResult(g, m.id, 'player1', 1, 0)).toBe(g);
    expect(recordPlayoffResult(g, m.id, 'player1', 2, 2)).toBe(g);
  });
  it('清除加赛保留常规战绩，清理旧版加赛历史，允许重新生成', () => {
    let g = advancePlayoffs(makeGroup(3)); const before = normalStats(g);
    g = finish(g, playoffMatches(g)[0]); g = clearPlayoffs(g);
    expect(g.playoffBrackets).toBeUndefined(); expect(playoffMatches(g)).toHaveLength(0);
    expect(g.players.every(p => p.playoffWins === 0 && p.playoffRank === undefined)).toBe(true);
    expect(g.players.map(p => p.points).sort()).toEqual(before.map(p => p.points).sort());
    expect(advancePlayoffs(g).playoffBrackets).toHaveLength(1);
  });
  it('尚未结束、超过4人及旧版赛程均明确阻止自动生成', () => {
    const unfinished = makeGroup(3); unfinished.matches[0].result = 'pending';
    expect(() => advancePlayoffs(unfinished)).toThrow('常规轮次');
    expect(() => advancePlayoffs(makeGroup(5))).toThrow('超过4人');
    const old = makeGroup(3); old.matches.push({ ...old.matches[0], id: 'old', round: 0, isPlayoff: true });
    expect(() => advancePlayoffs(old)).toThrow('旧版加赛');
  });
});

describe('真实store加赛流程与撤回', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
    const s = useTournamentStore.getState(); s.initCompetition('测试', 1, 4, 2, 'bo3', 'swiss'); s.startTournament(2);
    for (let r = 1; r <= 2; r++) {
      const group = useTournamentStore.getState().competition.groups[0];
      for (const match of group.matches.filter(m => m.round === r && !m.isBye)) useTournamentStore.getState().updateMatchResult(match.id, 'draw', 0, 0);
      if (r === 1) useTournamentStore.getState().generateNextRound();
    }
  });
  it('两种录分入口均更新加赛名次，保存/快照恢复后可以续赛', () => {
    const s = useTournamentStore.getState(); s.generatePlayoff();
    let group = useTournamentStore.getState().competition.groups[0]; const first = playoffMatches(group);
    s.updateMatchResult(first[0].id, 'player1', 2, 0);
    s.updateMatchResultForGroup(0, first[1].id, 'player2', 1, 2);
    group = useTournamentStore.getState().competition.groups[0];
    expect(group.players.reduce((n, p) => n + (p.playoffWins ?? 0), 0)).toBe(2);
    s.createSnapshot('加赛'); const snapshot = listSnapshots()[0];
    s.resetPlayoffs(); expect(s.restoreFromSnapshot(snapshot.id)).toBe(true);
    s.generatePlayoff(); group = useTournamentStore.getState().competition.groups[0];
    expect(playoffMatches(group)).toHaveLength(4);
    for (const m of playoffMatches(group).filter(m => m.playoffStage === 2)) s.updateMatchResult(m.id, 'player1', 2, 0);
    expect(useTournamentStore.getState().competition.groups[0].players.every(p => p.playoffRank !== undefined)).toBe(true);
    s.loadSavedCompetition(); expect(useTournamentStore.getState().competition.groups[0].players.every(p => p.playoffRank !== undefined)).toBe(true);
  });
  it('撤回常规轮次后清除失效加赛；常规比分回滚仍正确', () => {
    const s = useTournamentStore.getState(); s.generatePlayoff();
    const match = playoffMatches(useTournamentStore.getState().competition.groups[0])[0];
    s.updateMatchResult(match.id, 'player1', 2, 0); s.undoLastRound();
    const g = useTournamentStore.getState().competition.groups[0];
    expect(g.currentRound).toBe(1); expect(playoffMatches(g)).toHaveLength(0);
    expect(g.playoffBrackets).toBeUndefined(); expect(g.players.every(p => !p.playoffWins && p.playoffRank === undefined && p.losses === 1)).toBe(true);
  });
});
