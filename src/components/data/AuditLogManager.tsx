import { History, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  clearAuditEntries,
  listAuditEntries,
  type AuditEntry,
} from '../../utils/auditLog';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface AuditLogManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuditLogManager({ isOpen, onClose }: AuditLogManagerProps) {
  const { language, t } = useLanguagePreference();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [clearOpen, setClearOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEscapeClose(isOpen, onClose);
  useFocusTrap(isOpen, dialogRef);
  useEffect(() => {
    if (isOpen) void listAuditEntries().then(setEntries);
  }, [isOpen]);

  if (!isOpen) return null;

  const actionLabel = (entry: AuditEntry): string => {
    const details = entry.details ?? {};
    switch (entry.action) {
      case 'match-result':
        return formatText(t.auditMatchResult, {
          match: String(details.matchId ?? ''),
          result: String(details.result ?? ''),
        });
      case 'round-undo':
        return formatText(t.auditRoundUndo, { round: String(details.round ?? '') });
      case 'history-undo':
        return t.auditHistoryUndo;
      case 'history-redo':
        return t.auditHistoryRedo;
      case 'history-jump':
        return formatText(t.auditHistoryJump, { label: String(details.label ?? '') });
      case 'tournament-reset':
        return t.auditTournamentReset;
      case 'tournament-import':
        return formatText(t.auditTournamentImport, { name: String(details.name ?? '') });
      case 'player-drop':
        return formatText(t.auditPlayerDrop, { name: String(details.name ?? '') });
      case 'player-restore':
        return formatText(t.auditPlayerRestore, { name: String(details.name ?? '') });
      case 'snapshot-restore':
        return formatText(t.auditSnapshotRestore, { label: String(details.label ?? '') });
      case 'conflict-resolve':
        return formatText(t.auditConflictResolve, { choice: String(details.choice ?? '') });
      default:
        return entry.summary;
    }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleString(
    language === 'en' ? 'en-US' : 'zh-CN',
    { hour12: false }
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-700/50 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-500/15 p-2 text-indigo-300">
                <History className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-white">{t.auditLog}</h3>
                <p className="text-[11px] text-slate-500">{t.auditLogDesc}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {entries.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">{t.noAuditEntries}</p>
            ) : (
              <div className="space-y-2">
                {entries.map(entry => (
                  <div key={entry.id} className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-200">{actionLabel(entry)}</p>
                      <time className="shrink-0 font-mono text-[10px] text-slate-500">
                        {formatTime(entry.timestamp)}
                      </time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-slate-700/50 p-4">
            <button
              onClick={() => setClearOpen(true)}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t.clearAuditLog}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={async () => {
          await clearAuditEntries();
          setEntries([]);
        }}
        title={t.clearAuditLog}
        message={t.clearAuditLogMessage}
      />
    </>
  );
}
