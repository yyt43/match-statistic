import { describe, expect, it } from 'vitest';
import { formatText, translations } from './i18nData';

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
}

describe('translations', () => {
  it('keeps Chinese and English keys in sync', () => {
    expect(Object.keys(translations.en).sort()).toEqual(Object.keys(translations.zh).sort());
  });

  it('does not contain empty translations', () => {
    for (const language of ['zh', 'en'] as const) {
      for (const [key, value] of Object.entries(translations[language])) {
        expect(value.trim(), `${language}.${key}`).not.toBe('');
      }
    }
  });

  it('uses matching interpolation placeholders in both languages', () => {
    for (const key of Object.keys(translations.zh) as Array<keyof typeof translations.zh>) {
      expect(placeholders(translations.en[key]), key).toEqual(placeholders(translations.zh[key]));
    }
  });

  it('formats values and preserves unknown placeholders', () => {
    expect(formatText('Round {round} - {missing}', { round: 3 })).toBe('Round 3 - {missing}');
  });
});
