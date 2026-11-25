import { beforeEach, describe, expect, it } from 'vitest';
import { createNewCompetition } from './tournamentFactory';
import { isFinalRoundScored } from './competitionState';
import { useTournamentStore } from './useTournamentStore';
import { COMPETITION_FINISHED_LOCK } from '../utils/advancement';

function startSingleRoundCompetition() {
  const competition = createNewCompetition('Finish', 1, 4, 1, 'bo1');
  competition.groups[0].players.forEach((player, index) => {
    player.participantCode = `A${String(index + 1).padStart(2, '0')}`;
  });
  useTournamentStore.setState({
    competition,
    viewRound: 0,
    historyPast: [],
    historyFuture: [],
    isReadOnly: false,
    actionError: null,
  });
  useTournamentStore.getState().startTournament(1);
  return useTournamentStore.getState().competition.groups[0];
}

function scoreEveryMatchOf(groupIndex = 0) {
  const group = useTournamentStore.getState().competition.groups[groupIndex];
  for (const match of group.matches.filter(item => item.round === group.currentRound)) {
    useTournamentStore.getState().updateMatchResult(match.id, 'player1', 1, 0);
  }
}

describe('confirming the tournament finish', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      competition: createNewCompetition('Empty', 1, 2, 1, 'bo1'),
      viewRound: 0,
      historyPast: [],
      historyFuture: [],
      isReadOnly: false,
      actionError: null,
    });
  });

  it('keeps the group in progress after the final round is fully recorded', () => {
    const started = startSingleRoundCompetition();
    expect(isFinalRoundScored(started)).toBe(false);

    scoreEveryMatchOf();

    const group = useTournamentStore.getState().competition.groups[0];
    expect(group.status).toBe('in_progress');
    expect(isFinalRoundScored(group)).toBe(true);
    // 最后一轮仍可修正。
    const match = group.matches[0];
    useTournamentStore.getState().updateMatchResult(match.id, 'player2', 0, 1);
    expect(
      useTournamentStore.getState().competition.groups[0].matches
        .find(item => item.id === match.id)?.result
    ).toBe('player2');
  });

  it('locks results after an explicit confirmation', () => {
    startSingleRoundCompetition();
    scoreEveryMatchOf();

    useTournamentStore.getState().confirmGroupFinish();
    expect(useTournamentStore.getState().competition.groups[0].status).toBe('completed');

    const match = useTournamentStore.getState().competition.groups[0].matches[0];
    useTournamentStore.getState().updateMatchResult(match.id, 'player2', 0, 1);

    const after = useTournamentStore.getState();
    expect(after.competition.groups[0].matches.find(item => item.id === match.id)?.result)
      .not.toBe('player2');
    expect(after.actionError).toEqual(COMPETITION_FINISHED_LOCK);
  });

  it('refuses to confirm before the final round is fully recorded', () => {
    startSingleRoundCompetition();
    useTournamentStore.getState().confirmGroupFinish();

    const after = useTournamentStore.getState();
    expect(after.competition.groups[0].status).toBe('in_progress');
    expect(after.actionError?.zh).toContain('最后一轮');
  });

  it('allows edits again after reverting the finish', () => {
    startSingleRoundCompetition();
    scoreEveryMatchOf();
    useTournamentStore.getState().confirmGroupFinish();

    useTournamentStore.getState().undoGroupFinish();

    const after = useTournamentStore.getState();
    const group = after.competition.groups[0];
    expect(group.status).toBe('in_progress');
    expect(after.viewRound).toBe(group.currentRound);
    const match = group.matches[0];
    useTournamentStore.getState().updateMatchResult(match.id, 'player2', 0, 1);
    expect(
      useTournamentStore.getState().competition.groups[0].matches
        .find(item => item.id === match.id)?.result
    ).toBe('player2');
  });

  it('blocks result import for a confirmed group', () => {
    startSingleRoundCompetition();
    scoreEveryMatchOf();
    useTournamentStore.getState().confirmGroupFinish();

    const match = useTournamentStore.getState().competition.groups[0].matches[0];
    useTournamentStore.getState().applyImportedMatchResults([{
      matchId: match.id,
      groupIndex: 0,
      result: 'player2',
      player1Games: 0,
      player2Games: 1,
      evidenceVerificationStatus: 'not_required',
    }]);

    const after = useTournamentStore.getState();
    expect(after.competition.groups[0].matches.find(item => item.id === match.id)?.result)
      .not.toBe('player2');
    expect(after.actionError).toEqual(COMPETITION_FINISHED_LOCK);
  });
});
