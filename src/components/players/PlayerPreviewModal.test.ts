import { describe, expect, it } from 'vitest';
import { getPreviewLayout } from './playerPreviewLayout';

describe('player preview layout', () => {
  it('uses a single centered column for one group', () => {
    expect(getPreviewLayout(1)).toEqual({
      containerClass: 'max-w-3xl',
      gridClass: 'grid-cols-1',
    });
  });

  it('uses two columns for two or four groups', () => {
    expect(getPreviewLayout(2).gridClass).toBe('grid-cols-1 md:grid-cols-2');
    expect(getPreviewLayout(4).gridClass).toBe('grid-cols-1 md:grid-cols-2');
  });

  it('uses three columns for three, five, or six groups', () => {
    expect(getPreviewLayout(3).gridClass).toBe('grid-cols-1 md:grid-cols-2 xl:grid-cols-3');
    expect(getPreviewLayout(5).gridClass).toBe('grid-cols-1 md:grid-cols-2 xl:grid-cols-3');
    expect(getPreviewLayout(6).gridClass).toBe('grid-cols-1 md:grid-cols-2 xl:grid-cols-3');
  });

  it('uses four columns for seven or more groups', () => {
    expect(getPreviewLayout(8).gridClass).toBe('grid-cols-1 md:grid-cols-2 xl:grid-cols-4');
  });
});
