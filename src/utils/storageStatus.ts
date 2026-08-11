/**
 * 存储状态通知：轻量发布订阅，避免 store 与 storage 之间产生循环依赖。
 * saveCompetition 失败时通过 notifyStorageError 广播，UI 层自行决定是否提示。
 */

export type StorageStatus = 'ok' | 'quota_exceeded' | 'error';

type Listener = (status: StorageStatus, message: string) => void;

const listeners = new Set<Listener>();
let currentStatus: StorageStatus = 'ok';
let currentMessage = '';

export function getStorageStatus(): { status: StorageStatus; message: string } {
  return { status: currentStatus, message: currentMessage };
}

export function subscribeStorageStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyStorageStatus(status: StorageStatus, message: string): void {
  currentStatus = status;
  currentMessage = message;
  listeners.forEach(l => l(status, message));
}

/**
 * 粗略估算当前赛事数据序列化后大小（字节）。
 * 用于在接近 localStorage 上限前主动提示用户。
 */
export function estimateDataSize(competition: unknown): number {
  try {
    return new Blob([JSON.stringify(competition)]).size;
  } catch {
    return 0;
  }
}
