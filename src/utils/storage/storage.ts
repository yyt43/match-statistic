import type { TournamentCompetition, TournamentGroup, TournamentStatus, GameType, PairingType, Player, Match } from '../../types';
import { notifyStorageStatus, getStorageStatus, estimateDataSize } from './storageStatus';
import { idbDelete, idbGet, idbSet, isIndexedDbAvailable } from './indexedDb';
import { broadcastCompetitionSaved } from './storageSync';
import { validateCompetitionData } from '../schema';
import { CURRENT_STORAGE_VERSION, migrateCompetitionData } from './migrations';

export const STORAGE_KEY = 'swiss_tournament_data';
export const BACKUP_KEY = 'swiss_tournament_data_backup';
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
/**
 * 独立的轻量元信息 key：主数据超出 localStorage 镜像上限时会删掉镜像，
 * 但保存时间等元信息单独保留，避免"最后保存于..."丢失。
 */
export const META_KEY = 'swiss_tournament_data_meta';

interface StorageMeta {
  savedAt: string;
  competitionId: string;
  version: number;
}

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

/** 清掉 localStorage 里的主/备镜像（仅在 IndexedDB 确认落库后调用）。 */
function removeLocalMirrors(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore mirror cleanup errors when IndexedDB has the data.
  }
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // Ignore backup mirror cleanup errors.
  }
}

/** 保存时间等轻量元信息：localStorage 优先（同步可读），IndexedDB 作为镜像。 */
async function persistStorageMeta(meta: StorageMeta): Promise<void> {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // 元信息只用于展示，写不进 localStorage 时继续尝试 IndexedDB。
  }
  if (!isIndexedDbAvailable()) return;
  try {
    await idbSet(META_KEY, meta);
  } catch (error) {
    console.warn('[storage] Failed to persist save metadata', error);
  }
}

export function saveCompetition(competition: TournamentCompetition): void {
  const rawSize = estimateDataSize(competition);
  const dataToSave = shouldCompress(rawSize) ? compressCompetition(competition) : competition;
  const envelope: StorageEnvelope = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    data: dataToSave,
  };
  // 大数据走 IndexedDB，localStorage 只作为兜底（无 IndexedDB 时）。
  const useLocalMirror = !isIndexedDbAvailable() || rawSize <= LOCAL_MIRROR_LIMIT_BYTES;
  let localStorageSaved = false;
  let localError: unknown = null;
  if (useLocalMirror) {
    try {
      const serialized = JSON.stringify(envelope);
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(BACKUP_KEY, serialized);
      localStorageSaved = true;
    } catch (error) {
      localError = error;
    }
  }
  // 超过镜像上限时不再提前删除旧镜像：必须等 IndexedDB 事务真正提交后再删，
  // 否则写入失败或页面在异步写完成前关闭会把最后的可用数据一起丢掉。

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

      // IndexedDB 已确认落库，这时才清掉超限的旧 localStorage 镜像。
      if (!useLocalMirror) removeLocalMirrors();
      lastSavedAt = envelope.savedAt;
      await persistStorageMeta({
        savedAt: envelope.savedAt,
        competitionId: competition.id,
        version: STORAGE_VERSION,
      });
      broadcastCompetitionSaved(envelope.savedAt, competition.id);
    });
}

export function flushStorage(): Promise<void> {
  return writeQueue;
}

export type LoadCompetitionStatus = 'ok' | 'empty' | 'corrupt';

export interface LoadCompetitionResult {
  status: LoadCompetitionStatus;
  competition?: TournamentCompetition;
  savedAt?: string;
  /** 数据损坏时的可读原因，用于界面提示与原始数据导出。 */
  error?: string;
}

type StoredSource = 'indexeddb-main' | 'indexeddb-backup' | 'local-main' | 'local-backup';

interface StoredCandidate {
  competition: TournamentCompetition;
  savedAt?: string;
  wasMigrated: boolean;
  source: StoredSource;
}

/**
 * 读取已保存的赛事，并区分"没有数据"与"数据存在但损坏"。
 * 数据损坏时不会清空任何记录，调用方可以提示并导出原始数据。
 */
export async function loadCompetitionResult(): Promise<LoadCompetitionResult> {
  await writeQueue.catch(() => undefined);

  const candidates: StoredCandidate[] = [];
  const corruptSources: string[] = [];

  const addCandidate = (
    parsed: { competition: TournamentCompetition; savedAt?: string; wasMigrated: boolean } | null,
    source: StoredSource
  ) => {
    if (parsed) {
      candidates.push({ ...parsed, source });
    } else {
      corruptSources.push(source);
    }
  };

  // 只有确实存在记录、但解析/迁移/校验失败时才登记为损坏。
  const addStored = (stored: unknown, source: StoredSource) => {
    if (stored === null || stored === undefined) return;
    addCandidate(prepareStoredCompetition(parseStoredValue(stored)), source);
  };

  const addLocal = (key: string, source: StoredSource) => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      console.warn('[storage] Failed to read localStorage record', error);
      return;
    }
    if (raw === null) return;
    addCandidate(prepareStoredCompetition(tryParse(raw)), source);
  };

  if (isIndexedDbAvailable()) {
    try {
      addStored(await idbGet<unknown>(STORAGE_KEY), 'indexeddb-main');
    } catch (error) {
      console.warn('[storage] IndexedDB read failed, falling back to localStorage', error);
    }
    try {
      addStored(await idbGet<unknown>(BACKUP_KEY), 'indexeddb-backup');
    } catch (error) {
      console.warn('[storage] IndexedDB backup read failed', error);
    }
  }

  addLocal(STORAGE_KEY, 'local-main');
  addLocal(BACKUP_KEY, 'local-backup');

  if (candidates.length === 0) {
    return corruptSources.length > 0
      ? { status: 'corrupt', error: corruptSources.join(', ') }
      : { status: 'empty' };
  }

  const sourcePriority: Record<StoredSource, number> = {
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

  return { status: 'ok', competition, savedAt: parsed.savedAt };
}

export async function loadCompetition(): Promise<TournamentCompetition | null> {
  const result = await loadCompetitionResult();
  return result.competition ?? null;
}

export interface StoredRawRecord {
  source: StoredSource;
  savedAt: string | null;
  raw: string;
}

/**
 * 汇总各存储位置的原始记录（不做迁移/校验），供数据损坏时导出排查。
 * 这些记录可能是主/备镜像中的任意一份，尽量原样保留。
 */
export async function collectStoredRawRecords(): Promise<StoredRawRecord[]> {
  const records: StoredRawRecord[] = [];

  const addRecord = (source: StoredSource, value: unknown) => {
    if (value === null || value === undefined) return;
    let raw: string;
    try {
      raw = typeof value === 'string' ? value : JSON.stringify(value);
    } catch {
      return;
    }
    let savedAt: string | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed && typeof parsed === 'object'
        && 'savedAt' in parsed && typeof (parsed as { savedAt?: unknown }).savedAt === 'string'
      ) {
        savedAt = (parsed as { savedAt: string }).savedAt;
      }
    } catch {
      // 内容已损坏时保留原始字符串即可。
    }
    records.push({ source, savedAt, raw });
  };

  if (isIndexedDbAvailable()) {
    try {
      addRecord('indexeddb-main', await idbGet<unknown>(STORAGE_KEY));
    } catch (error) {
      console.warn('[storage] Failed to read raw IndexedDB record', error);
    }
    try {
      addRecord('indexeddb-backup', await idbGet<unknown>(BACKUP_KEY));
    } catch (error) {
      console.warn('[storage] Failed to read raw IndexedDB backup record', error);
    }
  }
  try {
    addRecord('local-main', localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.warn('[storage] Failed to read raw localStorage record', error);
  }
  try {
    addRecord('local-backup', localStorage.getItem(BACKUP_KEY));
  } catch (error) {
    console.warn('[storage] Failed to read raw localStorage backup record', error);
  }
  return records;
}

/** 返回上次保存的 ISO 时间戳（没有则返回 null），用于 UI 显示"最后保存于..." */
export function getLastSavedAt(): string | null {
  if (lastSavedAt) return lastSavedAt;
  // 大数据会删掉 localStorage 主/备镜像，保存时间改从轻量 meta 读取。
  try {
    const rawMeta = localStorage.getItem(META_KEY);
    if (rawMeta) {
      const meta: unknown = JSON.parse(rawMeta);
      if (meta && typeof meta === 'object' && 'savedAt' in meta
          && typeof (meta as StorageMeta).savedAt === 'string') {
        return (meta as StorageMeta).savedAt;
      }
    }
  } catch {
    // Fall through to the legacy envelope lookup.
  }
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

/**
 * 页面隐藏/关闭前尽量把排队的写入刷到 IndexedDB。
 * 测试环境（无 window/document）下注册函数会直接跳过。
 */
function registerStorageLifecycle(): (() => void) | null {
  if (typeof window === 'undefined') return null;
  const flushInBackground = () => {
    void flushStorage().catch(() => undefined);
  };
  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flushInBackground();
    }
  };
  window.addEventListener('pagehide', flushInBackground);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  return () => {
    window.removeEventListener('pagehide', flushInBackground);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}

const unregisterStorageLifecycle = registerStorageLifecycle();

/** 注销页面生命周期监听（测试/HMR 时清理用）。 */
export function disposeStorageLifecycle(): void {
  unregisterStorageLifecycle?.();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeStorageLifecycle());
}

export function clearCompetition(): void {
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    // Ignore meta cleanup errors.
  }
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
      await Promise.all([idbDelete(STORAGE_KEY), idbDelete(BACKUP_KEY), idbDelete(META_KEY)]);
    })
    .catch(error => {
      console.error('Failed to clear IndexedDB:', error);
    });
}
