import { describe, expect, it } from 'vitest';
import {
  coerceEvidenceStatus,
  defaultEvidenceStatus,
  isEvidenceBlocked,
  normalizeEvidencePolicy,
  summarizeEvidence,
} from './evidencePolicy';

describe('evidence policy', () => {
  it('falls back to off for unknown values', () => {
    expect(normalizeEvidencePolicy(undefined)).toBe('off');
    expect(normalizeEvidencePolicy('anything')).toBe('off');
    expect(normalizeEvidencePolicy('strict')).toBe('strict');
  });

  it('derives the default row status from the policy', () => {
    expect(defaultEvidenceStatus('off')).toBe('not_required');
    expect(defaultEvidenceStatus('required')).toBe('pending');
    expect(defaultEvidenceStatus('strict')).toBe('pending');
  });

  it('coerces statuses when the policy changes', () => {
    expect(coerceEvidenceStatus('not_required', 'strict')).toBe('pending');
    expect(coerceEvidenceStatus('pending', 'off')).toBe('not_required');
    expect(coerceEvidenceStatus('verified', 'off')).toBe('verified');
  });

  it('blocks only mismatched or unreadable rows when screenshots are optional', () => {
    expect(isEvidenceBlocked('not_required', 'off')).toBe(false);
    expect(isEvidenceBlocked('pending', 'off')).toBe(false);
    expect(isEvidenceBlocked('verified', 'off')).toBe(false);
    expect(isEvidenceBlocked('mismatch', 'off')).toBe(true);
    expect(isEvidenceBlocked('unreadable', 'off')).toBe(true);
  });

  it('blocks everything except verified rows in strict mode', () => {
    expect(isEvidenceBlocked('verified', 'strict')).toBe(false);
    expect(isEvidenceBlocked('pending', 'strict')).toBe(true);
    expect(isEvidenceBlocked('not_required', 'strict')).toBe(true);
  });

  it('summarizes verified, pending and blocked rows', () => {
    const summary = summarizeEvidence(['verified', 'pending', 'mismatch', 'pending'], 'off');
    expect(summary).toEqual({ total: 4, verified: 1, pending: 2, blocked: 1 });
    const strict = summarizeEvidence(['verified', 'pending', 'mismatch', 'pending'], 'strict');
    expect(strict).toEqual({ total: 4, verified: 1, pending: 0, blocked: 3 });
  });
});
