import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';
import { listSnapshots, saveSnapshot } from './snapshot';

describe('snapshots', () => {
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

  it('replaces an automatic snapshot with the same competition and label', async () => {
    const competition = createNewCompetition('Snapshot test');
    await saveSnapshot(competition, '第1轮完赛', { replaceSameLabel: true });
    await saveSnapshot(competition, '第1轮完赛', { replaceSameLabel: true });

    const snapshots = await listSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].label).toBe('第1轮完赛');
  });

  it('keeps manual snapshots even when labels match', async () => {
    const competition = createNewCompetition('Snapshot test');
    await saveSnapshot(competition, '手动备份');
    await saveSnapshot(competition, '手动备份');

    const snapshots = await listSnapshots();
    expect(snapshots).toHaveLength(2);
  });
});
