import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTournamentStore } from './useTournamentStore';

describe('competition history', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    useTournamentStore.getState().setReadOnly(false);
    useTournamentStore.getState().initCompetition('History test', 1, 4, 3);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('undoes and redoes the last competition operation', async () => {
    const store = useTournamentStore.getState();
    store.updateCompetitionName('Renamed event');
    await Promise.resolve();

    expect(useTournamentStore.getState().historyPast).toHaveLength(1);
    expect(useTournamentStore.getState().competition.name).toBe('Renamed event');

    expect(useTournamentStore.getState().undo()).toBe(true);
    expect(useTournamentStore.getState().competition.name).toBe('History test');

    expect(useTournamentStore.getState().redo()).toBe(true);
    expect(useTournamentStore.getState().competition.name).toBe('Renamed event');
  });

  it('coalesces synchronous changes into one history entry', async () => {
    useTournamentStore.getState().updateCompetitionName('First');
    useTournamentStore.getState().updateCompetitionName('Second');
    await Promise.resolve();

    expect(useTournamentStore.getState().historyPast).toHaveLength(1);
    useTournamentStore.getState().undo();
    expect(useTournamentStore.getState().competition.name).toBe('History test');
  });

  it('blocks mutations while the tab is read-only', () => {
    useTournamentStore.getState().setReadOnly(true);
    useTournamentStore.getState().updateCompetitionName('Blocked');

    expect(useTournamentStore.getState().competition.name).toBe('History test');
    expect(useTournamentStore.getState().historyPast).toHaveLength(0);

    useTournamentStore.getState().setReadOnly(false);
    useTournamentStore.getState().updateCompetitionName('Allowed');
    expect(useTournamentStore.getState().competition.name).toBe('Allowed');
  });

  it('blocks undo and redo while read-only', async () => {
    useTournamentStore.getState().updateCompetitionName('Changed');
    await Promise.resolve();
    const changed = useTournamentStore.getState().competition;

    useTournamentStore.getState().setReadOnly(true);
    expect(useTournamentStore.getState().undo()).toBe(false);
    expect(useTournamentStore.getState().competition).toBe(changed);
  });

  it('stores a custom tiebreak chain', () => {
    useTournamentStore.getState().setTiebreakTemplate(
      'custom',
      ['points', 'opponentWinRate']
    );

    const group = useTournamentStore.getState().competition.groups[0];
    expect(group.tiebreakTemplate).toBe('custom');
    expect(group.tiebreakRules).toEqual(['points', 'opponentWinRate']);
  });
});
