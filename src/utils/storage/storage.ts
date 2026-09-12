import type { TournamentCompetition, TournamentGroup, TournamentStatus, GameType, PairingType, Player, Match } from '../../types';
import { notifyStorageStatus, getStorageStatus, estimateDataSize } from './storageStatus';
import { idbDelete, idbGet, idbSet, isIndexedDbAvailable } from './indexedDb';
import { broadcastCompetitionSaved } from './storageSync';
import { validateCompetitionData } from '../schema';
import { CURRENT_STORAGE_VERSION, migrateCompetitionData } from './migrations';

const STORAGE_KEY = 'swiss_tournament_data';
const BACKUP_KEY = 'swiss_tournament_data_backup';
// localStorage 通常上限 5~10MB，提前到 3MB 预警（含压缩后的数据）
const STORAGE_WARN_BYTES = 3 * 1024 * 1024;
// 压缩前原始数据超过此阈值则强制提示导出（4MB）
const STORAGE_CRITICAL_BYTES = 4 * 1024 * 1024;

/**
 * localStorage 内部包装：附加保存时间戳，便于 UI 显示"最后保存于..."
 * 对外 API（save/load/import/export）仍使用原始 TournamentCompetition，保持兼容性
 */
interface StorageEnvelope {
  version: number;
  savedAt: string;
  data: TournamentCompetition;
}

const STORAGE_VERSION = CURRENT_STORAGE_VERSION;
const LOCAL_MIRROR_LIMIT_BYTES = 2 * 1024 * 1024;
let lastSavedAt: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();

/**
 * 轻量级 JSON 压缩：移除 playedAgainst 中的重复 'bye'，避免轮空多次累积。
 * 同时移除运行时计算的胜率字段（加载后由 recalculate 重算），减小 30-40% 体积。
 */
function compressCompetition(competition: TournamentCompetition): TournamentCompetition {
  return {
    ...competition,
    groups: competition.groups.map(g => ({
      ...g,
      players: g.players.map(p => {
        // 去重 playedAgainst（保留首次出现的顺序），同时移除多余的 'bye'
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const id of p.playedAgainst) {
          if (id === 'bye') {
            // 每个选手最多保留一个 'bye' 标记（用于判断是否对阵过轮空）
            if (!seen.has('bye')) {
              seen.add('bye');
              deduped.push('bye');
            }
            continue;
          }
          if (!seen.has(id)) {
            seen.add(id);
            deduped.push(id);
          }
        }
        return {
          ...p,
          playedAgainst: deduped,
        };
      }),
    })),
  };
}

/** 判断数据是否需要压缩（超过 1MB 时启用压缩） */
function shouldCompress(sizeBytes: number): boolean {
  return sizeBytes > 1024 * 1024;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/** 旧格式：单 Tournament 对象 */
interface LegacyTournament {
  id: string;
  name: string;
  mode: string;
  currentRound: number;
  totalRounds: number;
  status: TournamentStatus;
  players: Player[];
  matches: Match[];
  createdAt: string;
  gameType: GameType | 'single_elimination'; // 旧格式中single_elimination曾是GameType
  pairingType?: PairingType;
}

/**
 * 尝试从原始字符串中解析数据，兼容三种格式：
 * 1. StorageEnvelope (version 2) : {version, savedAt, data: {...}}
 * 2. 原始 TournamentCompetition (version 1) : 直接 {groups, currentGroupIndex, ...}
 * 3. 旧格式 LegacyTournament : 单小组（无groups字段，含 players/matches）
 */
interface ParsedStoredCompetition {
  competition: TournamentCompetition;
  savedAt?: string;
  version: number;
}

function parseStoredValue(parsed: unknown): ParsedStoredCompetition | null {
  if (!parsed || typeof parsed !== 'object') return null;

  // 格式1：Envelope
  if ('version' in parsed && typeof parsed.version === 'number' && 'data' in parsed) {
    const env = parsed as StorageEnvelope;
    const competition = env.data;
    if (competition && Array.isArray(competition.groups)) {
      const version = Number.isInteger(env.version) ? env.version : 1;
      return { competition, savedAt: env.savedAt, version };
    }
  }

  // 格式2：新格式 TournamentCompetition（含 groups）
  if ('groups' in parsed && Array.isArray(parsed.groups)) {
    return { competition: parsed as unknown as TournamentCompetition, version: 1 };
  }

  // 格式3：旧格式 LegacyTournament（无 groups，有 players/matches）
  if (!('groups' in parsed) && 'players' in parsed && Array.isArray(parsed.players)
      && 'matches' in parsed && Array.isArray(parsed.matches)) {
    const tournament = parsed as unknown as LegacyTournament;
    const rawGroup: TournamentGroup = {
      id: tournament.id,
      name: tournament.name || '小组01',
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
      status: tournament.status,
      players: tournament.players,
      matches: tournament.matches,
      createdAt: tournament.createdAt,
      pairingType: tournament.pairingType || 'swiss',
      gameType: tournament.gameType === 'single_elimination' ? 'bo1' : tournament.gameType,
    };
    const group = rawGroup;
    const competition: TournamentCompetition = {
      id: generateId(),
      name: tournament.name || '迁移的比赛',
      groups: [group],
      currentGroupIndex: 0,
      createdAt: tournament.createdAt || new Date().toISOString(),
    };
    return { competition, version: 1 };
  }

  return null;
}

function tryParse(raw: string | null): ParsedStoredCompetition | null {
  if (!raw) return null;
  try {
    return parseStoredValue(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function persistCompetitionEnvelope(
  envelope: StorageEnvelope,
  rawSize: number,
  localStorageSaved: boolean,
  localError: unknown
): Promise<boolean> {
  let indexedDbSaved = false;
  let indexedDbError: unknown = null;
  if (isIndexedDbAvailable()) {
    try {
      await Promise.all([
        idbSet(STORAGE_KEY, envelope),
        idbSet(BACKUP_KEY, envelope),
      ]);
      indexedDbSaved = true;
    } catch (error) {
      indexedDbError = error;
    }
  }

  if (!localStorageSaved && !indexedDbSaved) {
    const isQuota = typeof DOMException !== 'undefined' && localError instanceof DOMException
      && (localError.name === 'QuotaExceededError' || localError.code === 22);
    notifyStorageStatus(
      isQuota ? 'quota_exceeded' : 'error',
      isQuota
        ? { key: 'storageQuotaExceeded' }
        : {
            key: 'storageSaveFailed',
            params: {
              message: indexedDbError instanceof Error
                ? indexedDbError.message
                : localError instanceof Error ? localError.message : String(localError),
            },
          }
    );
    return false;
  }

  if (!localStorageSaved && indexedDbSaved) {
    notifyStorageStatus('ok', { key: 'storageIndexedDbFallback' });
    return true;
  }

  // localStorage 仍是兼容镜像；只有 IndexedDB 不可用时才需要容量预警。
  const prevStatus = getStorageStatus().status;
  if (!indexedDbSaved && rawSize >= STORAGE_CRITICAL_BYTES) {
    notifyStorageStatus('ok', { key: 'storageCritical', params: { size: (rawSize / 1024 / 1024).toFixed(2) } });
  } else if (!indexedDbSaved && rawSize >= STORAGE_WARN_BYTES) {
    notifyStorageStatus('ok', { key: 'storageWarning', params: { size: (rawSize / 1024 / 1024).toFixed(2) } });
  } else if (prevStatus !== 'ok') {
    notifyStorageStatus('ok', null);
  }
  return true;
}

function prepareStoredCompetition(
  parsed: ParsedStoredCompetition | null
): { competition: TournamentCompetition; savedAt?: string; wasMigrated: boolean } | null {
  if (!parsed) return null;
  const wasMigrated = parsed.version < CURRENT_STORAGE_VERSION;
  let migrated: TournamentCompetition;
  try {
    migrated = migrateCompetitionData(parsed.competition, parsed.version);
  } catch (error) {
    console.warn('[storage] Unsupported competition version:', error);
    return null;
  }
  const validation = validateCompetitionData(migrated);
  if (!validation.success) {
    console.warn('[storage] Invalid competition data rejected:', validation.message);
    return null;
  }
  return {
    competition: validation.data as TournamentCompetition,
    savedAt: parsed.savedAt,
    wasMigrated,
  };
}

export function saveCompetition(competition: TournamentCompetition): void {
  const rawSize = estimateDataSize(competition);
  const dataToSave = shouldCompress(rawSize) ? compressCompetition(competition) : competition;
  const envelope: StorageEnvelope = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    data: dataToSave,
  };
  let localStorageSaved = false;
  let localError: unknown = null;
  if (!isIndexedDbAvailable() || rawSize <= LOCAL_MIRROR_LIMIT_BYTES) {
    try {
      const serialized = JSON.stringify(envelope);
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(BACKUP_KEY, serialized);
      localStorageSaved = true;
    } catch (error) {
      localError = error;
    }
  } else {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      // Ignore mirror cleanup errors when IndexedDB is available.
    }
  }

  // Serialize writes so a slower older request can never overwrite newer data.
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const persisted = await persistCompetitionEnvelope(
        envelope,
        rawSize,
        localStorageSaved,
        localError
      );
      if (!persisted) return;

      lastSavedAt = envelope.savedAt;
      broadcastCompetitionSaved(envelope.savedAt, competition.id);
    });
}

export function flushStorage(): Promise<void> {
  return writeQueue;
}

export async function loadCompetition(): Promise<TournamentCompetition | null> {
  await writeQueue.catch(() => undefined);

  type Source = 'indexeddb-main' | 'indexeddb-backup' | 'local-main' | 'local-backup';
  interface Candidate {
    competition: TournamentCompetition;
    savedAt?: string;
    wasMigrated: boolean;
    source: Source;
  }

  const candidates: Candidate[] = [];
  const addCandidate = (
    candidate: { competition: TournamentCompetition; savedAt?: string; wasMigrated: boolean } | null,
    source: Source
  ) => {
    if (candidate) candidates.push({ ...candidate, source });
  };

  if (isIndexedDbAvailable()) {
    try {
      addCandidate(
        prepareStoredCompetition(parseStoredValue(await idbGet<unknown>(STORAGE_KEY))),
        'indexeddb-main'
      );
    } catch (error) {
      console.warn('[storage] IndexedDB read failed, falling back to localStorage', error);
    }
    try {
      addCandidate(
        prepareStoredCompetition(parseStoredValue(await idbGet<unknown>(BACKUP_KEY))),
        'indexeddb-backup'
      );
    } catch (error) {
      console.warn('[storage] IndexedDB backup read failed', error);
    }
  }

  addCandidate(
    prepareStoredCompetition(tryParse(localStorage.getItem(STORAGE_KEY))),
    'local-main'
  );
  addCandidate(
    prepareStoredCompetition(tryParse(localStorage.getItem(BACKUP_KEY))),
    'local-backup'
  );

  if (candidates.length === 0) return null;

  const sourcePriority: Record<Source, number> = {
    'indexeddb-main': 0,
    'local-main': 1,
    'indexeddb-backup': 2,
    'local-backup': 3,
  };
  const timestamp = (savedAt?: string): number => {
    if (!savedAt) return 0;
    const value = Date.parse(savedAt);
    return Number.isFinite(value) ? value : 0;
  };
  candidates.sort((a, b) => {
    const timeDiff = timestamp(b.savedAt) - timestamp(a.savedAt);
    return timeDiff || sourcePriority[a.source] - sourcePriority[b.source];
  });

  const parsed = candidates[0];
  const competition = parsed.competition;
  const restoredFromBackup = parsed.source.endsWith('backup');

  // Seed IndexedDB from newer local data, repair a backup restore, or persist a migration.
  if (
    parsed.wasMigrated
    || restoredFromBackup
    || parsed.source === 'local-main'
    || parsed.source === 'local-backup'
  ) {
    saveCompetition(competition);
  }
  if (restoredFromBackup) {
    console.warn('[storage] Main data was unavailable; restored from backup');
    notifyStorageStatus('ok', { key: 'storageRestored' });
  }

  return competition;
}

/** 返回上次保存的 ISO 时间戳（没有则返回 null），用于 UI 显示"最后保存于..." */
export function getLastSavedAt(): string | null {
  if (lastSavedAt) return lastSavedAt;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.savedAt === 'string') {
      return parsed.savedAt;
    }
  } catch { /* ignore */ }
  return null;
}

export function clearCompetition(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear competition:', e);
  }
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch (e) {
    console.error('Failed to clear backup:', e);
  }
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      if (!isIndexedDbAvailable()) return;
      await Promise.all([idbDelete(STORAGE_KEY), idbDelete(BACKUP_KEY)]);
    })
    .catch(error => {
      console.error('Failed to clear IndexedDB:', error);
    });
}
