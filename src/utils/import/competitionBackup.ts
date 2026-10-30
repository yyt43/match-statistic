import type { TournamentCompetition } from '../../types';
import { validateCompetitionData } from '../schema';
import { CURRENT_STORAGE_VERSION, migrateCompetitionData } from '../storage/migrations';

/** 导入文件大小上限：超过后直接拒绝，不做读取和解析，避免大文件卡死页面。 */
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

/** 解析超时时间：超时后终止 Worker，界面可重新选择文件。 */
export const IMPORT_TIMEOUT_MS = 30_000;

/**
 * 备份信封的 formatVersion 与本地存储数据版本保持一致，
 * 这样导入时可以直接复用同一条迁移链，不需要维护两套版本号。
 */
export const COMPETITION_BACKUP_FORMAT_VERSION = CURRENT_STORAGE_VERSION;

/** 导出时写入的应用版本，发版时与 package.json 的 version 保持一致。 */
export const APP_VERSION = '0.6.3';

export type BackupImportErrorCode =
  | 'too-large'
  | 'invalid-json'
  | 'invalid-format'
  | 'unsupported-version'
  | 'invalid-data'
  | 'timeout'
  | 'aborted'
  | 'worker-unavailable'
  | 'read-failed'
  | 'internal';

/** 导入失败的结构化错误：code 供 UI 映射双语文案，detail 保存版本号/校验细节。 */
export class BackupImportError extends Error {
  readonly code: BackupImportErrorCode;
  readonly detail?: string;

  constructor(code: BackupImportErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'BackupImportError';
    this.code = code;
    this.detail = detail;
  }
}

/** 导出文件的外层信封：data 是完整的赛事对象。 */
export interface CompetitionBackupEnvelope {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  data: TournamentCompetition;
}

/** 跨 Worker 传递的错误载荷（结构化克隆只接受纯对象）。 */
export interface BackupImportErrorPayload {
  code: BackupImportErrorCode;
  message: string;
  detail?: string;
}

export function buildCompetitionBackup(
  competition: TournamentCompetition
): CompetitionBackupEnvelope {
  return {
    formatVersion: COMPETITION_BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: competition,
  };
}

/** 生成可直接写入 Blob 的备份文本。 */
export function serializeCompetitionBackup(competition: TournamentCompetition): string {
  return JSON.stringify(buildCompetitionBackup(competition), null, 2);
}

export function assertImportFileSize(size: number): void {
  if (size > MAX_IMPORT_FILE_BYTES) {
    throw new BackupImportError(
      'too-large',
      `Backup file is ${size} bytes, which exceeds the ${MAX_IMPORT_FILE_BYTES} bytes limit.`
    );
  }
}

export function toBackupImportErrorPayload(error: unknown): BackupImportErrorPayload {
  if (error instanceof BackupImportError) {
    return error.detail === undefined
      ? { code: error.code, message: error.message }
      : { code: error.code, message: error.message, detail: error.detail };
  }
  if (error instanceof Error) {
    return { code: 'internal', message: error.message };
  }
  return { code: 'internal', message: String(error) };
}

export function restoreBackupImportError(payload: BackupImportErrorPayload): BackupImportError {
  return new BackupImportError(payload.code, payload.message, payload.detail);
}

export function prepareImportedCompetitionText(text: string): TournamentCompetition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new BackupImportError(
      'invalid-json',
      'Backup file is not valid JSON.',
      error instanceof Error ? error.message : undefined
    );
  }
  return prepareImportedCompetition(parsed);
}

/**
 * 把任意备份/旧格式数据迁移到当前版本并校验。
 * 支持三种输入：
 * 1. 新导出信封 { formatVersion, appVersion, exportedAt, data }
 * 2. 旧版本地存储信封 { version, savedAt, data }
 * 3. 旧版直接导出的裸 competition 对象 { groups, ... }
 */
export function prepareImportedCompetition(value: unknown): TournamentCompetition {
  const extracted = extractCompetition(value);
  if (extracted.version > CURRENT_STORAGE_VERSION) {
    throw new BackupImportError(
      'unsupported-version',
      `Backup version ${extracted.version} is newer than supported version ${CURRENT_STORAGE_VERSION}.`,
      `${extracted.version} > ${CURRENT_STORAGE_VERSION}`
    );
  }

  const migrated = migrateCompetitionData(
    extracted.data as unknown as TournamentCompetition,
    extracted.version
  );
  const validation = validateCompetitionData(migrated);
  if (!validation.success) {
    throw new BackupImportError(
      'invalid-data',
      'Tournament data failed validation.',
      validation.message
    );
  }
  return validation.data;
}

interface ExtractedCompetition {
  data: unknown;
  version: number;
}

function extractCompetition(value: unknown): ExtractedCompetition {
  const record = asRecord(value);
  if (!record) {
    throw new BackupImportError('invalid-format', 'Backup root must be an object.');
  }

  // 新信封与旧存储信封都有 data 字段；formatVersion 优先，兼容版本的 version。
  if ('data' in record && ('formatVersion' in record || 'version' in record)) {
    const version = readVersion(record.formatVersion ?? record.version);
    return { data: record.data, version };
  }

  // 旧版导出文件直接是 competition 对象：没有版本字段时按最初的存储版本 1 迁移。
  if (Array.isArray(record.groups)) {
    return {
      data: record,
      version: record.version === undefined ? 1 : readVersion(record.version),
    };
  }

  throw new BackupImportError('invalid-format', 'Unrecognized backup format.');
}

function readVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BackupImportError('invalid-format', 'Backup version must be a positive integer.');
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
