import { LockKeyhole } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useLanguagePreference } from '../../i18n/context';

export function WriterLockBanner() {
  const isReadOnly = useTournamentStore(state => state.isReadOnly);
  const { t } = useLanguagePreference();

  if (!isReadOnly) return null;

  return (
    <div
      className="flex items-center gap-2 border-b border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs text-sky-200"
      role="status"
      aria-live="polite"
    >
      <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">{t.writerLockTitle}</span>
      <span className="text-sky-300/80">{t.writerLockDescription}</span>
    </div>
  );
}
