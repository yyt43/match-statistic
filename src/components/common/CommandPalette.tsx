import { Search, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface CommandAction {
  id: string;
  label: string;
  keywords: string;
  icon: ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandAction[];
}

export function CommandPalette({ isOpen, onClose, actions }: CommandPaletteProps) {
  const { t } = useLanguagePreference();
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeClose(isOpen, onClose);
  useFocusTrap(isOpen, dialogRef);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword
      ? actions.filter(action =>
          `${action.label} ${action.keywords}`.toLowerCase().includes(keyword)
        )
      : actions;
  }, [actions, query]);

  if (!isOpen) return null;

  const runAction = (action: CommandAction) => {
    action.run();
    setQuery('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[15vh] backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-700/60 px-4">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t.commandPlaceholder}
            className="h-12 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
          />
          <button onClick={onClose} className="text-slate-500 hover:text-white" aria-label={t.close}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{t.commandNoResults}</p>
          ) : (
            filtered.map(action => (
              <button
                key={action.id}
                onClick={() => runAction(action)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <span className="text-gold-400">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
