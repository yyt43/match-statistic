import { describe, expect, it } from 'vitest';
import { clampPreviewRound, resolvePreviewGroup } from './exportPreviewState';

describe('resolvePreviewGroup', () => {
  const groups = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const fallback = { id: 'fallback' };

  it('returns the group at a valid index', () => {
    expect(resolvePreviewGroup(groups, 1, fallback)).toEqual({ id: 'b' });
    expect(resolvePreviewGroup(groups, 0, fallback)).toEqual({ id: 'a' });
  });

  it('falls back for out-of-range or invalid indexes', () => {
    expect(resolvePreviewGroup(groups, -1, fallback)).toEqual(fallback);
    expect(resolvePreviewGroup(groups, 3, fallback)).toEqual(fallback);
    expect(resolvePreviewGroup(groups, 1.5, fallback)).toEqual(fallback);
    expect(resolvePreviewGroup(groups, Number.NaN, fallback)).toEqual(fallback);
    expect(resolvePreviewGroup([], 0, fallback)).toEqual(fallback);
  });
});

describe('clampPreviewRound', () => {
  it('keeps a valid round unchanged', () => {
    expect(clampPreviewRound({ currentRound: 5 }, 3)).toBe(3);
  });

  it('clamps below 1 and above the group current round', () => {
    expect(clampPreviewRound({ currentRound: 5 }, 0)).toBe(1);
    expect(clampPreviewRound({ currentRound: 5 }, -2)).toBe(1);
    expect(clampPreviewRound({ currentRound: 5 }, 9)).toBe(5);
  });

  it('handles not-started groups and invalid input', () => {
    expect(clampPreviewRound({ currentRound: 0 }, 3)).toBe(1);
    expect(clampPreviewRound({ currentRound: 0 }, 0)).toBe(1);
    expect(clampPreviewRound({ currentRound: 4 }, Number.NaN)).toBe(4);
  });
});
