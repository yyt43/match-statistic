import { describe, expect, it, vi } from 'vitest';
import { createEscapeStack } from './useEscapeClose';

describe('createEscapeStack', () => {
  it('closes only the top-most modal per ESC', () => {
    const stack = createEscapeStack();
    const closed: string[] = [];

    stack.push(() => closed.push('help'));
    stack.push(() => closed.push('command-palette'));

    expect(stack.size()).toBe(2);
    expect(stack.closeTop()).toBe(true);
    expect(closed).toEqual(['command-palette']);
    expect(stack.size()).toBe(1);

    expect(stack.closeTop()).toBe(true);
    expect(closed).toEqual(['command-palette', 'help']);
    expect(stack.size()).toBe(0);
  });

  it('returns false when the stack is empty', () => {
    const stack = createEscapeStack();
    expect(stack.closeTop()).toBe(false);
  });

  it('stops closing removed entries', () => {
    const stack = createEscapeStack();
    const closed: string[] = [];
    const first = stack.push(() => closed.push('first'));
    stack.push(() => closed.push('second'));

    stack.remove(first);
    expect(stack.size()).toBe(1);
    stack.closeTop();
    expect(closed).toEqual(['second']);
  });

  it('removes entries independently and ignores unknown ones', () => {
    const stack = createEscapeStack();
    const first = stack.push(vi.fn());
    const second = stack.push(vi.fn());

    stack.remove(second);
    stack.remove({ id: 999, close: vi.fn() });
    expect(stack.size()).toBe(1);
    expect(stack.closeTop()).toBe(true);
    expect(stack.size()).toBe(0);
    stack.remove(first);
    expect(stack.size()).toBe(0);
  });
});
