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

  it('does not clear existing groups when an empty roster import is submitted', () => {
    const competition = createNewCompetition('Profiles', 2, 2, 3, 'bo3');
    competition.groups[0].players = [
      { ...competition.groups[0].players[0], name: 'A' },
      { ...competition.groups[0].players[1], name: 'B' },
    ];
    competition.groups[1].players = [
      { ...competition.groups[1].players[0], name: 'C' },
      { ...competition.groups[1].players[1], name: 'D' },
    ];
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().importPlayerProfiles([]);

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups[0].players.map(player => player.name)).toEqual(['A', 'B']);
    expect(updated.groups[1].players.map(player => player.name)).toEqual(['C', 'D']);
  });

  it('fills only missing participant codes and preserves existing codes', () => {
    const competition = createNewCompetition('Profiles', 2, 3, 3, 'bo3');
    competition.groups[0].players[0].participantCode = 'A01';
    competition.groups[0].players[2].participantCode = 'A03';
    competition.groups[1].players[0].participantCode = 'B02';
    useTournamentStore.setState({ competition });

    const result = useTournamentStore.getState().generateMissingParticipantCodes();
    const updated = useTournamentStore.getState().competition;

    expect(result).toEqual({ assigned: 3, unresolved: 0 });
    expect(updated.groups[0].players.map(player => player.participantCode)).toEqual([
      'A01',
      'A02',
      'A03',
    ]);
    expect(updated.groups[1].players.map(player => player.participantCode)).toEqual([
      'B02',
      'B01',
      'B03',
    ]);
  });

  it('does not start a tournament while roster validation fails', () => {
    const competition = createNewCompetition('Profiles', 1, 2, 3, 'bo3');
    competition.groups[0].players[0].participantCode = '';
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().startTournament(3);

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups[0].status).toBe('setup');
    expect(updated.groups[0].currentRound).toBe(0);
  });

  it('continues numbering after 32 when earlier codes are already occupied', () => {
    const competition = createNewCompetition('Profiles', 1, 34, 3, 'bo3');
    competition.groups[0].players.forEach((player, index) => {
      if (index < 32) {
        player.participantCode = `A${String(index + 1).padStart(2, '0')}`;
      }
    });
    useTournamentStore.setState({ competition });

    const result = useTournamentStore.getState().generateMissingParticipantCodes();
    const codes = useTournamentStore.getState().competition.groups[0].players.map(
      player => player.participantCode
    );

    expect(result).toEqual({ assigned: 2, unresolved: 0 });
    expect(codes.slice(-2)).toEqual(['A33', 'A34']);
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

  it('preserves other groups when importing a roster for only one group', () => {
    const competition = createNewCompetition('Profiles', 2, 2, 3, 'bo3');
    competition.groups[0].name = '甲组';
    competition.groups[1].name = '乙组';
    competition.groups[1].players = competition.groups[1].players.map((player, index) => ({
      ...player,
      name: index === 0 ? '原有乙一' : '原有乙二',
    }));
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().importPlayerProfiles([
      { name: '新甲一', groupName: '甲组', participantCode: 'A01' },
      { name: '新甲二', groupName: '甲组', participantCode: 'A02' },
    ]);

    let updated = useTournamentStore.getState().competition;
    expect(updated.groups).toHaveLength(2);
    expect(updated.groups[0].players.map(player => player.name)).toEqual(['新甲一', '新甲二']);
    expect(updated.groups[1].players.map(player => player.name)).toEqual(['原有乙一', '原有乙二']);

    useTournamentStore.getState().setCurrentGroup(1);
    updated = useTournamentStore.getState().competition;
    expect(updated.currentGroupIndex).toBe(1);
    expect(updated.groups[1].players.map(player => player.name)).toEqual(['原有乙一', '原有乙二']);
  });

  it('imports a single unnamed worksheet into the current group', () => {
    const competition = createNewCompetition('Profiles', 2, 2, 3, 'bo3');
    competition.currentGroupIndex = 1;
    competition.groups[0].players = competition.groups[0].players.map((player, index) => ({
      ...player,
      name: index === 0 ? '原有甲一' : '原有甲二',
    }));
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().importPlayerProfiles([
      { name: '新乙一', groupName: 'Sheet1', participantCode: 'B01' },
      { name: '新乙二', groupName: 'Sheet1', participantCode: 'B02' },
    ]);

    const updated = useTournamentStore.getState().competition;
    expect(updated.groups).toHaveLength(2);
    expect(updated.groups[0].players.map(player => player.name)).toEqual(['原有甲一', '原有甲二']);
    expect(updated.groups[1].players.map(player => player.name)).toEqual(['新乙一', '新乙二']);
  });

  it('writes a player edit back to its original group after switching groups', () => {
    const competition = createNewCompetition('Profiles', 2, 2, 3, 'bo3');
    useTournamentStore.setState({ competition });
    const playerId = competition.groups[0].players[0].id;

    useTournamentStore.getState().setCurrentGroup(1);
    const changed = useTournamentStore.getState().updatePlayerProfile(
      playerId,
      { name: '切换后写入甲组' },
      0
    );
    useTournamentStore.getState().setCurrentGroup(0);

    expect(changed).toBe(true);
    expect(useTournamentStore.getState().competition.groups[0].players[0].name)
      .toBe('切换后写入甲组');
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
