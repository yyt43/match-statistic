import { beforeEach, describe, expect, it } from 'vitest';
import { createNewCompetition } from '../tournamentFactory';
import { useTournamentStore } from '../useTournamentStore';

describe('group configuration actions', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      competition: createNewCompetition('Empty', 2, 2, 3, 'bo1'),
      historyPast: [],
      historyFuture: [],
      isReadOnly: false,
    });
  });

  it('applies the shared draft only to the current group and preserves player profiles', () => {
    const competition = createNewCompetition('Config', 2, 2, 3, 'bo1');
    competition.groups[0].players[0].name = 'Player A';
    competition.groups[0].players[1].name = 'Player B';
    competition.groups[1].players[0].name = 'Player C';
    competition.groups[1].players[1].name = 'Player D';
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().applyGroupConfiguration({
      playerCount: 2,
      rounds: 5,
      gameType: 'bo3',
      pairingType: 'swiss',
      roundGameTypes: ['bo3', 'bo3', 'bo3', 'bo3', 'bo3'],
      tiebreakTemplate: 'standard_multi',
    }, 'current');

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups[0].players.map(player => player.name)).toEqual(['Player A', 'Player B']);
    expect(updated.groups[0].totalRounds).toBe(5);
    expect(updated.groups[0].gameType).toBe('bo3');
    expect(updated.groups[0].roundGameTypes).toEqual(['bo3', 'bo3', 'bo3', 'bo3', 'bo3']);
    expect(updated.groups[1].totalRounds).toBe(3);
    expect(updated.groups[1].gameType).toBe('bo1');
  });

  it('applies the shared draft to every setup group', () => {
    const competition = createNewCompetition('Config', 2, 2, 3, 'bo1');
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().applyGroupConfiguration({
      playerCount: 2,
      rounds: 4,
      gameType: 'bo5',
      pairingType: 'swiss',
      roundGameTypes: ['bo5', 'bo5', 'bo5', 'bo5'],
      tiebreakTemplate: 'standard_multi',
    }, 'all');

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups.every(group => group.totalRounds === 4)).toBe(true);
    expect(updated.groups.every(group => group.gameType === 'bo5')).toBe(true);
    expect(updated.groups.every(group => group.roundGameTypes?.every(type => type === 'bo5'))).toBe(true);
  });
});
