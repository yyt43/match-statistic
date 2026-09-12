import { idbDelete, idbGet, idbSet, isIndexedDbAvailable } from './storage/indexedDb';
import { TAB_ID } from './storage/storageSync';

const AUDIT_KEY = 'match-statistic-audit-log';
const MAX_ENTRIES = 200;
let auditWriteQueue: Promise<void> = Promise.resolve();

export type AuditAction =
  | 'match-result'
  | 'round-undo'
  | 'tournament-reset'
  | 'tournament-import'
  | 'player-drop'
  | 'player-restore'
  | 'snapshot-restore'
  | 'conflict-resolve';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  summary: string;
  sourceId: string;
  details?: Record<string, string | number | boolean | undefined>;
}

export async function listAuditEntries(): Promise<AuditEntry[]> {
  if (isIndexedDbAvailable()) {
    try {
      const entries = await idbGet<AuditEntry[]>(AUDIT_KEY);
      if (Array.isArray(entries)) return entries;
    } catch (error) {
      console.warn('[audit] IndexedDB read failed:', error);
    }
  }

  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

async function persistAuditEntry(entry: AuditEntry): Promise<void> {
  const entries = [entry, ...await listAuditEntries()].slice(0, MAX_ENTRIES);

  if (isIndexedDbAvailable()) {
    try {
      await idbSet(AUDIT_KEY, entries);
      return;
    } catch (error) {
      console.warn('[audit] IndexedDB write failed:', error);
    }
  }

  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('[audit] localStorage write failed:', error);
  }
}

export function logAudit(
  action: AuditAction,
  summary: string,
  details?: AuditEntry['details']
): Promise<void> {
  const entry: AuditEntry = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    action,
    summary,
    sourceId: TAB_ID,
    details,
  };
  auditWriteQueue = auditWriteQueue.then(() => persistAuditEntry(entry));
  return auditWriteQueue;
}

export async function clearAuditEntries(): Promise<void> {
  await auditWriteQueue;
  try {
    localStorage.removeItem(AUDIT_KEY);
  } catch {
    // Ignore fallback cleanup errors.
  }
  if (isIndexedDbAvailable()) {
    try {
      await idbDelete(AUDIT_KEY);
    } catch (error) {
      console.warn('[audit] IndexedDB clear failed:', error);
    }
  }
}
