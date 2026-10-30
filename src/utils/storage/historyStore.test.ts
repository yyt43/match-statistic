import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';
import type { CompetitionHistoryEntry } from '../../store/historyTypes';
import { CURRENT_STORAGE_VERSION } from './migrations';
import {
  clearCompetitionHistory,
  flushCompetitionHistory,
  loadCompetitionHistory,
  persistCompetitionHistory,
} from './historyStore';

const HISTORY_KEY = 'match-statistic-competition-history';

function entry(
  label: string,
  name: string,
  competitionId = 'competition-1'
): CompetitionHistoryEntry {
  const competition = createNewCompetition(name);
  competition.id = competitionId;
  return {
    id: label,
    label,
    timestamp: '2026-09-12T00:00:00.000Z',
    viewRound: 0,
    competition,
  };
}

describe('persistent competition history', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists and restores the undo/redo stacks', async () => {
    const competitionId = 'competition-1';
    await persistCompetitionHistory(competitionId, {
      past: [entry('rename', 'Before rename')],
      future: [],
    });
    await flushCompetitionHistory();

    const restored = await loadCompetitionHistory(competitionId);
    expect(restored?.past).toHaveLength(1);
    expect(restored?.past[0].label).toBe('rename');
  });

  it('drops only the entries that belong to another competition', async () => {
    values.set(HISTORY_KEY, JSON.stringify({
      formatVersion: 1,
      storageVersion: CURRENT_STORAGE_VERSION,
      competitionId: 'competition-1',
      savedAt: '2026-09-12T00:00:00.000Z',
      past: [
        entry('keep', 'Keep me'),
        entry('foreign', 'Other event', 'competition-2'),
        { id: 'broken' },
      ],
      future: [entry('future', 'Future entry')],
    }));

    const restored = await loadCompetitionHistory('competition-1');
    expect(restored?.past).toHaveLength(1);
    expect(restored?.past[0].label).toBe('keep');
    expect(restored?.future).toHaveLength(1);
  });

  it('does not restore history for a different competition', async () => {
    await persistCompetitionHistory('competition-1', {
      past: [entry('rename', 'Before rename')],
      future: [],
    });
    await flushCompetitionHistory();

    expect(await loadCompetitionHistory('competition-2')).toBeNull();
  });

  it('clears persisted history', async () => {
    await persistCompetitionHistory('competition-1', {
      past: [entry('rename', 'Before rename')],
      future: [],
    });
    await clearCompetitionHistory();

    expect(await loadCompetitionHistory('competition-1')).toBeNull();
  });
});
