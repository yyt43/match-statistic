import { describe, expect, it } from 'vitest';
import type { Match, Player, TournamentGroup } from '../types';
import {
  assignEliminationBracketSlot,
  buildEliminationBracketExportRows,
  createOrderedEliminationBracket,
  createRandomEliminationBracket,
  createEliminationFirstRoundMatches,
  createEliminationNextRoundMatches,
  hasPlayedDownstreamBracketMatches,
  getEliminationBracketView,
  rebuildEliminationMatchesAfterResult,
  setEliminationBracketSlotToBye,
  swapEliminationBracketSlots,
  validateEliminationBracket,
} from './elimination';

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

function group(players: Player[]): TournamentGroup {
  return {
    id: 'group-1',
    name: 'A',
    players,
    matches: [],
    currentRound: 0,
    totalRounds: Math.max(1, Math.ceil(Math.log2(players.length))),
    status: 'setup',
    pairingType: 'single_elimination',
    gameType: 'bo1',
    createdAt: new Date().toISOString(),
  };
}

function play(matches: Match[], matchId: string, winner: 'player1' | 'player2'): Match[] {
  return matches.map(match =>
    match.id === matchId
      ? { ...match, result: winner, player1Games: winner === 'player1' ? 1 : 0, player2Games: winner === 'player2' ? 1 : 0 }
      : match
  );
}

describe('fixed elimination bracket', () => {
  it('uses roster order for the default 8-player layout and adjacent winners', () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);

    expect(bracket.source).toBe('roster_order');
    expect(bracket.size).toBe(8);
    expect(bracket.slots).toEqual(players.map(item => item.id));
    expect(validateEliminationBracket(bracket, players)).toBeNull();

    const initialGroup = group(players);
    const firstRound = bracket.slots.reduce<Match[]>((matches, _, index) => {
      if (index % 2 !== 0) return matches;
      matches.push({
        id: `r1-m${index / 2}`,
        round: 1,
        player1Id: bracket.slots[index]!,
        player2Id: bracket.slots[index + 1]!,
        result: 'pending',
        bracketNodeId: `r1-m${index / 2}`,
      });
      return matches;
    }, []);
    let matches = play(firstRound, 'r1-m0', 'player1');
    matches = play(matches, 'r1-m1', 'player2');
    const secondRound = createEliminationNextRoundMatches({
      ...initialGroup,
      eliminationBracket: bracket,
      matches,
    }, 2);

    const view = getEliminationBracketView({
      ...initialGroup,
      eliminationBracket: bracket,
      matches: [...matches, ...secondRound],
    });
    expect(view.rounds[1]?.nodes[0].player1Id).toBe('p1');
    expect(view.rounds[1]?.nodes[0].player2Id).toBe('p4');
  });

  it('turns a duplicated winner into a bye instead of a self match', () => {
    const players = Array.from({ length: 4 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const initialGroup = group(players);
    const matches: Match[] = [
      {
        id: 'r1-m0',
        round: 1,
        player1Id: 'p1',
        player2Id: 'p2',
        result: 'player1',
        bracketNodeId: 'r1-m0',
      },
      {
        id: 'r1-m1',
        round: 1,
        player1Id: 'p1',
        player2Id: 'p3',
        result: 'player1',
        bracketNodeId: 'r1-m1',
      },
    ];

    const secondRound = createEliminationNextRoundMatches({
      ...initialGroup,
      eliminationBracket: bracket,
      matches,
    }, 2);

    expect(secondRound).toHaveLength(1);
    expect(secondRound[0].isBye).toBe(true);
    expect(secondRound[0].player2Id).toBe('bye');
    expect(secondRound[0].player1Id).not.toBe(secondRound[0].player2Id);
  });

  it('deduplicates the same participant when building a bracket', () => {
    const first = { ...player('p1'), participantCode: 'A01', name: '张三' };
    const duplicate = { ...player('p1-copy'), participantCode: 'A01', name: '张三' };
    const others = [player('p2'), player('p3'), player('p4')];

    const bracket = createOrderedEliminationBracket([first, duplicate, ...others]);
    const ids = bracket.slots.filter((id): id is string => Boolean(id));

    expect(bracket.size).toBe(4);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('p1-copy');
  });

  it('keeps same-name players without QQ when their identities differ', () => {
    // P1-1：昵称+QQ 不再是身份键。两名同名、无 QQ、编号不同的选手是真实的两名参赛者，
    // 不能被静默去重，否则签表人数会少于名单人数导致校验失败。
    const first = { ...player('p1'), participantCode: 'A01', name: '张三', profile: {} };
    const second = { ...player('p2'), participantCode: 'A02', name: '张三', profile: {} };
    const bracket = createOrderedEliminationBracket([first, second, player('p3'), player('p4')]);
    const ids = bracket.slots.filter((id): id is string => Boolean(id));

    expect(bracket.size).toBe(4);
    expect(ids).toHaveLength(4);
    expect(ids).toEqual(expect.arrayContaining(['p1', 'p2']));
  });

  it('keeps the bracket view free of self pairings with duplicate slots', () => {
    const players = [player('p1'), player('p2')];
    const bracket = {
      id: 'b',
      size: 4,
      slots: ['p1', 'p1', 'p2', null],
      source: 'custom' as const,
    };
    const initialGroup = group(players);
    const matches = createEliminationFirstRoundMatches(initialGroup, bracket);

    expect(matches).toHaveLength(2);
    expect(matches.some(match => match.player1Id === match.player2Id)).toBe(false);
    expect(matches[0].isBye).toBe(true);

    const view = getEliminationBracketView({ ...initialGroup, eliminationBracket: bracket, matches });
    const firstNode = view.rounds[0].nodes[0];
    expect(firstNode.player1Id).toBe('p1');
    expect(firstNode.player2Id).toBeNull();
  });

  it('assigns byes to the earliest roster positions without bye-vs-bye', () => {
    const players = Array.from({ length: 6 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);

    expect(bracket.size).toBe(8);
    expect(bracket.slots).toEqual(['p1', null, 'p2', null, 'p3', 'p4', 'p5', 'p6']);
    expect(validateEliminationBracket(bracket, players)).toBeNull();
    for (let index = 0; index < bracket.slots.length; index += 2) {
      expect(bracket.slots[index] === null && bracket.slots[index + 1] === null).toBe(false);
    }
  });

  it('supports random redraw, explicit assignment, and bye clearing', () => {
    const players = Array.from({ length: 5 }, (_, index) => player(`p${index + 1}`));
    const original = createOrderedEliminationBracket(players);
    const randomized = createRandomEliminationBracket(players);

    expect(new Set(randomized.slots.filter(Boolean))).toEqual(new Set(players.map(item => item.id)));
    expect(validateEliminationBracket(randomized, players)).toBeNull();

    const swapped = swapEliminationBracketSlots(original, 0, 2);
    expect(swapped.slots[0]).toBe(original.slots[2]);
    expect(swapped.slots[2]).toBe(original.slots[0]);

    const assigned = assignEliminationBracketSlot(original, 4, 'p1');
    expect(assigned.slots[4]).toBe('p1');
    expect(assigned.slots[0]).toBe(original.slots[4]);
    expect(validateEliminationBracket(assigned, players)).toBeNull();

    const withBye = setEliminationBracketSlotToBye(original, 0);
    expect(withBye.slots[0]).toBeNull();
  });

  it('fills downstream winners from fixed nodes and rebuilds only unplayed future rounds', () => {
    const players = Array.from({ length: 4 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const baseGroup = { ...group(players), eliminationBracket: bracket };
    const firstRound: Match[] = [
      {
        id: 'r1-m0',
        round: 1,
        player1Id: 'p1',
        player2Id: 'p2',
        result: 'player1',
        player1Games: 1,
        player2Games: 0,
        bracketNodeId: 'r1-m0',
      },
      {
        id: 'r1-m1',
        round: 1,
        player1Id: 'p3',
        player2Id: 'p4',
        result: 'player2',
        player1Games: 0,
        player2Games: 1,
        bracketNodeId: 'r1-m1',
      },
    ];
    const rebuilt = rebuildEliminationMatchesAfterResult(
      { ...baseGroup, matches: firstRound },
      1
    );

    expect(rebuilt.find(match => match.bracketNodeId === 'r2-m0')).toMatchObject({
      player1Id: 'p1',
      player2Id: 'p4',
      result: 'pending',
    });

    const secondRoundMatch = rebuilt.find(match => match.bracketNodeId === 'r2-m0')!;
    const playedSecondRound = play(rebuilt, secondRoundMatch.id, 'player1');
    const protectedRebuild = rebuildEliminationMatchesAfterResult(
      { ...baseGroup, matches: playedSecondRound },
      2
    );
    expect(protectedRebuild.find(match => match.bracketNodeId === 'r2-m0')?.result).toBe('player1');
  });

  it('creates round-based export rows with names, identifiers, scores, and statuses', () => {
    const players = [
      { ...player('p1'), participantCode: 'A01', profile: { uid: '1001' } },
      { ...player('p2'), participantCode: 'A02', profile: { uid: '1002' } },
    ];
    const bracket = createOrderedEliminationBracket(players);
    const rows = buildEliminationBracketExportRows(
      {
        ...group(players),
        eliminationBracket: bracket,
        matches: [{
          id: 'r1-m0',
          round: 1,
          player1Id: 'p1',
          player2Id: 'p2',
          result: 'player1',
          player1Games: 1,
          player2Games: 0,
          bracketNodeId: 'r1-m0',
        }],
      },
      'zh'
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      round: 1,
      matchIndex: 0,
      player1Name: 'A01 · P1',
      player1Code: 'A01',
      player1Uid: '1001',
      player2Name: 'A02 · P2',
      score: '1-0',
      winnerName: 'A01 · P1',
      status: '已完成',
    });
  });

  it('includes future bracket rounds and bye states in export rows', () => {
    const players = Array.from({ length: 3 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const firstRound = createEliminationFirstRoundMatches(
      { ...group(players), eliminationBracket: bracket },
      bracket
    );
    const rows = buildEliminationBracketExportRows(
      {
        ...group(players),
        eliminationBracket: bracket,
        matches: firstRound,
      },
      'en'
    );

    expect(rows.some(row => row.status === 'Bye' && row.winnerName === 'P1')).toBe(true);
    expect(rows.some(row => row.round === 2 && row.status === 'Not generated')).toBe(true);
  });

  it('uses the first round game type for bye scores', () => {
    const players = Array.from({ length: 3 }, (_, index) => player(`p${index + 1}`));
    const bracket = createOrderedEliminationBracket(players);
    const firstRound = createEliminationFirstRoundMatches(
      {
        ...group(players),
        gameType: 'bo1',
        roundGameTypes: ['bo3', 'bo3'],
        eliminationBracket: bracket,
      },
      bracket
    );
    const bye = firstRound.find(match => match.isBye);

    expect(bye).toMatchObject({
      player1Games: 2,
      player2Games: 0,
      result: 'player1',
    });
  });

  it('keeps locked brackets immutable and exposes played downstream rounds', () => {
    const players = Array.from({ length: 4 }, (_, index) => player(`p${index + 1}`));
    const bracket = {
      ...createOrderedEliminationBracket(players),
      lockedAt: '2026-10-10T00:00:00.000Z',
    };
    const firstRound = createEliminationFirstRoundMatches(
      { ...group(players), eliminationBracket: bracket },
      bracket
    ).map(match =>
      match.bracketNodeId === 'r1-m0'
        ? { ...match, result: 'player1' as const, player1Games: 1, player2Games: 0 }
        : { ...match, result: 'player2' as const, player1Games: 0, player2Games: 1 }
    );
    const secondRound = createEliminationNextRoundMatches(
      { ...group(players), eliminationBracket: bracket, matches: firstRound },
      2
    ).map(match => ({ ...match, result: 'player1' as const, player1Games: 1, player2Games: 0 }));
    const played = {
      ...group(players),
      eliminationBracket: bracket,
      matches: [...firstRound, ...secondRound],
    };

    expect(bracket.lockedAt).toBeTruthy();
    expect(hasPlayedDownstreamBracketMatches(played, 1)).toBe(true);
    expect(hasPlayedDownstreamBracketMatches(played, 2)).toBe(false);
    expect(getEliminationBracketView(played).championId).toBe('p1');
  });

  it('does not mutate a locked bracket through slot editing helpers', () => {
    const players = Array.from({ length: 4 }, (_, index) => player(`p${index + 1}`));
    const locked = {
      ...createOrderedEliminationBracket(players),
      lockedAt: '2026-10-10T00:00:00.000Z',
    };
    const swapped = swapEliminationBracketSlots(locked, 0, 2);

    // The helper reports the requested permutation; UI/store layers must block
    // calling it once lockedAt is present.
    expect(swapped.source).toBe('custom');
    expect(locked.lockedAt).toBeTruthy();
    expect(locked.slots).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
