import type {
  CompetitionHistoryEntry,
  CompetitionHistoryState,
} from '../../store/historyTypes';
import { CURRENT_STORAGE_VERSION } from './migrations';
import { idbDelete, idbGet, idbSet, isIndexedDbAvailable } from './indexedDb';

const HISTORY_KEY = 'match-statistic-competition-history';
const HISTORY_FORMAT_VERSION = 1;
const LOCAL_HISTORY_LIMIT_BYTES = 1.5 * 1024 * 1024;

interface PersistedHistoryEnvelope {
  formatVersion: number;
  storageVersion: number;
  competitionId: string;
  savedAt: string;
  past: CompetitionHistoryEntry[];
  future: CompetitionHistoryEntry[];
}

let historyWriteQueue: Promise<void> = Promise.resolve();

function isHistoryEntry(value: unknown): value is CompetitionHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CompetitionHistoryEntry>;
  return (
    typeof entry.id === 'string'
    && typeof entry.label === 'string'
    && typeof entry.timestamp === 'string'
    && typeof entry.viewRound === 'number'
    && !!entry.competition
    && typeof entry.competition === 'object'
    && typeof entry.competition.id === 'string'
    && Array.isArray(entry.competition.groups)
  );
}

function parseEnvelope(value: unknown, competitionId: string): CompetitionHistoryState | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Partial<PersistedHistoryEnvelope>;
  if (
    envelope.formatVersion !== HISTORY_FORMAT_VERSION
    || envelope.storageVersion !== CURRENT_STORAGE_VERSION
    || envelope.competitionId !== competitionId
    || !Array.isArray(envelope.past)
    || !Array.isArray(envelope.future)
  ) {
    return null;
  }

  const past = envelope.past.filter(isHistoryEntry);
  const future = envelope.future.filter(isHistoryEntry);
  if (past.length !== envelope.past.length || future.length !== envelope.future.length) {
    return null;
  }
  return { past, future };
}

export function persistCompetitionHistory(
  competitionId: string,
  history: CompetitionHistoryState
): Promise<void> {
  const envelope: PersistedHistoryEnvelope = {
    formatVersion: HISTORY_FORMAT_VERSION,
    storageVersion: CURRENT_STORAGE_VERSION,
    competitionId,
    savedAt: new Date().toISOString(),
    past: history.past,
    future: history.future,
  };

  historyWriteQueue = historyWriteQueue
    .catch(() => undefined)
    .then(async () => {
      if (isIndexedDbAvailable()) {
        try {
          await idbSet(HISTORY_KEY, envelope);
        } catch (error) {
          console.warn('[history] IndexedDB write failed:', error);
        }
      }

      try {
        const serialized = JSON.stringify(envelope);
        if (serialized.length <= LOCAL_HISTORY_LIMIT_BYTES) {
          localStorage.setItem(HISTORY_KEY, serialized);
        } else {
          localStorage.removeItem(HISTORY_KEY);
        }
      } catch (error) {
        console.warn('[history] localStorage fallback write failed:', error);
      }
    });

  return historyWriteQueue;
}

export async function loadCompetitionHistory(
  competitionId: string
): Promise<CompetitionHistoryState | null> {
  await historyWriteQueue.catch(() => undefined);

  if (isIndexedDbAvailable()) {
    try {
      const stored = parseEnvelope(await idbGet<unknown>(HISTORY_KEY), competitionId);
      if (stored) return stored;
    } catch (error) {
      console.warn('[history] IndexedDB read failed:', error);
    }
  }

  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? parseEnvelope(JSON.parse(raw), competitionId) : null;
  } catch {
    return null;
  }
}

export function clearCompetitionHistory(): Promise<void> {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore fallback cleanup errors.
  }

  historyWriteQueue = historyWriteQueue
    .catch(() => undefined)
    .then(async () => {
      if (!isIndexedDbAvailable()) return;
      try {
        await idbDelete(HISTORY_KEY);
      } catch (error) {
        console.warn('[history] IndexedDB clear failed:', error);
      }
    });
  return historyWriteQueue;
}

export function flushCompetitionHistory(): Promise<void> {
  return historyWriteQueue;
}
