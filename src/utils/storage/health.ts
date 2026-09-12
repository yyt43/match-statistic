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
  saveCompetition,
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
  stats: {
    indexedDbAvailable: boolean;
    currentBytes: number;
    snapshotCount: number;
    auditCount: number;
    lastSavedAt: string | null;
  };
}

interface StoredRecord {
  source: 'indexeddb-main' | 'indexeddb-backup' | 'local-main' | 'local-backup';
  savedAt: string | null;
  valid: boolean;
}

function levelWeight(level: StorageHealthLevel): number {
  return level === 'error' ? 2 : level === 'warning' ? 1 : 0;
}

function parseRecord(raw: unknown, source: StoredRecord['source']): StoredRecord | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    const envelope = parsed as { savedAt?: unknown; data?: unknown };
    const data = envelope.data ?? parsed;
    const validation = validateCompetitionData(data);
    return {
      source,
      savedAt: typeof envelope.savedAt === 'string' ? envelope.savedAt : null,
      valid: validation.success,
    };
  } catch {
    return {
      source,
      savedAt: null,
      valid: false,
    };
  }
}

function readLocalRecord(key: string, source: StoredRecord['source']): StoredRecord | null {
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

  const validPrimary = records.find(record =>
    record.valid && (record.source === 'indexeddb-main' || record.source === 'local-main')
  );
  const validBackup = records.find(record =>
    record.valid && (record.source === 'indexeddb-backup' || record.source === 'local-backup')
  );
  checks.push({
    id: 'primary-record',
    level: validPrimary ? 'ok' : 'error',
    title: { zh: '主数据记录', en: 'Primary data record' },
    detail: validPrimary
      ? {
          zh: `已从 ${validPrimary.source} 读取到有效记录。`,
          en: `Valid record found in ${validPrimary.source}.`,
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
      ? {
          zh: `已从 ${validBackup.source} 读取到有效记录。`,
          en: `Valid record found in ${validBackup.source}.`,
        }
      : {
          zh: '未找到有效备份；修复后会同时重写主记录和备份。',
          en: 'No valid backup was found. Repair rewrites both primary and backup records.',
        },
  });

  const indexedDbMain = records.find(record => record.source === 'indexeddb-main');
  const localMirror = records.find(record => record.source === 'local-main');
  if (indexedDbMain && localMirror && indexedDbMain.valid && localMirror.valid) {
    const drift = Math.abs(timestamp(indexedDbMain.savedAt) - timestamp(localMirror.savedAt));
    checks.push({
      id: 'mirror-consistency',
      level: drift <= 2000 ? 'ok' : 'warning',
      title: { zh: '双存储一致性', en: 'Mirror consistency' },
      detail: drift <= 2000
        ? {
            zh: 'IndexedDB 与 localStorage 保存时间一致。',
            en: 'IndexedDB and localStorage save times match.',
          }
        : {
            zh: '主存储与兼容镜像时间不一致，建议执行修复写入。',
            en: 'Primary storage and compatibility mirror are out of sync; rewrite is recommended.',
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
    level: snapshots.length > 0 || competition.groups.every(group => group.currentRound === 0)
      ? 'ok'
      : 'warning',
    title: { zh: '自动快照', en: 'Automatic snapshots' },
    detail: snapshots.length > 0
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
    level: storageStatus.status === 'ok' ? 'ok' : storageStatus.status === 'error' ? 'error' : 'warning',
    title: { zh: '最近保存状态', en: 'Last persistence status' },
    detail: storageStatus.status === 'ok'
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

  return {
    checkedAt: new Date().toISOString(),
    level,
    checks,
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
  await saveSnapshot(competition, snapshotLabel, { replaceSameLabel: true });
  saveCompetition(competition);
  await flushStorage();
  return inspectStorageHealth(competition);
}
