import { useState, useEffect } from 'react';
import { X, History, RotateCcw, Trash2, Plus, Clock } from 'lucide-react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useTournamentStore } from '../../store/useTournamentStore';
import { listSnapshots, deleteSnapshot, type Snapshot } from '../../utils/storage/snapshot';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';

interface BackupManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BackupManager({ isOpen, onClose }: BackupManagerProps) {
  useEscapeClose(isOpen, onClose);
  const { language, t } = useLanguagePreference();
  const { createSnapshot, restoreFromSnapshot } = useTournamentStore();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [pendingRestore, setPendingRestore] = useState<Snapshot | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Snapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void listSnapshots().then(setSnapshots);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const handleCreate = async () => {
    await createSnapshot();
    setSnapshots(await listSnapshots());
    showToast(t.snapshotCreated);
  };

  const handleRestore = (snapshot: Snapshot) => {
    setPendingRestore(snapshot);
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    const ok = await restoreFromSnapshot(pendingRestore.id);
    setPendingRestore(null);
    if (ok) {
      showToast(t.snapshotRestored);
      window.setTimeout(() => onClose(), 800);
    } else {
      showToast(t.snapshotRestoreFailed);
    }
  };

  const handleDelete = (snapshot: Snapshot) => {
    setPendingDelete(snapshot);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteSnapshot(pendingDelete.id);
    setSnapshots(await listSnapshots());
    setPendingDelete(null);
    showToast(t.snapshotDeleted);
  };

  const formatTime = (iso: string): string => {
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      if (language === 'en') {
        return d.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      }
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
        <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{t.backupManagerTitle}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t.backupManagerDesc}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-700/50">
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 transition-colors text-xs font-medium border border-sky-500/30"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.createSnapshotNow}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {snapshots.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t.noSnapshots}</p>
              <p className="text-xs mt-1 text-slate-600">
                {t.noSnapshotsDesc}
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
                    title={t.restoreThisSnapshot}
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t.restore}
                  </button>
                  <button
                    onClick={() => handleDelete(snapshot)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors text-[11px] border border-rose-500/20"
                    title={t.deleteThisSnapshot}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-700/50 text-[11px] text-slate-500">
          {t.restoreWarning}
        </div>

        {pendingRestore && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4 rounded-2xl" onClick={() => setPendingRestore(null)}>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h4 className="text-sm font-semibold text-white mb-2">{t.confirmRestoreTitle}</h4>
              <p className="text-xs text-slate-400 mb-4">
                {formatText(t.confirmRestoreMsg, { label: pendingRestore.label, time: formatTime(pendingRestore.savedAt) })}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setPendingRestore(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-xs"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={confirmRestore}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors text-xs font-medium"
                >
                  {t.confirmRestoreAction}
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingDelete && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4 rounded-2xl" onClick={() => setPendingDelete(null)}>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h4 className="text-sm font-semibold text-white mb-2">{t.confirmDeleteTitle}</h4>
              <p className="text-xs text-slate-400 mb-4">
                {formatText(t.confirmDeleteMsg, { label: pendingDelete.label })}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setPendingDelete(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-xs"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 transition-colors text-xs font-medium"
                >
                  {t.confirmDeleteAction}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 text-xs backdrop-blur-sm pointer-events-none">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
