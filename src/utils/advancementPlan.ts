import type {
  AdvanceSelector,
  AdvanceSlot,
  SeatingPlan,
  StageAdvancementPlan,
  TournamentStage,
} from '../types';

/** 同组名次配对的默认对阵：3 对 6、4 对 5。 */
export const DEFAULT_RANK_PAIRS: ReadonlyArray<[number, number]> = [
  [3, 6],
  [4, 5],
];

/** 新建一条晋级去向时的默认选人条件：每组前 2 名。 */
export const DEFAULT_SELECTOR: Readonly<AdvanceSelector> = { fromRank: 1, toRank: 2 };

let slotSeed = 0;

/** 生成一条默认晋级去向（目标赛段由调用方填写）。 */
export function createAdvanceSlot(targetStageId = ''): AdvanceSlot {
  slotSeed += 1;
  return {
    id: `slot-${Date.now().toString(36)}-${slotSeed}`,
    selectors: [{ ...DEFAULT_SELECTOR }],
    targetStageId,
  };
}

/** 生成一条新的选人条件。 */
export function createSelector(overrides: Partial<AdvanceSelector> = {}): AdvanceSelector {
  return { ...DEFAULT_SELECTOR, ...overrides };
}

/**
 * 生成一条按胜场选人的条件（单败淘汰赛段更严谨）：
 * 名次区间只是占位、计算时会被忽略；不填胜场表示全部晋级。
 */
export function createWinsSelector(minWins?: number, maxWins?: number): AdvanceSelector {
  const selector: AdvanceSelector = { mode: 'wins', fromRank: 1, toRank: 64 };
  if (minWins !== undefined) selector.minWins = Math.max(0, Math.floor(minWins));
  if (maxWins !== undefined) selector.maxWins = Math.max(0, Math.floor(maxWins));
  return selector;
}

/** 只读取晋级计划时需要的字段子集（赛事赛段与设置页草稿都满足）。 */
export type AdvancementPlanSource = Pick<TournamentStage, 'advancementPlan' | 'advancementRules'>;

/** 只读取落位设置时需要的字段子集（赛事赛段与设置页草稿都满足）。 */
export type SeatingPlanSource = Pick<TournamentStage, 'seating' | 'seedRules' | 'breakout'>;

/**
 * 读取赛段的晋级计划：优先用新字段 `advancementPlan`，
 * 否则把旧的 `advancementRules` 映射成等价计划（旧存档兼容）。
 */
export function normalizeAdvancementPlan(stage: AdvancementPlanSource): StageAdvancementPlan | undefined {
  const plan = stage.advancementPlan;
  if (plan && plan.slots.length > 0) {
    return plan;
  }
  const legacyRules = stage.advancementRules ?? [];
  if (legacyRules.length === 0) return undefined;
  return {
    slots: legacyRules.map(rule => ({
      id: rule.id,
      targetStageId: rule.targetStageId,
      selectors: [
        {
          fromRank: rule.fromRank,
          toRank: rule.toRank,
          ...(rule.minWins !== undefined ? { minWins: rule.minWins } : {}),
          ...(rule.maxWins !== undefined ? { maxWins: rule.maxWins } : {}),
        },
      ],
    })),
  };
}

/** 该赛段是否配置了晋级去向。 */
export function hasAdvancementPlan(stage: TournamentStage): boolean {
  return (normalizeAdvancementPlan(stage)?.slots.length ?? 0) > 0;
}

function normalizePairs(pairs: Array<[number, number]> | undefined): Array<[number, number]> {
  const source = pairs && pairs.length > 0 ? pairs : DEFAULT_RANK_PAIRS;
  return source.map(([first, second]) => [Math.max(1, Math.floor(first)), Math.max(1, Math.floor(second))]);
}

/**
 * 读取赛段的落位方式：优先用新字段 `seating`，
 * 否则把旧的 `seedRules` / `breakout` 映射成等价落位设置（旧存档兼容）。
 */
export function normalizeSeatingPlan(stage: SeatingPlanSource): SeatingPlan {
  const seating = stage.seating;
  if (seating) {
    if (seating.mode === 'rankPairs') {
      return { mode: 'rankPairs', pairs: normalizePairs(seating.pairs) };
    }
    if (seating.mode === 'fixedSlots') {
      return { mode: 'fixedSlots', slots: (seating.slots ?? []).map(slot => ({ ...slot })) };
    }
    return { mode: seating.mode };
  }
  const seedRules = stage.seedRules ?? [];
  if (seedRules.length > 0) {
    return {
      mode: 'fixedSlots',
      slots: seedRules.map(rule => ({
        sourceGroupName: rule.sourceGroupName,
        rank: rule.rank,
        slot: rule.targetSlot,
      })),
    };
  }
  if (stage.breakout) {
    return { mode: 'rankPairs', pairs: normalizePairs(stage.breakout.pairings) };
  }
  return { mode: 'ordered' };
}

/** 该赛段是否使用「同组名次配对」（旧称突围配对）落位。 */
export function usesRankPairsSeating(stage: TournamentStage): boolean {
  return normalizeSeatingPlan(stage).mode === 'rankPairs';
}

/** 该赛段是否使用「固定签位」落位。 */
export function usesFixedSlotsSeating(stage: TournamentStage): boolean {
  return normalizeSeatingPlan(stage).mode === 'fixedSlots';
}
