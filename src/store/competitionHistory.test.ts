import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTournamentStore } from './useTournamentStore';
import {
  flushCompetitionHistory,
  loadCompetitionHistory,
} from '../utils/storage/historyStore';

describe('competition history', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
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

  it('jumps to an earlier operation and keeps later states redoable', async () => {
    const store = useTournamentStore.getState();
    store.updateCompetitionName('First');
    await Promise.resolve();
    useTournamentStore.getState().updateCompetitionName('Second');
    await Promise.resolve();
    useTournamentStore.getState().updateCompetitionName('Third');
    await Promise.resolve();

    expect(useTournamentStore.getState().historyPast).toHaveLength(3);
    expect(useTournamentStore.getState().jumpToHistory(0)).toBe(true);
    expect(useTournamentStore.getState().competition.name).toBe('History test');
    expect(useTournamentStore.getState().historyFuture).toHaveLength(3);
  });

  it('persists history for recovery after a reload', async () => {
    const store = useTournamentStore.getState();
    store.updateCompetitionName('Persisted history');
    await Promise.resolve();
    await flushCompetitionHistory();

    const restored = await loadCompetitionHistory(useTournamentStore.getState().competition.id);
    expect(restored?.past).toHaveLength(1);
    expect(restored?.past[0].label).toBe('修改赛事名称');
  });
});
