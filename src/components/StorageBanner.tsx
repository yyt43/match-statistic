import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { subscribeStorageStatus, getStorageStatus, type StorageStatus } from '../utils/storageStatus';

/**
 * 顶部存储状态横幅：仅在有警告/错误时显示。
 * 不影响任何现有功能，仅在 saveCompetition 失败或接近容量上限时提示用户。
 */
export function StorageBanner() {
  const [state, setState] = useState<{ status: StorageStatus; message: string }>(() => getStorageStatus());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsub = subscribeStorageStatus((status, message) => {
      setState({ status, message });
      // 新的错误出现时重置 dismissed 状态
      if (status !== 'ok' || message) setDismissed(false);
    });
    return unsub;
  }, []);

  if (state.status === 'ok' && !state.message) return null;
  if (dismissed && state.status === 'ok') return null;

  const isError = state.status !== 'ok';

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-xs border-b ${
        isError
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      }`}
      role="alert"
    >
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1">{state.message}</span>
      <button
        onClick={() => setDismissed(true)}
        className="p-0.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
        aria-label="关闭提示"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
