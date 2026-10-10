import { beforeEach, describe, expect, it } from 'vitest';
import { createNewCompetition } from './tournamentFactory';
import { createOrderedEliminationBracket, createEliminationFirstRoundMatches } from '../utils/elimination';
import { useTournamentStore } from './useTournamentStore';

function competitionWithPendingMatch() {
  const competition = createNewCompetition('Import action', 1, 2, 3, 'bo3');
  const group = competition.groups[0];
  group.currentRound = 1;
  group.status = 'in_progress';
  group.players[0].participantCode = 'A01';
  group.players[1].participantCode = 'A02';
  group.matches = [{
    id: 'm1',
    round: 1,
    player1Id: group.players[0].id,
    player2Id: group.players[1].id,
    result: 'pending',
  }];
  return competition;
}

describe('import store actions', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      competition: createNewCompetition('Empty', 1, 2, 3, 'bo3'),
      historyPast: [],
      historyFuture: [],
      isReadOnly: false,
    });
  });

  it('applies an imported result when screenshot verification is optional', () => {
    const competition = competitionWithPendingMatch();
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().applyImportedMatchResults([{
      matchId: 'm1',
      groupIndex: 0,
      result: 'player1',
      player1Games: 2,
      player2Games: 1,
      evidenceVerificationStatus: 'not_required',
    }]);

    expect(useTournamentStore.getState().competition.groups[0].matches[0].result).toBe('player1');
  });

  it('refuses to apply evidence marked as mismatched', () => {
    const competition = competitionWithPendingMatch();
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().applyImportedMatchResults([{
      matchId: 'm1',
      groupIndex: 0,
      result: 'player1',
      player1Games: 2,
      player2Games: 1,
      evidenceVerificationStatus: 'mismatch',
    }]);

    expect(useTournamentStore.getState().competition.groups[0].matches[0].result).toBe('pending');
  });

  it('applies a verified result and records evidence state', () => {
    const competition = competitionWithPendingMatch();
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().applyImportedMatchResults([{
      matchId: 'm1',
      groupIndex: 0,
      result: 'player1',
      player1Games: 2,
      player2Games: 1,
      evidenceRefs: ['A-R1-01_01.png'],
      evidenceVerificationStatus: 'verified',
    }]);

    const match = useTournamentStore.getState().competition.groups[0].matches[0];
    expect(match.result).toBe('player1');
    expect(match.evidenceVerificationStatus).toBe('verified');
    expect(match.evidenceRefs).toEqual(['A-R1-01_01.png']);
  });

  it('invalidates unplayed later Swiss rounds on referee override', () => {
    const competition = competitionWithPendingMatch();
    const group = competition.groups[0];
    group.currentRound = 2;
    group.matches.push({
      id: 'm2',
      round: 2,
      player1Id: group.players[1].id,
      player2Id: group.players[0].id,
      result: 'pending',
    });
    useTournamentStore.setState({ competition });
    const store = useTournamentStore.getState();
    store.applyImportedMatchResults([{
      matchId: 'm1',
      groupIndex: 0,
      result: 'player1',
      player1Games: 2,
      player2Games: 1,
      evidenceVerificationStatus: 'verified',
    }]);

    const applied = store.overrideMatchResult(
      'm1',
      'player2',
      1,
      2,
      'Screenshot shows the other winner'
    );
    const updated = useTournamentStore.getState().competition.groups[0];
    expect(applied).toBe(true);
    expect(updated.currentRound).toBe(1);
    expect(updated.matches.some(match => match.id === 'm2')).toBe(false);
    expect(updated.matches[0].result).toBe('player2');
  });

  it('blocks automatic override when a later round was already played', () => {
    const competition = competitionWithPendingMatch();
    const group = competition.groups[0];
    group.currentRound = 2;
    group.matches.push({
      id: 'm2',
      round: 2,
      player1Id: group.players[1].id,
      player2Id: group.players[0].id,
      result: 'player1',
      player1Games: 2,
      player2Games: 0,
    });
    useTournamentStore.setState({ competition });
    const store = useTournamentStore.getState();
    store.applyImportedMatchResults([{
      matchId: 'm1',
      groupIndex: 0,
      result: 'player1',
      player1Games: 2,
      player2Games: 1,
      evidenceVerificationStatus: 'verified',
    }]);

    expect(store.overrideMatchResult(
      'm1',
      'player2',
      1,
      2,
      'Late correction'
    )).toBe(false);
  });

  it('rebuilds fixed-bracket downstream matches after an imported correction', () => {
    const competition = createNewCompetition('Fixed bracket import', 1, 4, 2, 'bo1', 'single_elimination');
    const group = competition.groups[0];
    const bracket = {
      ...createOrderedEliminationBracket(group.players),
      lockedAt: '2026-10-10T00:00:00.000Z',
    };
    group.eliminationBracket = bracket;
    group.matches = createEliminationFirstRoundMatches(group, bracket);
    group.matches = group.matches.map((match, index) => index === 1
      ? {
          ...match,
          result: 'player1' as const,
          player1Games: 1,
          player2Games: 0,
        }
      : {
          ...match,
          result: 'pending' as const,
          player1Games: undefined,
          player2Games: undefined,
        });
    group.currentRound = 1;
    group.status = 'in_progress';
    useTournamentStore.setState({ competition });
    const store = useTournamentStore.getState();

    const firstMatch = group.matches[0];
    store.applyImportedMatchResults([{
      matchId: firstMatch.id,
      groupIndex: 0,
      result: 'player1',
      player1Games: 1,
      player2Games: 0,
      evidenceVerificationStatus: 'verified',
    }]);
    expect(
      useTournamentStore.getState().competition.groups[0].matches
        .find(match => match.bracketNodeId === 'r2-m0')?.player1Id
    ).toBe(firstMatch.player1Id);

    store.applyImportedMatchResults([{
      matchId: firstMatch.id,
      groupIndex: 0,
      result: 'player2',
      player1Games: 0,
      player2Games: 1,
      evidenceVerificationStatus: 'verified',
    }]);
    const rebuilt = useTournamentStore.getState().competition.groups[0];
    expect(rebuilt.matches.find(match => match.id === firstMatch.id)?.result).toBe('player2');
    expect(rebuilt.matches.find(match => match.bracketNodeId === 'r2-m0')?.player1Id)
      .toBe(firstMatch.player2Id);
  });

  it('blocks imported fixed-bracket corrections after a downstream result exists', () => {
    const competition = createNewCompetition('Protected bracket import', 1, 4, 2, 'bo1', 'single_elimination');
    const group = competition.groups[0];
    const bracket = {
      ...createOrderedEliminationBracket(group.players),
      lockedAt: '2026-10-10T00:00:00.000Z',
    };
    group.eliminationBracket = bracket;
    group.matches = createEliminationFirstRoundMatches(group, bracket);
    group.matches = group.matches.map(match => ({
      ...match,
      result: 'pending' as const,
      player1Games: undefined,
      player2Games: undefined,
    }));
    group.currentRound = 2;
    group.status = 'in_progress';
    group.matches.push({
      id: 'r2-m0',
      round: 2,
      player1Id: group.players[0].id,
      player2Id: group.players[2].id,
      result: 'player1',
      player1Games: 1,
      player2Games: 0,
      bracketNodeId: 'r2-m0',
    });
    useTournamentStore.setState({ competition });

    useTournamentStore.getState().applyImportedMatchResults([{
      matchId: group.matches[0].id,
      groupIndex: 0,
      result: 'player2',
      player1Games: 0,
      player2Games: 1,
      evidenceVerificationStatus: 'verified',
    }]);

    expect(
      useTournamentStore.getState().competition.groups[0].matches
        .find(match => match.id === group.matches[0].id)?.result
    ).toBe('pending');
  });
});
