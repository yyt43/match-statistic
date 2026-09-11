import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewCompetition } from '../store/tournamentFactory';
import { flushStorage, loadCompetition, saveCompetition } from './storage';

const STORAGE_KEY = 'swiss_tournament_data';
const BACKUP_KEY = 'swiss_tournament_data_backup';

describe('storage', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and restores the competition through the localStorage fallback', async () => {
    saveCompetition(createNewCompetition('Storage test'));
    await flushStorage();

    const loaded = await loadCompetition();
    expect(loaded?.name).toBe('Storage test');
    expect(loaded?.groups).toHaveLength(1);
  });

  it('restores from the backup key when the primary record is corrupted', async () => {
    saveCompetition(createNewCompetition('Backup test'));
    await flushStorage();
    values.set(STORAGE_KEY, '{invalid json');

    const loaded = await loadCompetition();
    expect(loaded?.name).toBe('Backup test');
    expect(values.has(BACKUP_KEY)).toBe(true);
  });

  it('migrates legacy single-group data', async () => {
    values.set(STORAGE_KEY, JSON.stringify({
      id: 'legacy',
      name: 'Legacy event',
      mode: 'swiss',
      currentRound: 0,
      totalRounds: 5,
      status: 'setup',
      players: [],
      matches: [],
      createdAt: '2026-09-11T00:00:00.000Z',
      gameType: 'swiss',
    }));

    const loaded = await loadCompetition();
    expect(loaded?.groups[0].pairingType).toBe('swiss');
    expect(loaded?.groups[0].roundGameTypes).toHaveLength(5);
  });
});
