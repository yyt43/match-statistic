import { beforeEach, describe, expect, it } from 'vitest';
import { useTournamentStore } from './useTournamentStore';

describe('simultaneous group start', () => {
  beforeEach(() => {
    useTournamentStore.getState().initCompetition('多组赛事', 3, 4, 3, 'bo1', 'swiss');
  });

  it('starts every group together when a single-group start is requested', () => {
    useTournamentStore.getState().startTournament(3);

    const groups = useTournamentStore.getState().competition.groups;
    expect(groups).toHaveLength(3);
    expect(groups.every(group => group.status === 'in_progress')).toBe(true);
    expect(groups.every(group => group.currentRound === 1)).toBe(true);
  });

  it('does not partially start groups when one group has fewer than two players', () => {
    const state = useTournamentStore.getState();
    const competition = state.competition;
    useTournamentStore.setState({
      competition: {
        ...competition,
        groups: competition.groups.map((group, index) =>
          index === 1 ? { ...group, players: group.players.slice(0, 1) } : group
        ),
      },
    });

    useTournamentStore.getState().startAllGroups();

    const groups = useTournamentStore.getState().competition.groups;
    expect(groups.every(group => group.status === 'setup')).toBe(true);
    expect(groups.every(group => group.currentRound === 0)).toBe(true);
  });
});
