import type { TournamentCompetition } from '../../types';
import { idbDelete, idbGet, idbSet, isIndexedDbAvailable } from './indexedDb';

/**
 * 比赛数据快照管理：在关键节点（如每轮完赛）自动保存时间戳快照到 localStorage。
 * 与 storage.ts 中的 BACKUP_KEY（主数据镜像）不同，这里保留最多 N 份历史快照，
 * 用户可在「备份管理」面板中查看、恢复或删除。
 */

const SNAPSHOT_KEY = 'swiss_tournament_snapshots';
const MAX_SNAPSHOTS = 5;
const LOCAL_SNAPSHOT_LIMIT = 2 * 1024 * 1024;

export interface Snapshot {
  id: string;
  savedAt: string; // ISO 时间戳
  label: string;   // 人类可读描述，如 "小组01·第3轮完赛"
  /** 快照所属赛事 id。旧版本条目没有该字段，读取时回退到 data.id。 */
  competitionId?: string;
  /** 快照所属赛事名。旧版本条目没有该字段，UI 显示为"未知赛事"。 */
  competitionName?: string;
  data: TournamentCompetition;
}

/** 快照归属的赛事信息，用于恢复前校验和列表展示。 */
export interface SnapshotOwner {
  id: string;
  /** 旧版本快照没有记录赛事名时为 null。 */
  name: string | null;
}

export interface SaveSnapshotOptions {
  /** Replace the previous automatic snapshot for the same competition and label. */
  replaceSameLabel?: boolean;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

/**
 * 校验并归一化一条存储中的快照。旧版本条目缺少 competitionId/competitionName 时
 * 保留为 undefined（兼容读取），结构不完整的条目直接丢弃。
 */
function normalizeSnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<Snapshot>;
  if (typeof entry.id !== 'string' || typeof entry.savedAt !== 'string') return null;
  if (typeof entry.label !== 'string') return null;
  const data = entry.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.groups)) return null;
  return {
    id: entry.id,
    savedAt: entry.savedAt,
    label: entry.label,
    competitionId: typeof entry.competitionId === 'string' ? entry.competitionId : undefined,
    competitionName: typeof entry.competitionName === 'string' ? entry.competitionName : undefined,
    data,
  };
}

function normalizeSnapshots(stored: unknown): Snapshot[] | null {
  if (!Array.isArray(stored)) return null;
  return stored
    .map(normalizeSnapshot)
    .filter((snapshot): snapshot is Snapshot => snapshot !== null);
}

/**
 * 快照归属的赛事：优先用写入时记录的归属字段；旧版本快照没有归属字段时
 * 回退到 data.id（赛事数据本身自带的 id）。赛事名缺失时返回 null。
 */
export function getSnapshotOwner(snapshot: Snapshot): SnapshotOwner {
  return {
    id: snapshot.competitionId ?? snapshot.data.id,
    name: snapshot.competitionName ?? null,
  };
}

/** 读取所有快照（按时间倒序，最新在前） */
export async function listSnapshots(): Promise<Snapshot[]> {
  if (isIndexedDbAvailable()) {
    try {
      const stored = await idbGet<Snapshot[]>(SNAPSHOT_KEY);
      const normalized = normalizeSnapshots(stored);
      if (normalized) return normalized;
    } catch (error) {
      console.warn('[snapshot] IndexedDB read failed, falling back to localStorage', error);
    }
  }

  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    return normalizeSnapshots(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

/**
 * 保存一份快照。超过 MAX_SNAPSHOTS 时自动淘汰最旧的。
 * 快照内容仅保留必要字段（复用 storage.ts 的压缩思路：去重 playedAgainst），
 * 以控制 localStorage 占用。
 * @returns 是否至少写入到一处存储（IndexedDB 或 localStorage）
 */
async function persistSnapshots(snapshots: Snapshot[]): Promise<boolean> {
  const serialized = JSON.stringify(snapshots);
  let saved = false;
  if (isIndexedDbAvailable()) {
    try {
      await idbSet(SNAPSHOT_KEY, snapshots);
      saved = true;
    } catch (error) {
      console.warn('[snapshot] IndexedDB write failed:', error);
    }
  }

  if (serialized.length <= LOCAL_SNAPSHOT_LIMIT) {
    try {
      localStorage.setItem(SNAPSHOT_KEY, serialized);
      saved = true;
    } catch (error) {
      if (!saved) console.warn('[snapshot] localStorage write failed:', error);
    }
  } else {
    try {
      localStorage.removeItem(SNAPSHOT_KEY);
    } catch {
      // Ignore fallback cleanup errors.
    }
  }
  return saved;
}

// 串行队列：并发保存时避免「读列表 → 改列表 → 写回」互相覆盖。
let snapshotWriteQueue: Promise<void> = Promise.resolve();

export function saveSnapshot(
  competition: TournamentCompetition,
  label: string,
  options: SaveSnapshotOptions = {}
): Promise<boolean> {
  const result = snapshotWriteQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const snapshot: Snapshot = {
          id: generateId(),
          savedAt: new Date().toISOString(),
          label,
          competitionId: competition.id,
          competitionName: competition.name,
          data: compressForSnapshot(competition),
        };

        const existing = await listSnapshots();
        if (options.replaceSameLabel) {
          const previousIndex = existing.findIndex(
            item => item.data.id === competition.id && item.label === label
          );
          if (previousIndex >= 0) existing.splice(previousIndex, 1);
        }
        existing.unshift(snapshot);
        // 保留最新的 MAX_SNAPSHOTS 份
        const trimmed = existing.slice(0, MAX_SNAPSHOTS);
        return await persistSnapshots(trimmed);
      } catch (e) {
        console.warn('[snapshot] 保存快照失败:', e);
        return false;
      }
    });
  snapshotWriteQueue = result.then(() => undefined);
  return result;
}

/** 按 ID 获取单条快照 */
export async function getSnapshot(id: string): Promise<Snapshot | null> {
  return (await listSnapshots()).find(s => s.id === id) || null;
}

/** 按 ID 删除单条快照 */
export async function deleteSnapshot(id: string): Promise<void> {
  const remaining = (await listSnapshots()).filter(s => s.id !== id);
  await persistSnapshots(remaining);
}

/** 清空所有快照 */
export async function clearSnapshots(): Promise<void> {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch (e) {
    console.warn('[snapshot] 清空快照失败:', e);
  }
  if (isIndexedDbAvailable()) {
    try {
      await idbDelete(SNAPSHOT_KEY);
    } catch (error) {
      console.warn('[snapshot] Failed to clear IndexedDB snapshots:', error);
    }
  }
}

/**
 * 快照专用轻量压缩：移除运行时计算的胜率字段（恢复时由 store 重算），
 * 并对 playedAgainst 去重，减小快照体积。
 */
function compressForSnapshot(competition: TournamentCompetition): TournamentCompetition {
  return {
    ...competition,
    groups: competition.groups.map(g => ({
      ...g,
      players: g.players.map(p => {
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const id of p.playedAgainst) {
          if (id === 'bye') {
            if (!seen.has('bye')) { seen.add('bye'); deduped.push('bye'); }
            continue;
          }
          if (!seen.has(id)) { seen.add(id); deduped.push(id); }
        }
        return {
          ...p,
          playedAgainst: deduped,
          // 胜率字段在恢复后由 store 重算，快照中置 0 节省空间
          winRate: 0,
          opponentWinRate: 0,
          opponentOpponentWinRate: 0,
          gameWinRate: 0,
          opponentGameWinRate: 0,
        };
      }),
    })),
  };
}
