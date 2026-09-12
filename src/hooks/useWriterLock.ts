import { useEffect } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';

const WRITER_LOCK_NAME = 'match-statistic-active-writer';

export function useWriterLock(): void {
  const setReadOnly = useTournamentStore(state => state.setReadOnly);

  useEffect(() => {
    if (!('locks' in navigator) || !navigator.locks) {
      setReadOnly(false);
      return;
    }

    let cancelled = false;
    let acquired = false;
    let releaseLock: (() => void) | null = null;

    const acquire = () => {
      if (cancelled || acquired) return;
      void navigator.locks.request(
        WRITER_LOCK_NAME,
        { mode: 'exclusive', ifAvailable: true },
        async lock => {
          if (cancelled) return;
          if (!lock) {
            setReadOnly(true);
            return;
          }

          acquired = true;
          setReadOnly(false);
          await new Promise<void>(resolve => {
            releaseLock = resolve;
            if (cancelled) resolve();
          });
          acquired = false;
          releaseLock = null;
        }
      ).catch(() => setReadOnly(true));
    };

    // Defer the first request so React StrictMode's mount/unmount probe does not
    // make the second request race against a lock owned by the first probe.
    const initialAcquireTimer = window.setTimeout(acquire, 0);
    const retryTimer = window.setInterval(acquire, 3000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(initialAcquireTimer);
      window.clearInterval(retryTimer);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
      releaseLock?.();
    };
  }, [setReadOnly]);
}
