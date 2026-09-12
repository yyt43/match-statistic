import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';
import { inspectStorageHealth, repairStorageHealth } from './health';
import { BACKUP_KEY, STORAGE_KEY } from './storage';

describe('storage health', () => {
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

  it('reports missing primary and backup records', async () => {
    const report = await inspectStorageHealth(createNewCompetition('Health test'));
    expect(report.level).toBe('error');
    expect(report.checks.find(check => check.id === 'primary-record')?.level).toBe('error');
    expect(report.checks.find(check => check.id === 'backup-record')?.level).toBe('warning');
  });

  it('repairs redundant storage records', async () => {
    const competition = createNewCompetition('Health test');
    const repaired = await repairStorageHealth(competition);

    expect(values.has(STORAGE_KEY)).toBe(true);
    expect(values.has(BACKUP_KEY)).toBe(true);
    expect(repaired.checks.find(check => check.id === 'primary-record')?.level).toBe('ok');
    expect(repaired.checks.find(check => check.id === 'backup-record')?.level).toBe('ok');
  });
});
