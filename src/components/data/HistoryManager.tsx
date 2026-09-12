import { useRef, useState } from 'react';
import { Database, History, RotateCcw, Trash2, X } from 'lucide-react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface HistoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HistoryManager({ isOpen, onClose }: HistoryManagerProps) {
  const historyPast = useTournamentStore(state => state.historyPast);
  const historyFuture = useTournamentStore(state => state.historyFuture);
  const isReadOnly = useTournamentStore(state => state.isReadOnly);
  const jumpToHistory = useTournamentStore(state => state.jumpToHistory);
  const clearHistory = useTournamentStore(state => state.clearHistory);
  const { language, t } = useLanguagePreference();
  const isEnglish = language === 'en';
  const dialogRef = useRef<HTMLDivElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEscapeClose(isOpen, onClose);
  useFocusTrap(isOpen, dialogRef);

  if (!isOpen) return null;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleString(isEnglish ? 'en-US' : 'zh-CN', { hour12: false });
  };

  const restore = (index: number) => {
    if (jumpToHistory(index)) {
      showToast(isEnglish ? 'History restored' : '已跳转到该操作之前');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onClick={event => event.stopPropagation()}
          className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-500/15 p-2 text-violet-300">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">{isEnglish ? 'Operation history' : '操作历史'}</h3>
                <p className="text-[11px] text-slate-500">
                  {isEnglish
                    ? 'Persisted in local storage and available after refresh.'
                    : '保存于本地存储，刷新页面后仍可继续撤销和重做。'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 border-b border-slate-700/50 bg-slate-800/30 px-5 py-3 text-xs">
            <Database className="h-4 w-4 text-sky-400" />
            <span className="text-slate-400">
              {isEnglish
                ? `${historyPast.length} undoable · ${historyFuture.length} redoable`
                : `可撤销 ${historyPast.length} 步 · 可重做 ${historyFuture.length} 步`}
            </span>
            {isReadOnly && (
              <span className="ml-auto text-amber-300">
                {isEnglish ? 'Read-only tab' : '当前为只读标签页'}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {historyPast.length === 0 && historyFuture.length === 0 ? (
              <div className="py-14 text-center">
                <History className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">{t.noAuditEntries}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {isEnglish ? 'Undo history' : '可撤销操作'}
                  </div>
                  <div className="space-y-2">
                    {[...historyPast].reverse().map((entry, reversedIndex) => {
                      const originalIndex = historyPast.length - 1 - reversedIndex;
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/35 px-3 py-2.5"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 font-mono text-[11px] text-violet-300">
                            {originalIndex + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-200">{entry.label}</div>
                            <div className="mt-0.5 text-[10px] text-slate-500">{formatTime(entry.timestamp)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => restore(originalIndex)}
                            disabled={isReadOnly}
                            className="flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {isEnglish ? 'Restore before' : '回到此前'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {historyFuture.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {isEnglish ? 'Redo history' : '可重做操作'}
                    </div>
                    <div className="space-y-1">
                      {historyFuture.map(entry => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/20 px-3 py-2 text-xs text-slate-400"
                        >
                          <span className="truncate">{entry.label}</span>
                          <span className="ml-3 shrink-0 text-[10px] text-slate-600">{formatTime(entry.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-700/60 px-5 py-3">
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={historyPast.length === 0 && historyFuture.length === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isEnglish ? 'Clear history' : '清空历史'}
            </button>
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
              {isEnglish ? 'Close' : '关闭'}
            </button>
          </div>

          {toast && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-lg border border-sky-500/30 bg-sky-500/15 px-3 py-1.5 text-xs text-sky-200">
              {toast}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          clearHistory();
          setShowClearConfirm(false);
          showToast(isEnglish ? 'History cleared' : '历史已清空');
        }}
        title={isEnglish ? 'Clear operation history?' : '清空操作历史？'}
        message={isEnglish
          ? 'This only clears undo and redo history. Tournament data is not affected.'
          : '此操作只清空撤销和重做历史，不会影响当前赛事数据。'}
      />
    </>
  );
}
