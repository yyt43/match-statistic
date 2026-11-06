import { describe, expect, it } from 'vitest';
import type { Match, Player, TournamentGroup } from '../types';
import {
  createEliminationFirstRoundMatches,
  createEliminationNextRoundMatches,
  createOrderedEliminationBracket,
} from './elimination';
import { reconcileCompetitionRounds, repairCompetitionEliminationMatches } from './eliminationRepair';

function player(id: string): Player {
  return {
    id,
    name: id.toUpperCase(),
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
  };
}

function group(players: Player[], totalRounds: number): TournamentGroup {
  return {
    id: 'group-1',
    name: '淘汰赛',
    players,
    matches: [],
    currentRound: 1,
    totalRounds,
    status: 'completed',
    pairingType: 'single_elimination',
    gameType: 'bo1',
    roundsLocked: true,
    createdAt: new Date().toISOString(),
  };
}

function play(matches: Match[], matchId: string, winner: 'player1' | 'player2'): Match[] {
  return matches.map(match =>
    match.id === matchId
      ? {
        ...match,
        result: winner,
        player1Games: winner === 'player1' ? 1 : 0,
        player2Games: winner === 'player2' ? 1 : 0,
      }
      : match
  );
}

function winnersByRound(matches: Match[]): Map<number, Set<string>> {
  const winners = new Map<number, Set<string>>();
  for (const match of matches) {
    const set = winners.get(match.round) ?? new Set<string>();
    if (match.result === 'player1') set.add(match.player1Id);
    if (match.result === 'player2') set.add(match.player2Id);
    winners.set(match.round, set);
  }
  return winners;
}

describe('repairCompetitionEliminationMatches', () => {
  it('dedupes repeated bracket nodes and rebuilds later rounds from the winners', () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const base = { ...group(players, 3), eliminationBracket: bracket };

    let firstRound = createEliminationFirstRoundMatches(base, bracket);
    firstRound = firstRound.map(match => play([match], match.id, 'player1')[0]!);
    const secondRound = createEliminationNextRoundMatches({ ...base, matches: firstRound }, 2);
    const playedSecond = secondRound.map(match => play([match], match.id, 'player1')[0]!);
    const thirdRound = createEliminationNextRoundMatches(
      { ...base, matches: [...firstRound, ...playedSecond] },
      3
    );
    // 旧数据里 r3 的配对已经错乱（用重复节点的胜者拼出来的），这里模拟成与上一轮胜者无关。
    const playedThird = thirdRound.map(match => ({
      ...match,
      player1Id: players[1]!.id,
      player2Id: players[2]!.id,
      result: 'player2' as const,
      player1Games: 0,
      player2Games: 1,
    }));

    // 损坏数据：r2、r3 的签表节点重复；还有超出轮数的 r4。
    const duplicatedSecond = playedSecond.map(match => ({
      ...match,
      id: `${match.id}-dup`,
      result: 'player2' as const,
      player1Games: 0,
      player2Games: 1,
    }));
    const duplicatedThird = playedThird.map(match => ({
      ...match,
      id: `${match.id}-dup`,
    }));
    const outOfRange = [
      {
        id: 'r4-m0-fake',
        round: 4,
        player1Id: players[0]!.id,
        player2Id: players[3]!.id,
        result: 'player1' as const,
        bracketNodeId: 'r4-m0',
      },
    ];
    const corrupt = {
      ...base,
      matches: [...firstRound, ...playedSecond, ...duplicatedSecond, ...playedThird, ...duplicatedThird, ...outOfRange],
    };

    const repaired = repairCompetitionEliminationMatches({
      id: 'competition-1',
      name: 'repaired',
      createdAt: new Date().toISOString(),
      groups: [corrupt],
    } as never);

    const repairedGroup = repaired.competition.groups[0]!;
    expect(repaired.report.groups).toBe(1);
    expect(repaired.report.deduped).toBeGreaterThanOrEqual(2);
    expect(repaired.report.trimmed).toBeGreaterThanOrEqual(1);
    expect(repairedGroup.matches.map(match => match.round)).toEqual([1, 1, 1, 1, 2, 2, 3]);
    expect(repairedGroup.currentRound).toBe(3);
    expect(repairedGroup.status).toBe('in_progress');

    const winners = winnersByRound(repairedGroup.matches);
    for (const match of repairedGroup.matches) {
      if (match.round < 2) continue;
      const previous = winners.get(match.round - 1) ?? new Set<string>();
      for (const playerId of [match.player1Id, match.player2Id]) {
        if (playerId === 'bye') continue;
        expect(previous.has(playerId), `r${match.round}: ${playerId} 不是上一轮胜者`).toBe(true);
      }
    }

    // r3 原结果与重建后的配对不一致，应清空为待进行，交给裁判重录。
    const third = repairedGroup.matches.find(match => match.round === 3)!;
    expect(third.result).toBe('pending');

    for (const item of repairedGroup.players) {
      expect(item.totalGames).toBeGreaterThanOrEqual(0);
      expect(item.wonGames).toBeGreaterThanOrEqual(0);
      expect(item.wonGames).toBeLessThanOrEqual(item.totalGames);
      expect(item.wins).toBeGreaterThanOrEqual(0);
      expect(item.losses).toBeGreaterThanOrEqual(0);
    }
  });

  it('drops rounds beyond a single-round breakout and keeps the bracket importable', () => {
    const players = Array.from({ length: 16 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const base = { ...group(players, 1), eliminationBracket: bracket };
    let firstRound = createEliminationFirstRoundMatches(base, bracket);
    firstRound = firstRound.map(match => play([match], match.id, 'player1')[0]!);
    const extraRound = createEliminationNextRoundMatches({ ...base, matches: firstRound }, 2);

    const repaired = repairCompetitionEliminationMatches({
      id: 'competition-2',
      name: 'breakout',
      createdAt: new Date().toISOString(),
      groups: [{ ...base, matches: [...firstRound, ...extraRound] }],
    } as never);

    const repairedGroup = repaired.competition.groups[0]!;
    expect(repaired.report.trimmed).toBe(extraRound.length);
    expect(repairedGroup.matches).toHaveLength(firstRound.length);
    expect(repairedGroup.matches.every(match => match.round <= repairedGroup.totalRounds)).toBe(true);
    expect(repairedGroup.currentRound).toBe(1);
  });

  it('leaves healthy brackets untouched', () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const base = { ...group(players, 3), eliminationBracket: bracket };
    const firstRound = createEliminationFirstRoundMatches(base, bracket);
    const healthy = { ...base, matches: firstRound };

    const repaired = repairCompetitionEliminationMatches({
      id: 'competition-3',
      name: 'healthy',
      createdAt: new Date().toISOString(),
      groups: [healthy],
    } as never);

    expect(repaired.report).toEqual({ removed: 0, deduped: 0, trimmed: 0, groups: 0 });
    expect(repaired.competition.groups[0]).toBe(healthy);
  });
});

describe('reconcileCompetitionRounds', () => {
  it('moves currentRound up to the highest round that already has matches', () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const base = { ...group(players, 3), currentRound: 1, eliminationBracket: bracket };
    let firstRound = createEliminationFirstRoundMatches(base, bracket);
    firstRound = firstRound.map(match => play([match], match.id, 'player1')[0]!);
    const secondRound = createEliminationNextRoundMatches({ ...base, matches: firstRound }, 2);
    const stale = { ...base, matches: [...firstRound, ...secondRound] };

    const competition = {
      id: 'competition-4',
      name: 'stale',
      createdAt: new Date().toISOString(),
      groups: [stale, { ...stale, id: 'group-2' }],
    } as never;
    const reconciled = reconcileCompetitionRounds(competition);

    expect(reconciled).not.toBe(competition);
    expect(reconciled.groups[0]?.currentRound).toBe(2);
    expect(reconciled.groups[1]?.currentRound).toBe(2);
  });

  it('returns the same competition when every round counter is already right', () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const base = { ...group(players, 3), currentRound: 1, eliminationBracket: bracket };
    const firstRound = createEliminationFirstRoundMatches(base, bracket);
    const competition = {
      id: 'competition-5',
      name: 'healthy-rounds',
      createdAt: new Date().toISOString(),
      groups: [{ ...base, matches: firstRound }],
    } as never;

    expect(reconcileCompetitionRounds(competition)).toBe(competition);
  });
});
