import { beforeEach, describe, expect, it } from 'vitest';
import { createNewCompetition } from './tournamentFactory';
import { useTournamentStore } from './useTournamentStore';

function createReadyCompetition() {
  const competition = createNewCompetition('Undo round', 1, 4, 3, 'bo1');
  competition.groups[0].players.forEach((player, index) => {
    player.participantCode = `A${String(index + 1).padStart(2, '0')}`;
  });
  return competition;
}

describe('undoLastRound', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      competition: createNewCompetition('Empty', 1, 2, 3, 'bo1'),
      viewRound: 0,
      historyPast: [],
      historyFuture: [],
      isReadOnly: false,
    });
  });

  it('keeps first-round pairings and resets entered results to pending', () => {
    useTournamentStore.setState({ competition: createReadyCompetition() });
    const store = useTournamentStore.getState();
    store.startTournament(3);

    const startedGroup = useTournamentStore.getState().competition.groups[0];
    const originalPairings = startedGroup.matches.map(match => ({
      id: match.id,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
    }));
    const firstMatch = startedGroup.matches[0];
    useTournamentStore.getState().updateMatchResult(firstMatch.id, 'player1', 1, 0);
    expect(
      useTournamentStore.getState().competition.groups[0].players
        .find(player => player.id === firstMatch.player1Id)?.wins
    ).toBe(1);

    useTournamentStore.getState().undoLastRound();

    const updated = useTournamentStore.getState();
    const group = updated.competition.groups[0];
    expect(updated.viewRound).toBe(1);
    expect(group.currentRound).toBe(1);
    expect(group.status).toBe('in_progress');
    expect(group.matches.map(match => ({
      id: match.id,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
    }))).toEqual(originalPairings);
    expect(group.matches.every(match => match.result === 'pending')).toBe(true);
    expect(group.players.every(player => player.wins === 0 && player.losses === 0)).toBe(true);
  });

  it('keeps later-round pairings and resets only their entered results', () => {
    useTournamentStore.setState({ competition: createReadyCompetition() });
    useTournamentStore.getState().startTournament(3);

    const firstRound = useTournamentStore.getState().competition.groups[0];
    for (const match of firstRound.matches) {
      useTournamentStore.getState().updateMatchResult(match.id, 'player1', 1, 0);
    }
    useTournamentStore.getState().generateNextRound();
    const secondRound = useTournamentStore.getState().competition.groups[0];
    const secondRoundPairings = secondRound.matches
      .filter(match => match.round === 2)
      .map(match => ({
        id: match.id,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
      }));
    expect(secondRound.currentRound).toBe(2);
    const secondRoundMatch = secondRound.matches.find(match => match.round === 2)!;
    useTournamentStore.getState().updateMatchResult(secondRoundMatch.id, 'player1', 1, 0);

    useTournamentStore.getState().undoLastRound();

    const updated = useTournamentStore.getState();
    const group = updated.competition.groups[0];
    expect(updated.viewRound).toBe(2);
    expect(group.currentRound).toBe(2);
    expect(group.matches.filter(match => match.round === 2).map(match => ({
      id: match.id,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
    }))).toEqual(secondRoundPairings);
    expect(group.matches.filter(match => match.round === 2).every(match => match.result === 'pending'))
      .toBe(true);
    expect(group.matches.filter(match => match.round === 1).every(match => match.result !== 'pending'))
      .toBe(true);
  });
});
