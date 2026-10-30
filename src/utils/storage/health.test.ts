import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';
import { inspectStorageHealth, repairStorageHealth } from './health';
import { CURRENT_STORAGE_VERSION } from './migrations';
import { BACKUP_KEY, STORAGE_KEY, prepareStoredRecord } from './storage';

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
    expect(report.repairRecommended).toBe(true);
  });

  it('repairs redundant storage records', async () => {
    const competition = createNewCompetition('Health test');
    const repaired = await repairStorageHealth(competition);

    expect(values.has(STORAGE_KEY)).toBe(true);
    expect(values.has(BACKUP_KEY)).toBe(true);
    expect(repaired.checks.find(check => check.id === 'primary-record')?.level).toBe('ok');
    expect(repaired.checks.find(check => check.id === 'backup-record')?.level).toBe('ok');
  });

  it('treats legacy records as migratable instead of corrupt', async () => {
    const competition = createNewCompetition('Legacy health');
    const legacyRaw = JSON.stringify({
      version: 4,
      savedAt: '2026-01-01T00:00:00.000Z',
      data: competition,
    });
    values.set(STORAGE_KEY, legacyRaw);

    const report = await inspectStorageHealth(competition);
    expect(report.checks.find(check => check.id === 'primary-record')?.level).toBe('ok');
    expect(report.checks.find(check => check.id === 'record-versions')?.level).toBe('ok');
    expect(report.repairRecommended).toBe(false);

    // 可迁移记录是有效数据：体检修复不得用内存状态覆盖它。
    const repaired = await repairStorageHealth(competition);
    expect(values.get(STORAGE_KEY)).toBe(legacyRaw);
    expect(values.has(BACKUP_KEY)).toBe(false);
    expect(repaired.repairRecommended).toBe(false);
  });

  it('recommends repair for corrupt records and rewrites them', async () => {
    values.set(STORAGE_KEY, '{"broken":');
    const competition = createNewCompetition('Corrupt health');

    const before = await inspectStorageHealth(competition);
    expect(before.checks.find(check => check.id === 'primary-record')?.level).toBe('error');
    expect(before.repairRecommended).toBe(true);

    const repaired = await repairStorageHealth(competition);
    expect(repaired.checks.find(check => check.id === 'primary-record')?.level).toBe('ok');
    expect(repaired.checks.find(check => check.id === 'backup-record')?.level).toBe('ok');
  });
});

describe('prepareStoredRecord', () => {
  it('returns null for empty storage slots', () => {
    expect(prepareStoredRecord(null)).toBeNull();
    expect(prepareStoredRecord(undefined)).toBeNull();
    expect(prepareStoredRecord('')).toBeNull();
  });

  it('separates migratable legacy records from corrupt payloads', () => {
    const competition = createNewCompetition('Prepare record');
    const legacy = prepareStoredRecord(JSON.stringify({
      version: 4,
      savedAt: '2026-01-01T00:00:00.000Z',
      data: competition,
    }));
    expect(legacy?.status).toBe('migratable');
    expect(legacy?.competition?.id).toBe(competition.id);

    const current = prepareStoredRecord(JSON.stringify({
      version: CURRENT_STORAGE_VERSION,
      savedAt: '2026-01-01T00:00:00.000Z',
      data: competition,
    }));
    expect(current?.status).toBe('ok');

    expect(prepareStoredRecord('not json')?.status).toBe('corrupt');
    expect(prepareStoredRecord('{"version":999,"data":{}}')?.status).toBe('corrupt');
  });
});
