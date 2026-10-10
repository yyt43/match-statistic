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

  it('can return to the previous round and remove the current pairings', () => {
    useTournamentStore.setState({ competition: createReadyCompetition() });
    useTournamentStore.getState().startTournament(3);

    const firstRound = useTournamentStore.getState().competition.groups[0];
    for (const match of firstRound.matches) {
      useTournamentStore.getState().updateMatchResult(match.id, 'player1', 1, 0);
    }
    useTournamentStore.getState().generateNextRound();
    const secondRoundMatch = useTournamentStore.getState().competition.groups[0].matches
      .find(match => match.round === 2)!;
    useTournamentStore.getState().updateMatchResult(secondRoundMatch.id, 'player1', 1, 0);

    useTournamentStore.getState().returnToPreviousRound();

    const updated = useTournamentStore.getState();
    const group = updated.competition.groups[0];
    expect(updated.viewRound).toBe(1);
    expect(group.currentRound).toBe(1);
    expect(group.matches.some(match => match.round === 2)).toBe(false);
    expect(group.matches.filter(match => match.round === 1).every(match => match.result !== 'pending'))
      .toBe(true);
  });

  it('returns an empty first round to setup', () => {
    useTournamentStore.setState({ competition: createReadyCompetition() });
    useTournamentStore.getState().startTournament(3);
    expect(useTournamentStore.getState().competition.groups[0].currentRound).toBe(1);

    useTournamentStore.getState().returnToSetup();

    const updated = useTournamentStore.getState();
    const group = updated.competition.groups[0];
    expect(updated.viewRound).toBe(0);
    expect(group.currentRound).toBe(0);
    expect(group.status).toBe('setup');
    expect(group.matches).toHaveLength(0);
    expect(updated.competition.rosterLockedAt).toBeUndefined();
  });

  it('clears downstream fixed-bracket matches when undoing a played round', () => {
    const competition = createReadyCompetition();
    competition.groups[0].pairingType = 'single_elimination';
    useTournamentStore.setState({ competition });
    useTournamentStore.getState().confirmEliminationBracket(0);

    const firstRound = useTournamentStore.getState().competition.groups[0];
    const firstRoundNodeIds = firstRound.matches
      .filter(match => match.round === 1)
      .map(match => match.bracketNodeId);
    const matchesToPlay = firstRound.matches.filter(item => item.round === 1 && !item.isBye);
    for (const match of matchesToPlay) {
      useTournamentStore.getState().updateMatchResult(match.id, 'player1', 1, 0);
    }
    expect(
      useTournamentStore.getState().competition.groups[0].matches
        .filter(match => match.round === 1)
        .every(match => match.result !== 'pending')
    ).toBe(true);
    expect(useTournamentStore.getState().competition.groups[0].status).toBe('in_progress');
    expect(
      useTournamentStore.getState().competition.groups[0].matches
        .some(match => match.round === 2)
    ).toBe(true);

    useTournamentStore.getState().undoLastRound();

    const group = useTournamentStore.getState().competition.groups[0];
    expect(group.currentRound).toBe(1);
    expect(group.matches.filter(match => match.round === 1).map(match => match.bracketNodeId))
      .toEqual(firstRoundNodeIds);
    expect(group.matches.some(match => match.round > 1)).toBe(false);
    expect(group.matches.filter(match => match.round === 1).every(match => match.result === 'pending'))
      .toBe(true);
  });

  it('rolls back player records when undoing a fixed-bracket round', () => {
    const competition = createReadyCompetition();
    competition.groups[0].pairingType = 'single_elimination';
    useTournamentStore.setState({ competition });
    useTournamentStore.getState().confirmEliminationBracket(0);

    const firstRound = useTournamentStore.getState().competition.groups[0];
    const firstMatch = firstRound.matches.find(match => match.round === 1 && !match.isBye)!;
    useTournamentStore.getState().updateMatchResult(firstMatch.id, 'player1', 1, 0);

    const afterResult = useTournamentStore.getState().competition.groups[0].players;
    expect(afterResult.find(player => player.id === firstMatch.player1Id)?.wins).toBe(1);
    expect(afterResult.find(player => player.id === firstMatch.player2Id)?.losses).toBe(1);
    expect(afterResult.find(player => player.id === firstMatch.player2Id)?.eliminated).toBe(true);

    useTournamentStore.getState().undoLastRound();

    const updatedPlayers = useTournamentStore.getState().competition.groups[0].players;
    expect(updatedPlayers.find(player => player.id === firstMatch.player1Id)?.wins).toBe(0);
    expect(updatedPlayers.find(player => player.id === firstMatch.player2Id)?.losses).toBe(0);
    expect(updatedPlayers.find(player => player.id === firstMatch.player2Id)?.eliminated).toBe(false);
  });

  it('rolls back automatic bye records when returning a fixed bracket to setup', () => {
    const competition = createNewCompetition('Fixed bye setup', 1, 6, 3, 'bo1');
    competition.groups[0].pairingType = 'single_elimination';
    competition.groups[0].players.forEach((player, index) => {
      player.participantCode = `B${String(index + 1).padStart(2, '0')}`;
    });
    useTournamentStore.setState({ competition });
    useTournamentStore.getState().confirmEliminationBracket(0);

    const started = useTournamentStore.getState().competition.groups[0];
    const byeMatch = started.matches.find(match => match.isBye)!;
    const byePlayer = started.players.find(player => player.id === byeMatch.player1Id)!;
    expect(byePlayer.wins).toBe(1);
    expect(byePlayer.playedAgainst).toContain('bye');

    useTournamentStore.getState().returnToSetup();

    const resetGroup = useTournamentStore.getState().competition.groups[0];
    expect(resetGroup.status).toBe('setup');
    expect(resetGroup.matches).toHaveLength(0);
    const resetByePlayer = resetGroup.players.find(player => player.id === byeMatch.player1Id)!;
    expect(resetByePlayer.wins).toBe(0);
    expect(resetByePlayer.playedAgainst).not.toContain('bye');
  });

  it('does not regenerate a locked fixed bracket when confirmation is repeated', () => {
    const competition = createReadyCompetition();
    competition.groups[0].pairingType = 'single_elimination';
    useTournamentStore.setState({ competition });
    useTournamentStore.getState().confirmEliminationBracket(0);

    const firstConfirmation = useTournamentStore.getState().competition.groups[0];
    const matchIds = firstConfirmation.matches.map(match => match.id);
    useTournamentStore.getState().confirmEliminationBracket(0);
    const secondConfirmation = useTournamentStore.getState().competition.groups[0];

    expect(secondConfirmation.matches.map(match => match.id)).toEqual(matchIds);
    expect(secondConfirmation.currentRound).toBe(1);
  });
});
