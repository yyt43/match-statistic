import { describe, expect, it } from 'vitest';
import { createAbortError, isAbortError, throwIfAborted } from './async';

describe('async utilities', () => {
  it('identifies aborted operations without treating other errors as cancellation', () => {
    expect(isAbortError(createAbortError())).toBe(true);
    expect(isAbortError(new Error('export failed'))).toBe(false);
    expect(isAbortError('abort')).toBe(false);
  });

  it('throws only when the signal is already aborted', () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();

    controller.abort();
    try {
      throwIfAborted(controller.signal);
      throw new Error('Expected throwIfAborted to throw.');
    } catch (error) {
      expect(isAbortError(error)).toBe(true);
    }
  });
});
