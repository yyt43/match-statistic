import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';
import type { CompetitionHistoryEntry } from '../../store/historyTypes';
import {
  clearCompetitionHistory,
  flushCompetitionHistory,
  loadCompetitionHistory,
  persistCompetitionHistory,
} from './historyStore';

function entry(label: string, name: string): CompetitionHistoryEntry {
  return {
    id: label,
    label,
    timestamp: '2026-09-12T00:00:00.000Z',
    viewRound: 0,
    competition: createNewCompetition(name),
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
