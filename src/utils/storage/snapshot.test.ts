import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';
import { useTournamentStore } from '../../store/useTournamentStore';
import {
  getSnapshotOwner,
  listSnapshots,
  saveSnapshot,
} from './snapshot';

const SNAPSHOT_KEY = 'swiss_tournament_snapshots';

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

  it('reports whether the snapshot was persisted', async () => {
    const competition = createNewCompetition('Snapshot test');
    expect(await saveSnapshot(competition, '正常备份')).toBe(true);

    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    });
    expect(await saveSnapshot(competition, '失败备份')).toBe(false);
  });

  it('serializes concurrent snapshot saves instead of overwriting each other', async () => {
    const competition = createNewCompetition('Snapshot test');
    const results = await Promise.all([
      saveSnapshot(competition, '并发备份 1'),
      saveSnapshot(competition, '并发备份 2'),
    ]);

    expect(results).toEqual([true, true]);
    const snapshots = await listSnapshots();
    expect(snapshots).toHaveLength(2);
  });

  it('records the owning competition on new snapshots', async () => {
    const competition = createNewCompetition('Owner snapshot test');
    await saveSnapshot(competition, '归属测试');

    const [snapshot] = await listSnapshots();
    expect(snapshot.competitionId).toBe(competition.id);
    expect(snapshot.competitionName).toBe(competition.name);
    expect(getSnapshotOwner(snapshot)).toEqual({
      id: competition.id,
      name: competition.name,
    });
  });

  it('reads legacy snapshots without ownership fields and drops malformed entries', async () => {
    const competition = createNewCompetition('Legacy snapshot test');
    values.set(SNAPSHOT_KEY, JSON.stringify([
      { id: 'legacy-1', savedAt: '2026-01-01T00:00:00.000Z', label: '旧快照', data: competition },
      { id: 'broken', label: '缺少字段' },
      'not-an-object',
    ]));

    const snapshots = await listSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].competitionId).toBeUndefined();
    // 旧条目没有归属字段：赛事名视为未知，但 id 回退到 data.id 以保持可校验。
    expect(getSnapshotOwner(snapshots[0])).toEqual({ id: competition.id, name: null });
  });

  it('refuses to restore a snapshot that belongs to another competition', async () => {
    const store = useTournamentStore.getState();
    store.initCompetition('Event A', 1, 4, 2);
    const competitionA = useTournamentStore.getState().competition;
    expect(await store.createSnapshot('A 备份')).toBe(true);

    const snapshot = (await listSnapshots()).find(item => item.label === 'A 备份');
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    expect(getSnapshotOwner(snapshot).id).toBe(competitionA.id);

    store.initCompetition('Event B', 1, 4, 2);
    const currentB = useTournamentStore.getState().competition;
    expect(await useTournamentStore.getState().restoreFromSnapshot(snapshot.id)).toBe(false);
    expect(useTournamentStore.getState().competition.id).toBe(currentB.id);
    expect(useTournamentStore.getState().actionError?.zh).toContain('其他赛事');
  });
});
