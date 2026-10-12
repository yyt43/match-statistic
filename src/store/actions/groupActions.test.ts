import { beforeEach, describe, expect, it } from 'vitest';
import { createNewCompetition } from '../tournamentFactory';
import { useTournamentStore } from '../useTournamentStore';
import { createOrderedEliminationBracket } from '../../utils/elimination';

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

  it('discards an unconfirmed elimination bracket when setup changes', () => {
    const competition = createNewCompetition('Config', 1, 4, 2, 'bo1', 'single_elimination');
    const group = competition.groups[0];
    group.eliminationBracket = createOrderedEliminationBracket(group.players);
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().applyGroupConfiguration({
      playerCount: 6,
      rounds: 3,
      gameType: 'bo1',
      pairingType: 'single_elimination',
      roundGameTypes: ['bo1', 'bo1', 'bo1'],
    }, 'current');

    expect(useTournamentStore.getState().competition.groups[0].eliminationBracket).toBeUndefined();

    useTournamentStore.getState().prepareEliminationBracket(0);
    const updatedGroup = useTournamentStore.getState().competition.groups[0];
    expect(updatedGroup.eliminationBracket?.slots)
      .toEqual([
        updatedGroup.players[0].id,
        null,
        updatedGroup.players[1].id,
        null,
        updatedGroup.players[2].id,
        updatedGroup.players[3].id,
        updatedGroup.players[4].id,
        updatedGroup.players[5].id,
      ]);
  });

  it('discards an unconfirmed elimination bracket when switching back to swiss', () => {
    const competition = createNewCompetition('Config', 1, 4, 2, 'bo1', 'single_elimination');
    const group = competition.groups[0];
    group.eliminationBracket = createOrderedEliminationBracket(group.players);
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().applyGroupConfiguration({
      playerCount: 4,
      rounds: 3,
      gameType: 'bo1',
      pairingType: 'swiss',
      roundGameTypes: ['bo1', 'bo1', 'bo1'],
    }, 'current');

    expect(useTournamentStore.getState().competition.groups[0].eliminationBracket).toBeUndefined();
    expect(useTournamentStore.getState().competition.groups[0].pairingType).toBe('swiss');
  });

  it('numbers placeholder players when a new group is added', () => {
    const competition = createNewCompetition('Groups', 1, 2, 3, 'bo1');
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().addGroup();

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups).toHaveLength(2);
    expect(updated.groups[1].players.slice(0, 2).map(player => player.participantCode)).toEqual([
      'B01',
      'B02',
    ]);
  });

  it('numbers placeholder players when the group count grows', () => {
    const competition = createNewCompetition('Groups', 1, 2, 3, 'bo1');
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().setGroupCount(3);

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups.map(group => group.players[0].participantCode)).toEqual([
      'A01',
      'B01',
      'C01',
    ]);
  });

  it('skips numbers already used by another group with the same prefix', () => {
    const competition = createNewCompetition('Groups', 2, 2, 3, 'bo1');
    competition.groups[0].name = '小组03';
    competition.groups[0].players.forEach((player, index) => {
      player.participantCode = `C0${index + 1}`;
    });
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().addGroup();

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups[2].name).toBe('小组03');
    expect(updated.groups[2].players.slice(0, 3).map(player => player.participantCode)).toEqual([
      'C03',
      'C04',
      'C05',
    ]);
  });
});
