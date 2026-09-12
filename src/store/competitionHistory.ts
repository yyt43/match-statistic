import type { TournamentCompetition } from '../types';
import type { CompetitionState } from './useTournamentStore';
import type { StoreGet, StoreSet, StoreSetOptions } from './actions/actionTypes';
import type { CompetitionHistoryEntry } from './historyTypes';
import { saveCompetition } from '../utils/storage/storage';
import { persistCompetitionHistory } from '../utils/storage/historyStore';

export const HISTORY_LIMIT = 30;

type RawSet = (
  partial:
    | Partial<CompetitionState>
    | ((state: CompetitionState) => Partial<CompetitionState>)
) => void;

export function cloneCompetition(
  competition: TournamentCompetition
): TournamentCompetition {
  return typeof structuredClone === 'function'
    ? structuredClone(competition)
    : JSON.parse(JSON.stringify(competition)) as TournamentCompetition;
}

export function createHistoryEntry(
  state: CompetitionState,
  label: string
): CompetitionHistoryEntry {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
    label,
    timestamp: new Date().toISOString(),
    competition: cloneCompetition(state.competition),
    viewRound: state.viewRound,
  };
}

function isNavigationOnly(
  current: TournamentCompetition,
  next: TournamentCompetition
): boolean {
  return current.id === next.id
    && current.name === next.name
    && current.createdAt === next.createdAt
    && current.groups === next.groups
    && current.currentGroupIndex !== next.currentGroupIndex;
}

export function createStoreSet(
  rawSet: RawSet,
  get: StoreGet
): StoreSet {
  let pendingSnapshot: CompetitionHistoryEntry | null = null;
  let flushScheduled = false;

  const persistCurrentHistory = () => {
    const state = get();
    void persistCompetitionHistory(state.competition.id, {
      past: state.historyPast,
      future: state.historyFuture,
    });
  };

  const flushHistory = () => {
    flushScheduled = false;
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    if (!snapshot) return;

    rawSet(state => ({
      historyPast: [...state.historyPast, snapshot].slice(-HISTORY_LIMIT),
      historyFuture: [],
    }));
    persistCurrentHistory();
  };

  const clearPendingHistory = () => {
    pendingSnapshot = null;
    flushScheduled = false;
  };

  return (
    partial:
      | Partial<CompetitionState>
      | ((state: CompetitionState) => Partial<CompetitionState>),
    options: StoreSetOptions = {}
  ) => {
    const state = get();
    const nextPartial = typeof partial === 'function' ? partial(state) : partial;

    if (!Object.prototype.hasOwnProperty.call(nextPartial, 'competition')) {
      if (options.history === 'replace') clearPendingHistory();
      rawSet(nextPartial);
      if (options.history === 'replace' && options.persist !== false) {
        queueMicrotask(persistCurrentHistory);
      }
      return;
    }

    const nextCompetition = nextPartial.competition;
    if (!nextCompetition || nextCompetition === state.competition) {
      rawSet(nextPartial);
      return;
    }

    if (isNavigationOnly(state.competition, nextCompetition)) {
      rawSet(nextPartial);
      return;
    }

    if (state.isReadOnly && !options.allowReadOnly) return;

    if (options.history === 'replace') {
      clearPendingHistory();
      rawSet({
        ...nextPartial,
        historyPast: [],
        historyFuture: [],
      });
      if (options.persist !== false) saveCompetition(nextCompetition);
      if (options.persist !== false) queueMicrotask(persistCurrentHistory);
      return;
    }

    if (options.history !== 'skip') {
      if (!pendingSnapshot) {
        pendingSnapshot = createHistoryEntry(state, options.label || 'operation');
      }
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flushHistory);
      }
    }

    rawSet(nextPartial);
    if (options.persist !== false) saveCompetition(nextCompetition);
    if (options.persist !== false && options.history === 'skip') {
      queueMicrotask(persistCurrentHistory);
    }
  };
}
