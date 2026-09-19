import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateCompetitionData } from '../utils/schema';
import { useTournamentStore } from './useTournamentStore';

describe('bye match result protection', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
    const state = useTournamentStore.getState();
    state.initCompetition('Bye protection', 1, 3, 1, 'bo3', 'swiss');
    state.startTournament(1);
  });

  it('ignores attempts to overwrite an automatic bye from both result update entry points', () => {
    const state = useTournamentStore.getState();
    const beforeGroup = state.competition.groups[0];
    const byeMatch = beforeGroup.matches.find(match => match.isBye);

    expect(byeMatch).toBeDefined();
    const beforeWinner = beforeGroup.players.find(player => player.id === byeMatch!.player1Id);
    expect(beforeWinner).toBeDefined();

    state.updateMatchResult(byeMatch!.id, 'player2', 0, 2);
    state.updateMatchResultForGroup(0, byeMatch!.id, 'draw', 0, 0);

    const afterGroup = useTournamentStore.getState().competition.groups[0];
    const afterByeMatch = afterGroup.matches.find(match => match.id === byeMatch!.id);
    const afterWinner = afterGroup.players.find(player => player.id === byeMatch!.player1Id);

    expect(afterByeMatch).toEqual(byeMatch);
    expect(afterWinner).toEqual(beforeWinner);
    expect(validateCompetitionData(useTournamentStore.getState().competition).success).toBe(true);
  });

  it('clears existing playoffs when a regular result changes', () => {
    const state = useTournamentStore.getState();
    state.initCompetition('Playoff invalidation', 1, 4, 1, 'bo3', 'swiss');
    state.startTournament(1);

    for (const match of useTournamentStore.getState().competition.groups[0].matches.filter(match => !match.isBye)) {
      state.updateMatchResult(match.id, 'draw', 0, 0);
    }
    state.generatePlayoff();

    let group = useTournamentStore.getState().competition.groups[0];
    expect(group.playoffBrackets).toHaveLength(1);
    expect(group.matches.some(match => match.isPlayoff)).toBe(true);

    const regularMatch = group.matches.find(match => !match.isPlayoff)!;
    state.updateMatchResultForGroup(0, regularMatch.id, 'draw', 0, 0);
    expect(useTournamentStore.getState().competition.groups[0].playoffBrackets).toHaveLength(1);

    state.updateMatchResultForGroup(0, regularMatch.id, 'player1', 2, 0);

    group = useTournamentStore.getState().competition.groups[0];
    expect(group.playoffBrackets).toBeUndefined();
    expect(group.matches.some(match => match.isPlayoff)).toBe(false);
    expect(group.matches.find(match => match.id === regularMatch.id)?.result).toBe('player1');
    expect(useTournamentStore.getState().viewRound).toBe(1);
    expect(validateCompetitionData(useTournamentStore.getState().competition).success).toBe(true);
  });

  it('writes a valid automatic result when batch pairing creates a bye', () => {
    const state = useTournamentStore.getState();
    state.initCompetition('Batch bye', 1, 4, 1, 'bo3', 'swiss');
    state.startTournament(1);

    const pendingMatch = useTournamentStore.getState().competition.groups[0]
      .matches.find(match => match.result === 'pending')!;
    state.batchUpdateRoundMatches(1, [{
      matchId: pendingMatch.id,
      player1Id: pendingMatch.player1Id,
      player2Id: 'bye',
      isBye: true,
    }]);

    const group = useTournamentStore.getState().competition.groups[0];
    const byeMatch = group.matches.find(match => match.id === pendingMatch.id);
    const winner = group.players.find(player => player.id === pendingMatch.player1Id);

    expect(byeMatch).toMatchObject({
      player2Id: 'bye',
      isBye: true,
      result: 'player1',
      player1Games: 2,
      player2Games: 0,
    });
    expect(winner).toMatchObject({ points: 1, wins: 1, wonGames: 2, totalGames: 2 });
    expect(winner?.playedAgainst).toContain('bye');
    expect(validateCompetitionData(useTournamentStore.getState().competition).success).toBe(true);
  });
});
