import { describe, expect, it } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';
import { CURRENT_STORAGE_VERSION } from '../storage/migrations';
import { importCompetitionFromFile } from '../export/fileStorage';
import {
  APP_VERSION,
  BackupImportError,
  MAX_IMPORT_FILE_BYTES,
  assertImportFileSize,
  prepareImportedCompetition,
  prepareImportedCompetitionText,
  serializeCompetitionBackup,
  type BackupImportErrorCode,
} from './competitionBackup';

type LooseRecord = Record<string, unknown>;

function omit(record: LooseRecord, keys: string[]): LooseRecord {
  const copy: LooseRecord = { ...record };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

function cloneAsRecord(value: unknown): LooseRecord {
  return JSON.parse(JSON.stringify(value)) as LooseRecord;
}

/** 构造旧版（version 1）裸数据：缺少后续迁移才会补上的字段。 */
function createLegacyV1Competition(): LooseRecord {
  const competition = createNewCompetition('旧版备份', 1, 8, 3, 'bo3');
  const legacy = omit(cloneAsRecord(competition), [
    'createdAt',
    'currentGroupIndex',
    'playerSchemaId',
    'playerFields',
  ]);
  legacy.groups = (legacy.groups as LooseRecord[]).map(group => omit(group, [
    'pairingType',
    'gameType',
    'roundGameTypes',
    'tiebreakTemplate',
    'tiebreakRules',
  ]));
  return legacy;
}

function expectBackupError(
  action: () => unknown,
  code: BackupImportErrorCode
): BackupImportError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BackupImportError);
    const backupError = error as BackupImportError;
    expect(backupError.code).toBe(code);
    return backupError;
  }
  throw new Error(`Expected BackupImportError("${code}") but nothing was thrown.`);
}

describe('competitionBackup', () => {
  const currentCompetition = createNewCompetition('备份测试', 1, 8, 3, 'bo3');

  it('exports an envelope and round-trips it through import', () => {
    const text = serializeCompetitionBackup(currentCompetition);
    const envelope = JSON.parse(text) as LooseRecord;

    expect(envelope.formatVersion).toBe(CURRENT_STORAGE_VERSION);
    expect(envelope.appVersion).toBe(APP_VERSION);
    expect(typeof envelope.exportedAt).toBe('string');
    expect(new Date(envelope.exportedAt as string).toString()).not.toBe('Invalid Date');
    expect(envelope.data).toEqual(currentCompetition);

    expect(prepareImportedCompetitionText(text)).toEqual(currentCompetition);
  });

  it('migrates a bare legacy competition that has no version field', () => {
    const legacy = createLegacyV1Competition();
    const restored = prepareImportedCompetition(legacy);

    expect(restored.id).toBe(legacy.id);
    expect(typeof restored.createdAt).toBe('string');
    expect(restored.currentGroupIndex).toBe(0);
    expect(restored.playerSchemaId).toBe('generic');
    expect(restored.playerFields?.length).toBeGreaterThan(0);

    const group = restored.groups[0];
    expect(group.gameType).toBe('bo1');
    expect(group.pairingType).toBe('swiss');
    expect(group.tiebreakTemplate).toBeDefined();
    expect(group.tiebreakRules?.length).toBeGreaterThan(0);
    expect(group.roundGameTypes).toHaveLength(group.totalRounds);
  });

  it('migrates a legacy storage envelope ({ version, savedAt, data })', () => {
    const legacy = createLegacyV1Competition();
    const restored = prepareImportedCompetition({
      version: 1,
      savedAt: new Date().toISOString(),
      data: legacy,
    });

    expect(restored.id).toBe(legacy.id);
    expect(restored.groups[0].pairingType).toBe('swiss');
  });

  it('rejects backups created by a newer app version', () => {
    const error = expectBackupError(
      () => prepareImportedCompetition({
        formatVersion: CURRENT_STORAGE_VERSION + 1,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        data: currentCompetition,
      }),
      'unsupported-version'
    );
    expect(error.detail).toBe(`${CURRENT_STORAGE_VERSION + 1} > ${CURRENT_STORAGE_VERSION}`);
  });

  it('rejects unrecognized root values', () => {
    expectBackupError(() => prepareImportedCompetition(null), 'invalid-format');
    expectBackupError(() => prepareImportedCompetition([]), 'invalid-format');
    expectBackupError(() => prepareImportedCompetition({ foo: 'bar' }), 'invalid-format');
    expectBackupError(
      () => prepareImportedCompetition({ formatVersion: 0, appVersion: APP_VERSION, exportedAt: '', data: {} }),
      'invalid-format'
    );
  });

  it('reports invalid JSON as a readable BackupImportError', () => {
    const error = expectBackupError(
      () => prepareImportedCompetitionText('{ "id": "broken", '),
      'invalid-json'
    );
    expect(error).not.toBeInstanceOf(SyntaxError);
    expect(error.message).toContain('not valid JSON');
  });

  it('reports schema violations with validation details', () => {
    const error = expectBackupError(
      () => prepareImportedCompetition({
        formatVersion: CURRENT_STORAGE_VERSION,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        data: { id: 'x', name: 'y', createdAt: new Date().toISOString(), groups: [] },
      }),
      'invalid-data'
    );
    expect(error.detail).toContain('groups');
  });

  it('enforces the file size limit', () => {
    expect(() => assertImportFileSize(MAX_IMPORT_FILE_BYTES)).not.toThrow();
    const error = expectBackupError(
      () => assertImportFileSize(MAX_IMPORT_FILE_BYTES + 1),
      'too-large'
    );
    expect(error.message).toContain(String(MAX_IMPORT_FILE_BYTES));
  });

  it('imports a real File through the main-thread fallback', async () => {
    const file = new File(
      [serializeCompetitionBackup(currentCompetition)],
      'backup.json',
      { type: 'application/json' }
    );
    const restored = await importCompetitionFromFile(file);
    expect(restored).toEqual(currentCompetition);
  });

  it('reports invalid JSON from a File without throwing a raw SyntaxError', async () => {
    const file = new File(['{ "id": "broken", '], 'broken.json', { type: 'application/json' });
    await expect(importCompetitionFromFile(file)).rejects.toMatchObject({
      name: 'BackupImportError',
      code: 'invalid-json',
    });
  });

  it('rejects an oversized File before reading it', async () => {
    const oversized = { size: MAX_IMPORT_FILE_BYTES + 1 } as unknown as File;
    await expect(importCompetitionFromFile(oversized)).rejects.toMatchObject({ code: 'too-large' });
  });

  it('honors an already-aborted signal', async () => {
    const file = new File(
      [serializeCompetitionBackup(currentCompetition)],
      'backup.json',
      { type: 'application/json' }
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      importCompetitionFromFile(file, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
