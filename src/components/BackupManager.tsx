import { useState, useEffect } from 'react';
import { X, History, RotateCcw, Trash2, Plus, Clock } from 'lucide-react';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { useTournamentStore } from '../store/useTournamentStore';
import { listSnapshots, deleteSnapshot, type Snapshot } from '../utils/snapshot';

interface BackupManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BackupManager({ isOpen, onClose }: BackupManagerProps) {
  useEscapeClose(isOpen, onClose);
  const { createSnapshot, restoreFromSnapshot } = useTournamentStore();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [pendingRestore, setPendingRestore] = useState<Snapshot | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Snapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 每次打开时刷新快照列表
  useEffect(() => {
    if (isOpen) {
      setSnapshots(listSnapshots());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const handleCreate = () => {
    createSnapshot();
    setSnapshots(listSnapshots());
    showToast('已创建快照');
  };

  const handleRestore = (snapshot: Snapshot) => {
    setPendingRestore(snapshot);
  };

  const confirmRestore = () => {
    if (!pendingRestore) return;
    const ok = restoreFromSnapshot(pendingRestore.id);
    setPendingRestore(null);
    if (ok) {
      showToast('已恢复，列表将关闭');
      window.setTimeout(() => onClose(), 800);
    } else {
      showToast('恢复失败，快照可能已损坏');
    }
  };

  const handleDelete = (snapshot: Snapshot) => {
    setPendingDelete(snapshot);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteSnapshot(pendingDelete.id);
    setSnapshots(listSnapshots());
    setPendingDelete(null);
    showToast('已删除快照');
  };

  const formatTime = (iso: string): string => {
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col relative"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">备份管理</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                每轮完赛时自动创建快照，最多保留 5 份
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 操作栏 */}
        <div className="px-5 py-3 border-b border-slate-700/50">
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 transition-colors text-xs font-medium border border-sky-500/30"
          >
            <Plus className="w-3.5 h-3.5" />
            立即创建快照
          </button>
        </div>

        {/* 快照列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {snapshots.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无快照</p>
              <p className="text-xs mt-1 text-slate-600">
                比赛每轮完赛时会自动创建快照
              </p>
            </div>
          ) : (
            snapshots.map(snapshot => (
              <div
                key={snapshot.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-700/40 hover:border-slate-600 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 font-medium truncate">
                    {snapshot.label}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(snapshot.savedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleRestore(snapshot)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-[11px] border border-emerald-500/20"
                    title="恢复到此快照"
                  >
                    <RotateCcw className="w-3 h-3" />
                    恢复
                  </button>
                  <button
                    onClick={() => handleDelete(snapshot)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors text-[11px] border border-rose-500/20"
                    title="删除此快照"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-5 py-3 border-t border-slate-700/50 text-[11px] text-slate-500">
          恢复快照会覆盖当前所有数据，建议先导出当前数据
        </div>

        {/* 恢复确认弹窗 */}
        {pendingRestore && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4 rounded-2xl" onClick={() => setPendingRestore(null)}>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h4 className="text-sm font-semibold text-white mb-2">确认恢复快照</h4>
              <p className="text-xs text-slate-400 mb-4">
                将恢复到「{pendingRestore.label}」（{formatTime(pendingRestore.savedAt)}），当前所有未保存的数据将被覆盖。是否继续？
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setPendingRestore(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-xs"
                >
                  取消
                </button>
                <button
                  onClick={confirmRestore}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors text-xs font-medium"
                >
                  确认恢复
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 删除确认弹窗 */}
        {pendingDelete && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4 rounded-2xl" onClick={() => setPendingDelete(null)}>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h4 className="text-sm font-semibold text-white mb-2">确认删除快照</h4>
              <p className="text-xs text-slate-400 mb-4">
                将删除「{pendingDelete.label}」，此操作不可恢复。是否继续？
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setPendingDelete(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-xs"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 transition-colors text-xs font-medium"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* toast */}
        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 text-xs backdrop-blur-sm pointer-events-none">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
