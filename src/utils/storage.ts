import type { TournamentCompetition, TournamentGroup, TournamentStatus, GameType, PairingType, Player, Match } from '../types';
import { notifyStorageStatus, getStorageStatus, estimateDataSize } from './storageStatus';

const STORAGE_KEY = 'swiss_tournament_data';
const BACKUP_KEY = 'swiss_tournament_data_backup';
// localStorage 通常上限 5~10MB，这里取保守阈值 4MB 作为预警线
const STORAGE_WARN_BYTES = 4 * 1024 * 1024;

/**
 * localStorage 内部包装：附加保存时间戳，便于 UI 显示"最后保存于..."
 * 对外 API（save/load/import/export）仍使用原始 TournamentCompetition，保持兼容性
 */
interface StorageEnvelope {
  version: number;
  savedAt: string;
  data: TournamentCompetition;
}

const STORAGE_VERSION = 2;

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

function migrateGroupPairingType(group: any): TournamentGroup {
  let migrated = { ...group };

  // 旧格式：gameType = 'single_elimination'，迁移为 pairingType
  if (migrated.gameType === 'single_elimination' && !migrated.pairingType) {
    migrated.pairingType = 'single_elimination' as PairingType;
    migrated.gameType = 'bo1' as GameType;
  }

  // 确保 pairingType 存在
  if (!migrated.pairingType) {
    migrated.pairingType = 'swiss' as PairingType;
  }

  // 确保 roundGameTypes 存在
  if (!migrated.roundGameTypes || !Array.isArray(migrated.roundGameTypes)) {
    migrated.roundGameTypes = new Array(migrated.totalRounds || 5).fill(migrated.gameType || 'bo1');
  }

  // 确保每个 player 都有上下匹配相关字段（新字段兼容旧数据）
  if (migrated.players && Array.isArray(migrated.players)) {
    migrated.players = migrated.players.map((p: any) => ({
      ...p,
      downMatchCount: p.downMatchCount ?? 0,
      upMatchCount: p.upMatchCount ?? 0,
      hasDownPriority: p.hasDownPriority ?? false,
      hasUpPriority: p.hasUpPriority ?? false,
    }));
  }

  return migrated as TournamentGroup;
}

/**
 * 尝试从原始字符串中解析数据，兼容三种格式：
 * 1. StorageEnvelope (version 2) : {version, savedAt, data: {...}}
 * 2. 原始 TournamentCompetition (version 1) : 直接 {groups, currentGroupIndex, ...}
 * 3. 旧格式 LegacyTournament : 单小组（无groups字段，含 players/matches）
 */
function tryParse(raw: string | null): { competition: TournamentCompetition; savedAt?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);

    // 格式1：Envelope
    if (parsed && typeof parsed === 'object' && typeof parsed.version === 'number' && 'data' in parsed) {
      const env = parsed as StorageEnvelope;
      const c = env.data;
      if (c && Array.isArray(c.groups)) {
        return { competition: c, savedAt: env.savedAt };
      }
    }

    // 格式2：新格式 TournamentCompetition（含 groups）
    if (parsed && parsed.groups && Array.isArray(parsed.groups)) {
      return { competition: parsed as TournamentCompetition };
    }

    // 格式3：旧格式 LegacyTournament（无 groups，有 players/matches）
    if (parsed && !parsed.groups && Array.isArray(parsed.players) && Array.isArray(parsed.matches)) {
      const tournament = parsed as LegacyTournament;
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
      const group = migrateGroupPairingType(rawGroup);
      const competition: TournamentCompetition = {
        id: generateId(),
        name: tournament.name || '迁移的比赛',
        groups: [group],
        currentGroupIndex: 0,
        createdAt: tournament.createdAt || new Date().toISOString(),
      };
      return { competition };
    }
  } catch (_) { /* ignore */ }
  return null;
}

export function saveCompetition(competition: TournamentCompetition): void {
  try {
    const envelope: StorageEnvelope = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      data: competition,
    };
    const serialized = JSON.stringify(envelope);

    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (setItemErr) {
      const isQuota = setItemErr instanceof DOMException && (setItemErr.name === 'QuotaExceededError' || setItemErr.code === 22);
      const msg = isQuota
        ? '本地存储已满，数据未能保存。请先「导出比赛数据」备份，再清理或刷新页面'
        : `数据保存失败：${setItemErr instanceof Error ? setItemErr.message : String(setItemErr)}`;
      notifyStorageStatus(isQuota ? 'quota_exceeded' : 'error', msg);
      console.error('Failed to save competition:', setItemErr);
      return;
    }

    // 异步/忽略错误写一份备份（防止下次主key读取损坏时有后手）
    try {
      localStorage.setItem(BACKUP_KEY, serialized);
    } catch (_) { /* 备份失败不影响主流程 */ }

    // 成功：若之前是 error/quota_exceeded，则恢复到 ok；容量超限时仍提示
    const sizeBytes = estimateDataSize(competition);
    const prevStatus = getStorageStatus().status;
    if (sizeBytes >= STORAGE_WARN_BYTES) {
      notifyStorageStatus('ok', `本地数据已接近容量上限（约 ${(sizeBytes / 1024 / 1024).toFixed(2)} MB），建议尽快导出备份`);
    } else if (prevStatus !== 'ok') {
      notifyStorageStatus('ok', '');
    }
  } catch (e) {
    notifyStorageStatus('error', `保存时发生未预期错误：${e instanceof Error ? e.message : String(e)}`);
    console.error('Failed to save competition (outer):', e);
  }
}

export function loadCompetition(): TournamentCompetition | null {
  const parsed = tryParse(localStorage.getItem(STORAGE_KEY));
  if (parsed) {
    let { competition } = parsed;

    // 迁移新格式中缺少 pairingType 的 groups
    if (competition.groups.some(g => !g.pairingType || !g.roundGameTypes || !Array.isArray(g.roundGameTypes))) {
      const migratedGroups = competition.groups.map((g: any) => migrateGroupPairingType(g));
      competition = { ...competition, groups: migratedGroups };
      // 保存迁移后的数据
      saveCompetition(competition);
    }
    return competition;
  }

  // 主 key 解析失败（如 JSON 损坏/格式异常）：尝试从备份恢复
  const backupParsed = tryParse(localStorage.getItem(BACKUP_KEY));
  if (backupParsed) {
    console.warn('[storage] 主数据读取失败，已从备份恢复');
    let { competition } = backupParsed;
    if (competition.groups.some(g => !g.pairingType || !g.roundGameTypes || !Array.isArray(g.roundGameTypes))) {
      const migratedGroups = competition.groups.map((g: any) => migrateGroupPairingType(g));
      competition = { ...competition, groups: migratedGroups };
    }
    // 恢复后立刻写回主 key（备份仍保留，双保险）
    try { saveCompetition(competition); } catch (_) { /* ignore */ }
    notifyStorageStatus('ok', '已从本地备份恢复数据，建议立即「导出比赛数据」备份');
    return competition;
  }

  return null;
}

/** 返回上次保存的 ISO 时间戳（没有则返回 null），用于 UI 显示"最后保存于..." */
export function getLastSavedAt(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.savedAt === 'string') {
      return parsed.savedAt;
    }
  } catch (_) { /* ignore */ }
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
}
