import type { TournamentCompetition } from '../../types';
import { validateCompetitionData } from '../schema';
import { listAuditEntries } from '../auditLog';
import { estimateDataSize, getStorageStatus } from './storageStatus';
import { idbGet, isIndexedDbAvailable } from './indexedDb';
import { listSnapshots, saveSnapshot } from './snapshot';
import {
  BACKUP_KEY,
  STORAGE_KEY,
  flushStorage,
  prepareStoredRecord,
  saveCompetition,
  type StoredRecordStatus,
} from './storage';

export type StorageHealthLevel = 'ok' | 'warning' | 'error';

export interface StorageHealthCheck {
  id: string;
  level: StorageHealthLevel;
  title: { zh: string; en: string };
  detail: { zh: string; en: string };
}

export interface StorageHealthReport {
  checkedAt: string;
  level: StorageHealthLevel;
  checks: StorageHealthCheck[];
  /**
   * 是否建议执行"重写存储"：仅在存在损坏记录或可确认的镜像不一致时为 true。
   * 仅发现旧版本（可迁移）记录时保持 false —— 加载路径会自动迁移，无需重写。
   */
  repairRecommended: boolean;
  stats: {
    indexedDbAvailable: boolean;
    currentBytes: number;
    snapshotCount: number;
    auditCount: number;
    lastSavedAt: string | null;
  };
}

type StoredRecordSource =
  | 'indexeddb-main'
  | 'indexeddb-backup'
  | 'local-main'
  | 'local-backup';

interface StoredRecord {
  source: StoredRecordSource;
  savedAt: string | null;
  status: StoredRecordStatus;
}

function levelWeight(level: StorageHealthLevel): number {
  return level === 'error' ? 2 : level === 'warning' ? 1 : 0;
}

function isReadableRecord(record: StoredRecord): boolean {
  return record.status !== 'corrupt';
}

/**
 * 复用加载路径的"迁移 + 校验"结果，把旧版本记录标为 migratable 而不是无效。
 */
function parseRecord(raw: unknown, source: StoredRecordSource): StoredRecord | null {
  const prepared = prepareStoredRecord(raw);
  if (!prepared) return null;
  return {
    source,
    savedAt: prepared.savedAt ?? null,
    status: prepared.status,
  };
}

function readLocalRecord(key: string, source: StoredRecordSource): StoredRecord | null {
  try {
    return parseRecord(localStorage.getItem(key), source);
  } catch {
    return null;
  }
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readableRecordDetail(
  record: StoredRecord,
  platform: 'primary' | 'backup'
): { zh: string; en: string } {
  if (record.status === 'migratable') {
    return {
      zh: `已在 ${record.source} 读取到旧版本记录；打开赛事时会自动迁移，不属于损坏。`,
      en: `A legacy record was read from ${record.source}; it will be migrated when the event is opened and is not corrupt.`,
    };
  }
  return {
    zh: `已从 ${record.source} 读取到有效${platform === 'primary' ? '主' : '备'}记录。`,
    en: `Valid ${platform} record found in ${record.source}.`,
  };
}

export async function inspectStorageHealth(
  competition: TournamentCompetition
): Promise<StorageHealthReport> {
  const checks: StorageHealthCheck[] = [];
  const indexedDbAvailable = isIndexedDbAvailable();
  const records: StoredRecord[] = [];

  const currentValidation = validateCompetitionData(competition);
  checks.push({
    id: 'current-schema',
    level: currentValidation.success ? 'ok' : 'error',
    title: { zh: '当前赛事数据', en: 'Current tournament data' },
    detail: currentValidation.success
      ? { zh: '结构与字段校验通过。', en: 'Structure and field validation passed.' }
      : { zh: currentValidation.message, en: currentValidation.message },
  });

  if (indexedDbAvailable) {
    try {
      const main = parseRecord(await idbGet<unknown>(STORAGE_KEY), 'indexeddb-main');
      const backup = parseRecord(await idbGet<unknown>(BACKUP_KEY), 'indexeddb-backup');
      if (main) records.push(main);
      if (backup) records.push(backup);
    } catch (error) {
      checks.push({
        id: 'indexeddb-read',
        level: 'error',
        title: { zh: 'IndexedDB 读取', en: 'IndexedDB read' },
        detail: {
          zh: error instanceof Error ? error.message : String(error),
          en: error instanceof Error ? error.message : String(error),
        },
      });
    }
  } else {
    checks.push({
      id: 'indexeddb-read',
      level: 'warning',
      title: { zh: 'IndexedDB 可用性', en: 'IndexedDB availability' },
      detail: {
        zh: '当前浏览器不可用 IndexedDB，正在使用 localStorage 回退。',
        en: 'IndexedDB is unavailable; localStorage fallback is active.',
      },
    });
  }

  const localMain = readLocalRecord(STORAGE_KEY, 'local-main');
  const localBackup = readLocalRecord(BACKUP_KEY, 'local-backup');
  if (localMain) records.push(localMain);
  if (localBackup) records.push(localBackup);

  const validPrimary = records.find(
    record =>
      isReadableRecord(record) &&
      (record.source === 'indexeddb-main' || record.source === 'local-main')
  );
  const validBackup = records.find(
    record =>
      isReadableRecord(record) &&
      (record.source === 'indexeddb-backup' || record.source === 'local-backup')
  );
  const corruptPrimary = records.find(
    record =>
      !isReadableRecord(record) &&
      (record.source === 'indexeddb-main' || record.source === 'local-main')
  );
  const corruptBackup = records.find(
    record =>
      !isReadableRecord(record) &&
      (record.source === 'indexeddb-backup' || record.source === 'local-backup')
  );
  const migratableRecords = records.filter(record => record.status === 'migratable');
  const corruptRecords = records.filter(record => !isReadableRecord(record));

  checks.push({
    id: 'primary-record',
    level: validPrimary ? 'ok' : 'error',
    title: { zh: '主数据记录', en: 'Primary data record' },
    detail: validPrimary
      ? readableRecordDetail(validPrimary, 'primary')
      : corruptPrimary
        ? {
            zh: `发现 ${corruptPrimary.source} 记录但无法解析或校验；已保留原样，不会被内存状态覆盖。`,
            en: `A record exists in ${corruptPrimary.source} but cannot be parsed or validated; it is left untouched and is never overwritten with in-memory state.`,
          }
        : {
            zh: '未找到有效的主数据记录。',
            en: 'No valid primary data record was found.',
          },
  });
  checks.push({
    id: 'backup-record',
    level: validBackup ? 'ok' : 'warning',
    title: { zh: '备份数据记录', en: 'Backup data record' },
    detail: validBackup
      ? readableRecordDetail(validBackup, 'backup')
      : corruptBackup
        ? {
            zh: `发现 ${corruptBackup.source} 备份记录但无法解析或校验；已保留原样。`,
            en: `A backup record exists in ${corruptBackup.source} but cannot be parsed or validated; it is left untouched.`,
          }
        : {
            zh: '未找到有效备份；修复后会同时重写主记录和备份。',
            en: 'No valid backup was found. Repair rewrites both primary and backup records.',
          },
  });

  const sourceList = (list: StoredRecord[]): string => list.map(record => record.source).join('、');
  checks.push({
    id: 'record-versions',
    level: 'ok',
    title: { zh: '存储记录版本', en: 'Stored record versions' },
    detail:
      migratableRecords.length > 0
        ? {
            zh: `发现 ${migratableRecords.length} 份旧版本记录（${sourceList(migratableRecords)}），打开赛事时会自动迁移；不会按损坏处理。`,
            en: `${migratableRecords.length} legacy record(s) (${migratableRecords
              .map(record => record.source)
              .join(', ')}) will be migrated automatically when the event is opened; they are not treated as corrupt.`,
          }
        : {
            zh: '所有已存记录均为当前版本。',
            en: 'All stored records use the current version.',
          },
  });

  let mirrorDrift = false;
  const indexedDbMain = records.find(record => record.source === 'indexeddb-main');
  const localMirror = records.find(record => record.source === 'local-main');
  if (
    indexedDbMain &&
    localMirror &&
    isReadableRecord(indexedDbMain) &&
    isReadableRecord(localMirror)
  ) {
    const drift = Math.abs(timestamp(indexedDbMain.savedAt) - timestamp(localMirror.savedAt));
    mirrorDrift = drift > 2000;
    checks.push({
      id: 'mirror-consistency',
      level: mirrorDrift ? 'warning' : 'ok',
      title: { zh: '双存储一致性', en: 'Mirror consistency' },
      detail: mirrorDrift
        ? {
            zh: '主存储与兼容镜像时间不一致，建议执行修复写入。',
            en: 'Primary storage and compatibility mirror are out of sync; rewrite is recommended.',
          }
        : {
            zh: 'IndexedDB 与 localStorage 保存时间一致。',
            en: 'IndexedDB and localStorage save times match.',
          },
    });
  } else if (indexedDbAvailable && !localMirror) {
    checks.push({
      id: 'mirror-consistency',
      level: 'ok',
      title: { zh: '双存储一致性', en: 'Mirror consistency' },
      detail: {
        zh: '当前数据较大或仅使用 IndexedDB，未保留 localStorage 镜像。',
        en: 'The data is large or IndexedDB-only, so no localStorage mirror is retained.',
      },
    });
  }

  const snapshots = await listSnapshots();
  checks.push({
    id: 'snapshots',
    level:
      snapshots.length > 0 || competition.groups.every(group => group.currentRound === 0)
        ? 'ok'
        : 'warning',
    title: { zh: '自动快照', en: 'Automatic snapshots' },
    detail:
      snapshots.length > 0
        ? {
            zh: `共 ${snapshots.length} 份，最新保存于 ${snapshots[0]?.savedAt ?? '未知时间'}。`,
            en: `${snapshots.length} available; latest at ${snapshots[0]?.savedAt ?? 'unknown time'}.`,
          }
        : {
            zh: '当前没有可用快照。',
            en: 'No snapshots are currently available.',
          },
  });

  const auditEntries = await listAuditEntries();
  checks.push({
    id: 'audit',
    level: 'ok',
    title: { zh: '操作审计', en: 'Audit log' },
    detail: {
      zh: `共 ${auditEntries.length} 条本地操作记录。`,
      en: `${auditEntries.length} local audit entries.`,
    },
  });

  const currentBytes = estimateDataSize(competition);
  const storageStatus = getStorageStatus();
  checks.push({
    id: 'storage-status',
    level:
      storageStatus.status === 'ok'
        ? 'ok'
        : storageStatus.status === 'error'
          ? 'error'
          : 'warning',
    title: { zh: '最近保存状态', en: 'Last persistence status' },
    detail:
      storageStatus.status === 'ok'
        ? {
            zh: '最近一次持久化没有报告错误。',
            en: 'The latest persistence operation reported no errors.',
          }
        : {
            zh: storageStatus.notice?.key ?? '存储层报告异常。',
            en: storageStatus.notice?.key ?? 'The storage layer reported an issue.',
          },
  });

  const level = checks.reduce<StorageHealthLevel>(
    (current, check) =>
      levelWeight(check.level) > levelWeight(current) ? check.level : current,
    'ok'
  );

  // 只有"损坏或可确认的镜像漂移"才建议重写；仅有可迁移记录时不动现有数据。
  const repairRecommended =
    (corruptRecords.length > 0 || !validPrimary || !validBackup || mirrorDrift) &&
    (corruptRecords.length > 0 || migratableRecords.length === 0);

  return {
    checkedAt: new Date().toISOString(),
    level,
    checks,
    repairRecommended,
    stats: {
      indexedDbAvailable,
      currentBytes,
      snapshotCount: snapshots.length,
      auditCount: auditEntries.length,
      lastSavedAt: validPrimary?.savedAt ?? null,
    },
  };
}

export async function repairStorageHealth(
  competition: TournamentCompetition,
  snapshotLabel = '存储体检修复前'
): Promise<StorageHealthReport> {
  const before = await inspectStorageHealth(competition);
  if (!before.repairRecommended) {
    return before;
  }
  await saveSnapshot(competition, snapshotLabel, { replaceSameLabel: true });
  saveCompetition(competition);
  await flushStorage();
  return inspectStorageHealth(competition);
}
