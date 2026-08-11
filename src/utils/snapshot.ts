import type { TournamentCompetition } from '../types';

/**
 * 比赛数据快照管理：在关键节点（如每轮完赛）自动保存时间戳快照到 localStorage。
 * 与 storage.ts 中的 BACKUP_KEY（主数据镜像）不同，这里保留最多 N 份历史快照，
 * 用户可在「备份管理」面板中查看、恢复或删除。
 */

const SNAPSHOT_KEY = 'swiss_tournament_snapshots';
const MAX_SNAPSHOTS = 5;

export interface Snapshot {
  id: string;
  savedAt: string; // ISO 时间戳
  label: string;   // 人类可读描述，如 "小组01·第3轮完赛"
  data: TournamentCompetition;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

/** 读取所有快照（按时间倒序，最新在前） */
export function listSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Snapshot[];
  } catch {
    return [];
  }
}

/**
 * 保存一份快照。超过 MAX_SNAPSHOTS 时自动淘汰最旧的。
 * 快照内容仅保留必要字段（复用 storage.ts 的压缩思路：去重 playedAgainst），
 * 以控制 localStorage 占用。
 */
export function saveSnapshot(competition: TournamentCompetition, label: string): void {
  try {
    const snapshot: Snapshot = {
      id: generateId(),
      savedAt: new Date().toISOString(),
      label,
      data: compressForSnapshot(competition),
    };

    const existing = listSnapshots();
    existing.unshift(snapshot);
    // 保留最新的 MAX_SNAPSHOTS 份
    const trimmed = existing.slice(0, MAX_SNAPSHOTS);

    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(trimmed));
    } catch (quotaErr) {
      // 配额不足：逐步丢弃最旧的快照重试
      for (let keep = trimmed.length - 1; keep > 0; keep--) {
        try {
          localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(trimmed.slice(0, keep)));
          return;
        } catch { /* 继续缩减 */ }
      }
      // 全部快照都无法写入时静默失败（不影响主流程）
      console.warn('[snapshot] 快照写入失败，可能 localStorage 已满:', quotaErr);
    }
  } catch (e) {
    console.warn('[snapshot] 保存快照失败:', e);
  }
}

/** 按 ID 获取单条快照 */
export function getSnapshot(id: string): Snapshot | null {
  return listSnapshots().find(s => s.id === id) || null;
}

/** 按 ID 删除单条快照 */
export function deleteSnapshot(id: string): void {
  const remaining = listSnapshots().filter(s => s.id !== id);
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(remaining));
  } catch (e) {
    console.warn('[snapshot] 删除快照失败:', e);
  }
}

/** 清空所有快照 */
export function clearSnapshots(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch (e) {
    console.warn('[snapshot] 清空快照失败:', e);
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
