import { useEffect } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import {
  canUseWriterLease,
  readWriterLease,
  releaseWriterLease,
  resolveWriterLease,
  TAB_ID,
  WRITER_LEASE_HEARTBEAT_MS,
  WRITER_LEASE_KEY,
  WRITER_LEASE_TTL_MS,
  writeWriterLease,
} from '../utils/storage/storageSync';

const WRITER_LOCK_NAME = 'match-statistic-active-writer';
const WEB_LOCK_RETRY_MS = 3000;

function hasWebLocks(): boolean {
  return 'locks' in navigator && navigator.locks !== undefined;
}

export function useWriterLock(): void {
  const setReadOnly = useTournamentStore(state => state.setReadOnly);

  useEffect(() => {
    // Prefer the Web Locks API: the browser releases the lock automatically when
    // the tab crashes, which is more reliable than the lease fallback below.
    if (hasWebLocks()) return holdWebLock(setReadOnly);
    return holdWriterLease(setReadOnly);
  }, [setReadOnly]);
}

function holdWebLock(setReadOnly: (readOnly: boolean) => void): () => void {
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
  const retryTimer = window.setInterval(acquire, WEB_LOCK_RETRY_MS);
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
}

/**
 * No Web Locks (e.g. older browsers): elect a single writer with a localStorage
 * lease. The lease holder refreshes a heartbeat; other tabs stay read-only and
 * retry. A crash/reload is repaired by lease expiry or the storage/unload events,
 * so there is never more than one writable tab.
 */
function holdWriterLease(setReadOnly: (readOnly: boolean) => void): () => void {
  // Without localStorage there is no cross-tab coordination available at all.
  // Stay writable (as before) instead of locking the user out of a single tab.
  if (!canUseWriterLease()) {
    setReadOnly(false);
    return () => undefined;
  }

  let cancelled = false;
  let readOnlyApplied: boolean | null = null;
  const applyReadOnly = (readOnly: boolean) => {
    if (readOnlyApplied === readOnly) return;
    readOnlyApplied = readOnly;
    setReadOnly(readOnly);
  };

  /** Claim or renew the lease; returns whether this tab currently owns it. */
  const claim = (): boolean => {
    if (cancelled) return false;
    const now = Date.now();
    const decision = resolveWriterLease(readWriterLease(), TAB_ID, now);
    if (decision === 'wait') return false;

    writeWriterLease({ tabId: TAB_ID, expiresAt: now + WRITER_LEASE_TTL_MS });
    // Read back: two tabs claiming at the same instant must not both think they won.
    return readWriterLease()?.tabId === TAB_ID;
  };

  const tick = () => {
    applyReadOnly(!claim());
  };

  // Defer the first claim so React StrictMode's mount/unmount probe cannot take
  // the lease and immediately release it before the second effect claims again.
  const initialTimer = window.setTimeout(tick, 0);
  const heartbeatTimer = window.setInterval(tick, WRITER_LEASE_HEARTBEAT_MS);

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') tick();
  };
  const handleStorage = (event: StorageEvent) => {
    // A lease change (released or taken over) means the writer may have changed.
    if (event.key !== null && event.key !== WRITER_LEASE_KEY) return;
    tick();
  };
  const handleUnload = () => releaseWriterLease(TAB_ID);

  window.addEventListener('focus', handleVisibility);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('storage', handleStorage);
  // Coming back from the bfcache must re-check ownership: the lease may have
  // been taken over while this page was frozen.
  window.addEventListener('pageshow', tick);
  // Release eagerly on unload so another tab can take over without waiting for
  // the lease to expire.
  window.addEventListener('pagehide', handleUnload);
  window.addEventListener('beforeunload', handleUnload);

  return () => {
    cancelled = true;
    window.clearTimeout(initialTimer);
    window.clearInterval(heartbeatTimer);
    window.removeEventListener('focus', handleVisibility);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('pageshow', tick);
    window.removeEventListener('pagehide', handleUnload);
    window.removeEventListener('beforeunload', handleUnload);
    releaseWriterLease(TAB_ID);
  };
}
