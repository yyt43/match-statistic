import { beforeEach, describe, expect, it } from 'vitest';
import type { TournamentCompetition } from '../types';
import { createOrderedEliminationBracket } from '../utils/elimination';
import { PairingBlockedError } from '../utils/swissPairing';
import { generateNextRoundForCompetition } from './roundActions';
import { createNewCompetition } from './tournamentFactory';
import { useTournamentStore } from './useTournamentStore';

/** 单败组：已有签表时按签表生成。 */
function singleEliminationCompetition(): TournamentCompetition {
  const competition = createNewCompetition('单败', 1, 4, 2, 'bo1');
  const group = competition.groups[0];
  group.pairingType = 'single_elimination';
  group.status = 'in_progress';
  group.currentRound = 0;
  group.eliminationBracket = {
    ...createOrderedEliminationBracket(group.players),
    lockedAt: new Date().toISOString(),
  };
  return competition;
}

/** 瑞士轮组：残留了一个过期的单败签表引用（老数据）。 */
function swissWithResidualBracket(): TournamentCompetition {
  const competition = createNewCompetition('残留签表', 1, 4, 3, 'bo1');
  const group = competition.groups[0];
  group.status = 'in_progress';
  group.currentRound = 1;
  group.matches = [
    { id: 'm1', round: 1, player1Id: group.players[0].id, player2Id: group.players[1].id, result: 'player1' },
    { id: 'm2', round: 1, player1Id: group.players[2].id, player2Id: group.players[3].id, result: 'player1' },
  ];
  group.eliminationBracket = {
    id: 'stale-bracket',
    size: 2,
    slots: [group.players[0].id, group.players[1].id],
    source: 'custom',
  };
  return competition;
}

/** 4 人打满 3 轮后已无任何合法对阵。 */
function exhaustedSwissCompetition(): TournamentCompetition {
  const competition = createNewCompetition('无解', 1, 4, 5, 'bo1');
  const group = competition.groups[0];
  const [p1, p2, p3, p4] = group.players;
  group.status = 'in_progress';
  group.currentRound = 3;
  group.matches = [
    { id: 'r1a', round: 1, player1Id: p1.id, player2Id: p2.id, result: 'player1' },
    { id: 'r1b', round: 1, player1Id: p3.id, player2Id: p4.id, result: 'player1' },
    { id: 'r2a', round: 2, player1Id: p1.id, player2Id: p3.id, result: 'player1' },
    { id: 'r2b', round: 2, player1Id: p2.id, player2Id: p4.id, result: 'player1' },
    { id: 'r3a', round: 3, player1Id: p1.id, player2Id: p4.id, result: 'player1' },
    { id: 'r3b', round: 3, player1Id: p2.id, player2Id: p3.id, result: 'player1' },
  ];
  const opponents = new Map([
    [p1.id, [p2.id, p3.id, p4.id]],
    [p2.id, [p1.id, p4.id, p3.id]],
    [p3.id, [p4.id, p1.id, p2.id]],
    [p4.id, [p3.id, p2.id, p1.id]],
  ]);
  for (const player of group.players) {
    player.playedAgainst = [...(opponents.get(player.id) ?? [])];
  }
  return competition;
}

describe('generateNextRoundForCompetition', () => {
  it('still uses the locked bracket for single-elimination groups', () => {
    const updated = generateNextRoundForCompetition(singleEliminationCompetition(), 0);
    const group = updated.groups[0];
    expect(group.currentRound).toBe(1);
    expect(group.matches).toHaveLength(2);
    expect(group.matches.every(match => Boolean(match.bracketNodeId))).toBe(true);
  });

  it('ignores a residual bracket on swiss groups and generates normal pairings', () => {
    const updated = generateNextRoundForCompetition(swissWithResidualBracket(), 0);
    const group = updated.groups[0];
    expect(group.currentRound).toBe(2);
    const round2 = group.matches.filter(match => match.round === 2);
    expect(round2).toHaveLength(2);
    expect(round2.every(match => !match.bracketNodeId)).toBe(true);
  });

  it('throws PairingBlockedError when swiss rounds exceed available pairings', () => {
    expect(() => generateNextRoundForCompetition(exhaustedSwissCompetition(), 0))
      .toThrow(PairingBlockedError);
  });
});

describe('配对失败提示（P1-2 调用方）', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      competition: createNewCompetition('Empty', 1, 2, 3, 'bo1'),
      viewRound: 0,
      historyPast: [],
      historyFuture: [],
      isReadOnly: false,
      actionError: null,
    });
  });

  it('surfaces a bilingual action error instead of throwing from generateNextRound', () => {
    const competition = exhaustedSwissCompetition();
    useTournamentStore.setState({ competition, viewRound: 3, actionError: null });

    useTournamentStore.getState().generateNextRound();

    const state = useTournamentStore.getState();
    expect(state.actionError).not.toBeNull();
    expect(state.actionError?.zh).toContain('无法完成配对');
    expect(state.actionError?.en.toLowerCase()).toContain('cannot generate this round');
    expect(state.competition.groups[0].currentRound).toBe(3);
  });
});
