import { beforeEach, describe, expect, it } from 'vitest';
import { createNewCompetition } from '../tournamentFactory';
import { useTournamentStore } from '../useTournamentStore';
import { getDefaultPlayerFields } from '../../utils/playerProfiles';

describe('player profile store actions', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      competition: createNewCompetition('Empty', 1, 2, 3, 'bo3'),
      historyPast: [],
      historyFuture: [],
      isReadOnly: false,
    });
  });

  it('distributes imported profiles across existing groups and generates codes', () => {
    const competition = createNewCompetition('Profiles', 2, 2, 3, 'bo3');
    useTournamentStore.setState({ competition });
    const store = useTournamentStore.getState();
    store.setPlayerSchema('poetryCupS2');
    store.importPlayerProfiles([
      { name: 'A', participantCode: 'A01', profile: { uid: '180748058', qq: '2957815893' } },
      { name: 'B', participantCode: 'A02', profile: { uid: '338916899', qq: '1615852778' } },
      { name: 'C', participantCode: 'B01', profile: { uid: '346732256', qq: '2133152813' } },
      { name: 'D', participantCode: 'B02', profile: { uid: '283093920', qq: '639177928' } },
    ], true);

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups[0].players.map(player => player.name)).toEqual(['A', 'B']);
    expect(updated.groups[1].players.map(player => player.name)).toEqual(['C', 'D']);
    expect(updated.groups[0].players[0].participantCode).toBe('A01');
    expect(updated.groups[1].players[1].participantCode).toBe('B02');
  });

  it('assigns coded players to groups matching their code prefix', () => {
    const competition = createNewCompetition('Profiles', 2, 2, 3, 'bo3');
    competition.playerSchemaId = 'poetryCupS2';
    competition.playerFields = getDefaultPlayerFields('poetryCupS2');
    useTournamentStore.setState({ competition });
    useTournamentStore.getState().importPlayerProfiles([
      { name: 'B1', participantCode: 'B01', profile: { uid: '111111111', qq: '111111' } },
      { name: 'A1', participantCode: 'A01', profile: { uid: '222222222', qq: '222222' } },
      { name: 'B2', participantCode: 'B02', profile: { uid: '333333333', qq: '333333' } },
      { name: 'A2', participantCode: 'A02', profile: { uid: '444444444', qq: '444444' } },
    ], true);

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups[0].players.map(player => player.name)).toEqual(['A1', 'A2']);
    expect(updated.groups[1].players.map(player => player.name)).toEqual(['B1', 'B2']);
  });

  it('assigns workbook rows to groups matching their sheet names', () => {
    const competition = createNewCompetition('Profiles', 2, 2, 3, 'bo3');
    competition.groups[0].name = '甲组';
    competition.groups[1].name = '乙组';
    useTournamentStore.setState({ competition });
    useTournamentStore.getState().importPlayerProfiles([
      { name: '甲一', groupName: '甲组' },
      { name: '乙一', groupName: '乙组' },
      { name: '甲二', groupName: '甲组' },
      { name: '乙二', groupName: '乙组' },
    ], true);

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups[0].players.map(player => player.name)).toEqual(['甲一', '甲二']);
    expect(updated.groups[1].players.map(player => player.name)).toEqual(['乙一', '乙二']);
  });

  it('locks a valid roster and rejects later UID changes', () => {
    const competition = createNewCompetition('Profiles', 1, 2, 3, 'bo3');
    competition.playerSchemaId = 'poetryCupS2';
    competition.playerFields = getDefaultPlayerFields('poetryCupS2');
    useTournamentStore.setState({ competition });
    const store = useTournamentStore.getState();
    store.importPlayerProfiles([
      { name: 'A', participantCode: 'A01', profile: { uid: '180748058', qq: '2957815893' } },
      { name: 'B', participantCode: 'A02', profile: { uid: '338916899', qq: '1615852778' } },
    ], false);

    const lockResult = useTournamentStore.getState().lockRoster();
    expect(lockResult.valid).toBe(true);
    const playerId = useTournamentStore.getState().competition.groups[0].players[0].id;
    const changed = useTournamentStore.getState().updatePlayerProfile(playerId, {
      uid: '999999999',
    });
    expect(changed).toBe(false);
    expect(useTournamentStore.getState().competition.groups[0].players[0].profile?.uid)
      .toBe('180748058');
  });
});
