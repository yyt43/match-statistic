import { describe, expect, it } from 'vitest';
import {
  HELP_CONTENT_EN,
  HELP_CONTENT_ZH,
  helpContent,
  type HelpCopy,
} from './helpContent';

/** 所有「两侧数量必须一致」的数组型文案区块。 */
const ARRAY_SECTIONS = [
  'featureItems',
  'shortcutGroups',
  'steps',
  'swissRuleItems',
  'swissRankingRuleItems',
  'eliminationRuleItems',
  'storageItems',
  'faqItems',
  'disclaimerItems',
] as const satisfies ReadonlyArray<keyof HelpCopy>;

describe('help content language parity', () => {
  it('registers both copies on the language map', () => {
    expect(helpContent.zh).toBe(HELP_CONTENT_ZH);
    expect(helpContent.en).toBe(HELP_CONTENT_EN);
  });

  it('keeps the same copy keys in both languages', () => {
    expect(Object.keys(HELP_CONTENT_EN).sort()).toEqual(Object.keys(HELP_CONTENT_ZH).sort());
  });

  it('keeps every content section the same length in both languages', () => {
    for (const section of ARRAY_SECTIONS) {
      expect(HELP_CONTENT_EN[section], `section: ${section}`)
        .toHaveLength(HELP_CONTENT_ZH[section].length);
    }
  });

  it('keeps feature cards in the same id order', () => {
    expect(HELP_CONTENT_EN.featureItems.map(item => item.id))
      .toEqual(HELP_CONTENT_ZH.featureItems.map(item => item.id));
  });

  it('keeps quick-start steps in the same id order', () => {
    expect(HELP_CONTENT_EN.steps.map(step => step.id))
      .toEqual(HELP_CONTENT_ZH.steps.map(step => step.id));
  });

  it('covers the cards and step that were previously missing in English', () => {
    const featureIds = HELP_CONTENT_EN.featureItems.map(item => item.id);
    expect(featureIds).toContain('player-profiles');
    expect(featureIds).toContain('result-import');
    expect(HELP_CONTENT_EN.steps.map(step => step.id)).toContain('multi-stage');
  });

  it('uses unique feature card ids and step ids', () => {
    for (const copy of [HELP_CONTENT_ZH, HELP_CONTENT_EN]) {
      const featureIds = copy.featureItems.map(item => item.id);
      const stepIds = copy.steps.map(step => step.id);
      expect(new Set(featureIds).size).toBe(featureIds.length);
      expect(new Set(stepIds).size).toBe(stepIds.length);
    }
  });

  it('gives every localized entry non-empty text', () => {
    for (const [language, copy] of Object.entries(helpContent)) {
      expect(copy.close.trim(), `${language}.close`).not.toBe('');
      expect(copy.subtitle.trim(), `${language}.subtitle`).not.toBe('');
      for (const feature of copy.featureItems) {
        const where = `${language}.feature.${feature.id}`;
        expect(feature.title.trim(), `${where}.title`).not.toBe('');
        expect(feature.description.trim(), `${where}.description`).not.toBe('');
      }
      for (const step of copy.steps) {
        const where = `${language}.step.${step.id}`;
        expect(step.title.trim(), `${where}.title`).not.toBe('');
        expect(step.items.length, `${where}.items`).toBeGreaterThan(0);
        for (const item of step.items) {
          expect(item.trim(), `${where}.item`).not.toBe('');
        }
      }
    }
  });
});
