import { describe, expect, it } from 'vitest';
import {
  BRACKET_MAX_ZOOM,
  BRACKET_MIN_ZOOM,
  clampBracketZoom,
  computeBracketFitZoom,
} from './bracketZoom';

describe('bracket zoom', () => {
  it('clamps to the supported range', () => {
    expect(clampBracketZoom(0.05)).toBe(BRACKET_MIN_ZOOM);
    expect(clampBracketZoom(9)).toBe(BRACKET_MAX_ZOOM);
    expect(clampBracketZoom(1)).toBe(1);
  });

  it('rounds floating point accumulation to two decimals', () => {
    expect(clampBracketZoom(0.1 + 0.2)).toBe(0.3);
    expect(clampBracketZoom(1.0000000001)).toBe(1);
  });

  it('falls back to 100% when nothing has been measured yet', () => {
    expect(computeBracketFitZoom(0, 520)).toBe(1);
    expect(computeBracketFitZoom(1200, 0)).toBe(1);
  });

  it('never enlarges content that already fits', () => {
    expect(computeBracketFitZoom(600, 1200)).toBe(1);
  });

  it('shrinks wide brackets to the container width', () => {
    // 16 人四轮签表约 812px，520px 容器里约 0.64
    expect(computeBracketFitZoom(812, 520)).toBe(0.64);
  });

  it('keeps the shrink inside the minimum zoom', () => {
    expect(computeBracketFitZoom(10000, 400)).toBe(BRACKET_MIN_ZOOM);
  });
});
