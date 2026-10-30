import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTournamentStore } from './useTournamentStore';
import { flushStorage, saveCompetition } from '../utils/storage/storage';
import { resolveRemoteSaveDecision } from '../utils/storage/storageSync';

function stubLocalStorage(): Map<string, string> {
  const data = new Map<string, string>();
  const storage: Storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: key => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: index => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  return data;
}

describe('dirty since last persist', () => {
  beforeEach(async () => {
    stubLocalStorage();
    const store = useTournamentStore.getState();
    store.setReadOnly(false);
    store.discardUnsavedChanges();
    store.initCompetition('Dirty test', 2, 4, 3);
    await flushStorage();
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(false);
  });

  afterEach(async () => {
    await flushStorage();
    useTournamentStore.getState().setReadOnly(false);
    useTournamentStore.getState().discardUnsavedChanges();
    vi.unstubAllGlobals();
  });

  it('marks a persisted change dirty until the write lands, then clears it', async () => {
    useTournamentStore.getState().updateCompetitionName('Renamed');
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(true);

    await flushStorage();
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(false);
  });

  it('does not treat navigation-only group switches as unsaved changes', () => {
    useTournamentStore.getState().setCurrentGroup(1);
    expect(useTournamentStore.getState().competition.currentGroupIndex).toBe(1);
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(false);
  });

  it('does not mark changes that are rejected while read-only', () => {
    useTournamentStore.getState().setReadOnly(true);
    useTournamentStore.getState().updateCompetitionName('Blocked');

    expect(useTournamentStore.getState().competition.name).toBe('Dirty test');
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(false);
  });

  it('clears unsaved changes when the persisted version is loaded', async () => {
    useTournamentStore.setState({ dirtySinceLastPersist: true });
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(true);

    const loaded = await useTournamentStore.getState().loadSavedCompetition();
    expect(loaded).toBe(true);
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(false);
  });

  it('keeps the dirty flag until an explicit overwrite is persisted', async () => {
    const store = useTournamentStore.getState();
    store.markUnsavedChanges();
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(true);

    saveCompetition(useTournamentStore.getState().competition);
    await flushStorage();
    expect(useTournamentStore.getState().dirtySinceLastPersist).toBe(false);
  });

  it('drives the cross-tab conflict decision from the dirty flag', async () => {
    useTournamentStore.getState().updateCompetitionName('Pending edit');
    const dirtyState = useTournamentStore.getState();
    expect(
      resolveRemoteSaveDecision({
        localCompetitionId: dirtyState.competition.id,
        remoteCompetitionId: dirtyState.competition.id,
        hasUnsavedChanges: dirtyState.dirtySinceLastPersist,
      })
    ).toBe('conflict');

    await flushStorage();
    const cleanState = useTournamentStore.getState();
    expect(
      resolveRemoteSaveDecision({
        localCompetitionId: cleanState.competition.id,
        remoteCompetitionId: cleanState.competition.id,
        hasUnsavedChanges: cleanState.dirtySinceLastPersist,
      })
    ).toBe('auto-reload');
  });
});
