import { beforeEach, describe, expect, it } from 'vitest';
import type { TournamentCompetition, TournamentGroup } from '../types';
import { createNewCompetition } from './tournamentFactory';
import { useTournamentStore } from './useTournamentStore';

/**
 * 构造一个"上游赛段已确认晋级、下游赛段已开赛并有赛果"的赛事：
 * 上游小组成绩应被锁定（P1-5）。
 */
function lockedStageCompetition(): TournamentCompetition {
  const competition = createNewCompetition('锁测试', 1, 4, 3, 'bo1');
  competition.format = 'multi_stage';
  const upstream = competition.groups[0];
  upstream.stageId = 'stage-1';
  upstream.status = 'in_progress';
  upstream.currentRound = 1;
  upstream.players.forEach((player, index) => {
    player.participantCode = `A${String(index + 1).padStart(2, '0')}`;
  });
  upstream.matches = [
    {
      id: 'up-1',
      round: 1,
      player1Id: upstream.players[0].id,
      player2Id: upstream.players[1].id,
      result: 'pending',
    },
    {
      id: 'up-2',
      round: 1,
      player1Id: upstream.players[2].id,
      player2Id: upstream.players[3].id,
      result: 'pending',
    },
  ];

  const downstreamPlayers = createNewCompetition('downstream', 1, 2, 3, 'bo1').groups[0].players;
  const downstream: TournamentGroup = {
    id: 'group-downstream',
    name: '淘汰赛',
    currentRound: 1,
    totalRounds: 1,
    status: 'in_progress',
    players: downstreamPlayers,
    matches: [{
      id: 'down-1',
      round: 1,
      player1Id: downstreamPlayers[0].id,
      player2Id: downstreamPlayers[1].id,
      result: 'player1',
    }],
    createdAt: new Date().toISOString(),
    pairingType: 'single_elimination',
    gameType: 'bo3',
    stageId: 'stage-2',
  };

  competition.groups = [upstream, downstream];
  competition.stages = [
    { id: 'stage-1', name: '小组赛', order: 1, kind: 'swiss', groupIds: [upstream.id] },
    {
      id: 'stage-2',
      name: '淘汰赛',
      order: 2,
      kind: 'single_elimination',
      groupIds: [downstream.id],
      sourceStageIds: ['stage-1'],
    },
  ];
  competition.stageAdvancements = [{
    id: 'record-1',
    sourceStageId: 'stage-1',
    confirmedAt: new Date().toISOString(),
    seats: [],
    breakoutPairings: [],
  }];
  return competition;
}

function resetStore(competition: TournamentCompetition) {
  useTournamentStore.setState({
    competition,
    viewRound: 1,
    historyPast: [],
    historyFuture: [],
    isReadOnly: false,
    actionError: null,
  });
}

describe('结果锁守卫（P1-5）', () => {
  let competition: TournamentCompetition;

  beforeEach(() => {
    competition = lockedStageCompetition();
    resetStore(competition);
  });

  it('blocks editing a locked stage result and surfaces the reason', () => {
    useTournamentStore.getState().updateMatchResult('up-1', 'player1', 1, 0);

    const state = useTournamentStore.getState();
    expect(state.competition.groups[0].matches[0].result).toBe('pending');
    expect(state.actionError).not.toBeNull();
    expect(state.actionError?.zh).toContain('锁定');
    expect(state.actionError?.en.toLowerCase()).toContain('locked');
  });

  it('blocks undo / return-to-previous / return-to-setup on a locked stage', () => {
    useTournamentStore.getState().undoLastRound();
    expect(useTournamentStore.getState().actionError?.zh).toContain('锁定');
    expect(useTournamentStore.getState().competition.groups[0].currentRound).toBe(1);

    useTournamentStore.setState({ actionError: null });
    useTournamentStore.getState().returnToPreviousRound();
    expect(useTournamentStore.getState().actionError?.zh).toContain('锁定');
    expect(useTournamentStore.getState().competition.groups[0].currentRound).toBe(1);

    useTournamentStore.setState({ actionError: null });
    useTournamentStore.getState().returnToSetup();
    expect(useTournamentStore.getState().actionError?.zh).toContain('锁定');
    expect(useTournamentStore.getState().competition.groups[0].currentRound).toBe(1);
  });

  it('blocks imported results and referee overrides on a locked stage', () => {
    useTournamentStore.getState().applyImportedMatchResults([{
      matchId: 'up-1',
      groupIndex: 0,
      result: 'player1',
      player1Games: 1,
      player2Games: 0,
      evidenceVerificationStatus: 'not_required',
    }]);
    expect(useTournamentStore.getState().competition.groups[0].matches[0].result).toBe('pending');
    expect(useTournamentStore.getState().actionError?.zh).toContain('锁定');

    useTournamentStore.setState({ actionError: null });
    const applied = useTournamentStore
      .getState()
      .overrideMatchResult('up-1', 'player1', 1, 0, '裁判改判');
    expect(applied).toBe(false);
    expect(useTournamentStore.getState().competition.groups[0].matches[0].result).toBe('pending');
    expect(useTournamentStore.getState().actionError?.zh).toContain('锁定');
  });

  it('lets the user dismiss the action error', () => {
    useTournamentStore.getState().updateMatchResult('up-1', 'player1', 1, 0);
    expect(useTournamentStore.getState().actionError).not.toBeNull();
    useTournamentStore.getState().clearActionError();
    expect(useTournamentStore.getState().actionError).toBeNull();
  });

  it('keeps edits working when the stage has no downstream results', () => {
    // 从未确认晋级（无晋级记录）时不受结果锁影响。
    const unlocked = lockedStageCompetition();
    unlocked.stageAdvancements = [];
    resetStore(unlocked);

    useTournamentStore.getState().updateMatchResult('up-1', 'player1', 1, 0);
    expect(useTournamentStore.getState().competition.groups[0].matches[0].result).toBe('player1');
    expect(useTournamentStore.getState().actionError).toBeNull();
  });
});
