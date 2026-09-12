import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { useLanguagePreference } from '../../i18n/context';
import { usePwaUpdate } from '../../hooks/usePwaUpdate';

export function AppUpdatePrompt() {
  const { t } = useLanguagePreference();
  const { needRefresh, offlineReady, updateNow, dismissUpdate } = usePwaUpdate();

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      className="fixed top-20 right-4 z-50 max-w-sm rounded-xl border border-sky-500/30 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-sky-500/15 p-2 text-sky-300">
          {needRefresh ? <Download className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            {needRefresh ? t.updateAvailable : t.offlineReady}
          </p>
          {needRefresh && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void updateNow()}
                className="flex items-center gap-1.5 rounded-md bg-sky-500/20 px-2.5 py-1.5 text-xs text-sky-200 hover:bg-sky-500/30"
              >
                <RefreshCw className="h-3 w-3" />
                {t.updateNow}
              </button>
              <button
                onClick={dismissUpdate}
                className="rounded-md px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                {t.later}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={dismissUpdate}
          className="text-slate-500 hover:text-white"
          aria-label={t.close}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
