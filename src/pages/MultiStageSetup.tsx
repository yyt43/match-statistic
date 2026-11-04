import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Languages,
  Layers,
  Plus,
  Swords,
  Trash2,
  Trophy,
} from 'lucide-react';
import type {
  AdvanceSelector,
  GameType,
  PairingType,
  SameGroupMode,
  SeatingMode,
  StageAdvancementPlan,
  StageSeedRule,
} from '../types';
import { useLanguagePreference } from '../i18n/context';
import { useTournamentStore } from '../store/useTournamentStore';
import { createDefaultStageDraft, createMultiStageCompetition } from '../store/multiStageFactory';
import { getDraftGroupNames, type MultiStageDraftStage } from '../utils/multiStage';
import {
  DEFAULT_RANK_PAIRS,
  createAdvanceSlot,
  createSelector,
  createWinsSelector,
  getSameGroupMode,
  normalizeAdvancementPlan,
  normalizeSeatingPlan,
} from '../utils/advancementPlan';
import { validateStageDrafts } from '../utils/stageDraftValidation';
import { getSingleEliminationRounds } from '../utils/swissPairing';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { StorageBanner } from '../components/common/StorageBanner';
import { WriterLockBanner } from '../components/common/WriterLockBanner';
import { EventFlowDiagram } from '../components/competition/EventFlowDiagram';

const GAME_TYPES: GameType[] = ['bo1', 'bo3', 'bo5', 'bo7'];

function fitRoundGameTypes(
  values: GameType[] | undefined,
  length: number,
  fallback: GameType
): GameType[] {
  const next = (values ?? []).slice(0, length);
  while (next.length < length) next.push(fallback);
  return next;
}

function effectiveRounds(stage: MultiStageDraftStage): number {
  if (stage.fixedRounds !== undefined) return stage.fixedRounds;
  return stage.kind === 'single_elimination'
    ? getSingleEliminationRounds(stage.playerCountPerGroup)
    : stage.rounds;
}

/** 一个赛段至少会有多少人到达：有上游时按上游最少晋级人数累计，否则按小组数 × 每组人数。 */
function minIncomingPlayers(stage: MultiStageDraftStage, stages: MultiStageDraftStage[]): number {
  if (!stage.sourceStageIds?.length) {
    return Math.max(2, stage.groupCount * stage.playerCountPerGroup);
  }
  const incoming = stage.sourceStageIds.reduce((total, sourceId) => {
    const source = stages.find(item => item.id === sourceId);
    if (!source) return total;
    const plan = normalizeAdvancementPlan(source);
    const perGroup = plan?.slots.reduce((sum, slot) => {
      const selectorTotal = slot.selectors.reduce((acc, selector) => {
        if (selector.mode === 'wins') return acc + 1;
        return acc + Math.max(1, selector.toRank - selector.fromRank + 1);
      }, 0);
      return sum + Math.max(1, selectorTotal);
    }, 0) ?? 1;
    return total + Math.max(1, source.groupCount * Math.max(1, perGroup));
  }, 0);
  return Math.max(2, incoming);
}

/**
 * 一个赛段最多可能到达多少人：按胜场取人时人数不固定，这里按「整个来源小组都可能晋级」估算上限，
 * 让下游单败赛段的自动轮数足够覆盖最坏情况。
 */
function maxIncomingPlayers(stage: MultiStageDraftStage, stages: MultiStageDraftStage[]): number {
  if (!stage.sourceStageIds?.length) {
    return Math.max(2, stage.groupCount * stage.playerCountPerGroup);
  }
  const incoming = stage.sourceStageIds.reduce((total, sourceId) => {
    const source = stages.find(item => item.id === sourceId);
    if (!source) return total;
    const plan = normalizeAdvancementPlan(source);
    const sourceGroupSize = Math.max(
      2,
      Math.ceil(maxIncomingPlayers(source, stages) / Math.max(1, source.groupCount))
    );
    const perGroup = plan?.slots.reduce((sum, slot) => {
      const selectorTotal = slot.selectors.reduce((acc, selector) => {
        if (selector.mode === 'wins') return acc + sourceGroupSize;
        return acc + Math.max(1, selector.toRank - selector.fromRank + 1);
      }, 0);
      return sum + Math.max(1, selectorTotal);
    }, 0) ?? sourceGroupSize;
    const takeCaps = (plan?.slots ?? []).flatMap(slot =>
      slot.selectors.map(selector => selector.take).filter((take): take is number => typeof take === 'number')
    );
    const possible = Math.max(1, source.groupCount * Math.max(1, perGroup));
    return total + (takeCaps.length > 0 ? Math.min(possible, Math.min(...takeCaps)) : possible);
  }, 0);
  return Math.max(2, incoming);
}

/**
 * 轮数由赛制自动推导，不再单独设置：
 * 瑞士轮按每组人数取 ceil(log2 n)，单败淘汰按最多可能到达人数取 ceil(log2 n)，保证签表放得下。
 */
function autoRounds(stage: MultiStageDraftStage, stages: MultiStageDraftStage[]): number {
  const players = stage.kind === 'swiss'
    ? Math.max(2, stage.playerCountPerGroup)
    : maxIncomingPlayers(stage, stages);
  const max = stage.kind === 'swiss' ? 20 : 8;
  return Math.min(max, Math.max(1, Math.ceil(Math.log2(players))));
}

/** 各轮局制是否一致；不一致时返回 'custom'，供「每轮局数」下拉展示。 */
function commonGameType(stage: MultiStageDraftStage): GameType | 'custom' {
  const length = effectiveRounds(stage);
  const first = stage.roundGameTypes[0] ?? stage.gameType;
  for (let index = 1; index < length; index += 1) {
    if ((stage.roundGameTypes[index] ?? stage.gameType) !== first) return 'custom';
  }
  return first;
}

interface NumberFieldProps {
  value: number | undefined;
  onCommit: (next: number | undefined) => void;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

/**
 * 数字输入框：编辑时保留用户输入（可以整段清空），
 * 失焦或回车时才把合法值写回，避免「删空立刻跳回 1」。
 */
function NumberField({
  value,
  onCommit,
  min = 1,
  max = 64,
  allowEmpty = false,
  ariaLabel,
  placeholder,
  className = 'w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50',
}: NumberFieldProps) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value === undefined ? '' : String(value));
  }, [value, focused]);

  const commitDraft = () => {
    const raw = draft.trim();
    if (raw === '') {
      if (!allowEmpty) setDraft(value === undefined ? '' : String(value));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(value === undefined ? '' : String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.floor(parsed)));
    setDraft(String(clamped));
    onCommit(clamped);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={event => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw === '' && allowEmpty) onCommit(undefined);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commitDraft();
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          (event.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}

/** 选手从 sourceStageId 晋级到 targetStageId 后，目标赛段的名单就来自这个上游。 */
function linkTargetSource(
  stages: MultiStageDraftStage[],
  sourceStageId: string,
  targetStageId: string
): MultiStageDraftStage[] {
  if (!targetStageId) return stages;
  return stages.map(stage => {
    if (stage.id !== targetStageId) return stage;
    const sources = stage.sourceStageIds ?? [];
    if (sources.includes(sourceStageId)) return stage;
    return { ...stage, sourceStageIds: [...sources, sourceStageId] };
  });
}

export default function MultiStageSetup() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguagePreference();
  const isEnglish = language === 'en';
  const initMultiStageCompetition = useTournamentStore(state => state.initMultiStageCompetition);
  const loadSavedCompetition = useTournamentStore(state => state.loadSavedCompetition);
  const competition = useTournamentStore(state => state.competition);

  const [nameInput, setNameInput] = useState('新建赛事');
  const [stages, setStages] = useState<MultiStageDraftStage[]>(() => [createDefaultStageDraft(1)]);
  // 已有赛事（存档或内存中）时，开始搭建会覆盖它，需要二次确认。
  const [hasSavedEvent, setHasSavedEvent] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  useEffect(() => {
    let active = true;
    void loadSavedCompetition().then(loaded => {
      if (active) setHasSavedEvent(Boolean(loaded));
    });
    return () => {
      active = false;
    };
  }, [loadSavedCompetition]);

  const hasExistingEvent =
    hasSavedEvent ||
    competition.groups.some(group => group.players.length > 0 || group.matches.length > 0);

  const updateStage = (stageId: string, patch: Partial<MultiStageDraftStage>) => {
    setStages(current => current.map(stage => {
      if (stage.id !== stageId) return stage;
      const next = { ...stage, ...patch };
      const length = effectiveRounds(next);
      return {
        ...next,
        roundGameTypes: fitRoundGameTypes(next.roundGameTypes, length, next.gameType),
      };
    }));
  };

  // 轮数不再单独设置：赛制、人数或来源变化后自动推导一次，草稿里同步成 derivable 值。
  useEffect(() => {
    setStages(current => {
      let changed = false;
      const next = current.map(stage => {
        const rounds = autoRounds(stage, current);
        const fixedRounds = stage.kind === 'single_elimination' ? rounds : undefined;
        if (stage.rounds === rounds && stage.fixedRounds === fixedRounds) return stage;
        changed = true;
        return {
          ...stage,
          rounds,
          fixedRounds,
          roundGameTypes: fitRoundGameTypes(stage.roundGameTypes, rounds, stage.gameType),
        };
      });
      return changed ? next : current;
    });
  }, [stages]);

  /** 修改晋级计划；目标赛段变化时自动补上「名单来自上游」的依赖。 */
  const updateAdvancementPlan = (
    stageId: string,
    updater: (plan: StageAdvancementPlan) => StageAdvancementPlan
  ) => {
    setStages(current => current.map(stage => {
      if (stage.id !== stageId) return stage;
      const plan = normalizeAdvancementPlan(stage) ?? { slots: [] };
      return { ...stage, advancementPlan: updater(plan) };
    }));
  };

  /** 新增一条去向（默认选中第一个候选下游赛段；单败淘汰来源默认按淘汰轮次选人）。 */
  const addPlanSlot = (stageId: string, targetStageId: string, sourceKind?: PairingType) => {
    const slot = createAdvanceSlot(targetStageId);
    if (sourceKind === 'single_elimination') {
      slot.selectors = [createWinsSelector()];
    }
    updateAdvancementPlan(stageId, plan => ({
      slots: [...plan.slots, slot],
    }));
    if (targetStageId) {
      setStages(current => linkTargetSource(current, stageId, targetStageId));
    }
  };

  const removePlanSlot = (stageId: string, slotId: string) => {
    updateAdvancementPlan(stageId, plan => ({
      slots: plan.slots.filter(slot => slot.id !== slotId),
    }));
  };

  const setPlanSlotTarget = (stageId: string, slotId: string, targetStageId: string) => {
    updateAdvancementPlan(stageId, plan => ({
      slots: plan.slots.map(slot => (slot.id === slotId ? { ...slot, targetStageId } : slot)),
    }));
    if (targetStageId) {
      setStages(current => linkTargetSource(current, stageId, targetStageId));
    }
  };

  const addSelector = (stageId: string, slotId: string, stage: MultiStageDraftStage) => {
    const selector = stage.kind === 'single_elimination'
      ? createWinsSelector(0)
      : createSelector();
    updateAdvancementPlan(stageId, plan => ({
      slots: plan.slots.map(slot =>
        slot.id === slotId ? { ...slot, selectors: [...slot.selectors, selector] } : slot
      ),
    }));
  };

  const updateSelector = (
    stageId: string,
    slotId: string,
    selectorIndex: number,
    patch: Partial<AdvanceSelector>
  ) => {
    updateAdvancementPlan(stageId, plan => ({
      slots: plan.slots.map(slot =>
        slot.id === slotId
          ? {
              ...slot,
              selectors: slot.selectors.map((selector, index) =>
                index === selectorIndex ? { ...selector, ...patch } : selector
              ),
            }
          : slot
      ),
    }));
  };

  const removeSelector = (stageId: string, slotId: string, selectorIndex: number) => {
    updateAdvancementPlan(stageId, plan => ({
      slots: plan.slots.map(slot =>
        slot.id === slotId
          ? { ...slot, selectors: slot.selectors.filter((_, index) => index !== selectorIndex) }
          : slot
      ),
    }));
  };

  /** 晋级去向里直接设置落位方式：改的是目标赛段接收名单时的排法。 */
  const renderLandingControls = (targetStageId: string) => {
    const target = stages.find(item => item.id === targetStageId);
    if (!target) return null;
    const seating = normalizeSeatingPlan(target);
    const sameGroupMode = getSameGroupMode(seating);
    const seatingPairs = sameGroupMode === 'rankPairs' ? seating.pairs ?? [] : [];
    const seatingSlots = seating.mode === 'fixedSlots' ? seating.slots ?? [] : [];
    // 来源小组名：既看目标赛段声明的「名单来源」，也看实际有去向指向它、但没点声明来源的赛段。
    const upstreamStages = stages.filter(item => item.id !== target.id && (
      (target.sourceStageIds ?? []).includes(item.id)
      || (normalizeAdvancementPlan(item)?.slots ?? []).some(slot => slot.targetStageId === target.id)
    ));
    const upstreamGroupNames = Array.from(
      new Set(upstreamStages.flatMap(item => getDraftGroupNames(item)))
    );

    return (
      <div className="space-y-1.5 rounded-md bg-slate-900/30 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>
            {isEnglish ? 'Arrangement' : '落位'}
            <span className="ml-1 text-slate-600">
              {isEnglish ? `(how "${target.name || 'untitled'}" arranges arrivals)` : `（${target.name || '未命名赛段'} 如何排名单）`}
            </span>
          </span>
          <select
            value={seating.mode}
            onChange={event => changeSeatingMode(target.id, event.target.value as SeatingMode)}
            aria-label={isEnglish ? 'Arrangement' : '落位方式'}
            className="rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-slate-200 outline-none focus:border-gold-500/40"
          >
            <option value="ordered">{isEnglish ? 'In order' : '顺序填入'}</option>
            <option value="snake">{isEnglish ? 'Seeded spread' : '种子分散'}</option>
            <option value="fixedSlots">{isEnglish ? 'Pin slots' : '手动指定签位'}</option>
          </select>
          <span className="ml-2">{isEnglish ? 'Same group' : '同组'}</span>
          <select
            value={sameGroupMode}
            disabled={seating.mode === 'fixedSlots'}
            onChange={event => changeSameGroupMode(target.id, event.target.value as SameGroupMode)}
            aria-label={isEnglish ? 'Same group handling' : '同组处理'}
            className="rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-slate-200 outline-none focus:border-gold-500/40 disabled:opacity-40"
          >
            <option value="none">{isEnglish ? 'No special rule' : '不特殊处理'}</option>
            <option value="avoid">{isEnglish ? 'Avoid round 1' : '首轮回避同组'}</option>
            <option value="rankPairs">{isEnglish ? 'Pair by rank' : '组内按名次配对'}</option>
          </select>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          {seating.mode === 'snake'
            ? (isEnglish
              ? 'Seeded spread: standard bracket distribution, so strong players meet as late as possible (8 players: 1, 8, 5, 4, 3, 6, 7, 2).'
              : '种子分散：按标准签表铺开，强手尽量晚相遇（8 人签位：1、8、5、4、3、6、7、2）。')
            : seating.mode === 'fixedSlots'
              ? (isEnglish
                ? 'Pin slots: pin "group + rank" to an exact slot; anyone not pinned fills the remaining slots in order.'
                : '手动指定签位：把「某组第几名」钉到指定签位，没列出的按顺序补进空位。')
              : (isEnglish
                ? 'In order: fills the roster or bracket by source group, then rank — A1, A2, B1, B2…'
                : '顺序填入：按来源小组顺序、再按名次依次填进名单或签表（A1、A2、B1、B2……）。')}
          {seating.mode !== 'fixedSlots' && sameGroupMode === 'avoid' && (isEnglish
            ? ' Round 1 avoids same-group pairs by swapping a few slots.'
            : ' 首轮会自动交换少量签位，避免同组两人相遇。')}
          {seating.mode !== 'fixedSlots' && sameGroupMode === 'rankPairs' && (isEnglish
            ? ' Same-group ranks play a play-in (3rd vs 6th, 4th vs 5th); winners take 3rd/4th place.'
            : ' 同组名次先打附加赛（3 名对 6 名、4 名对 5 名），胜者拿该组第 3、4 名。')}
        </p>

        {sameGroupMode === 'rankPairs' && seating.mode !== 'fixedSlots' && (
          <div className="space-y-1">
            {seatingPairs.map((pair, pairIndex) => (
              <div key={`pair-${pairIndex}`} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                <span>{isEnglish ? 'rank' : '名次'}</span>
                <NumberField
                  value={pair[0]}
                  min={1}
                  max={64}
                  onCommit={next => updateBreakoutPair(target.id, pairIndex, 0, next ?? 1)}
                  ariaLabel={isEnglish ? `Pairing ${pairIndex + 1} first rank` : `第${pairIndex + 1}组配对的第一个名次`}
                />
                <span>vs</span>
                <NumberField
                  value={pair[1]}
                  min={1}
                  max={64}
                  onCommit={next => updateBreakoutPair(target.id, pairIndex, 1, next ?? 1)}
                  ariaLabel={isEnglish ? `Pairing ${pairIndex + 1} second rank` : `第${pairIndex + 1}组配对的第二个名次`}
                />
                <button
                  type="button"
                  onClick={() => removeBreakoutPair(target.id, pairIndex)}
                  aria-label={isEnglish ? `Remove pairing ${pairIndex + 1}` : `删除第${pairIndex + 1}组配对`}
                  className="rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                >
                  {isEnglish ? 'Remove' : '删除'}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addBreakoutPair(target.id)}
              disabled={seatingPairs.length >= 4}
              className="rounded border border-dashed border-slate-600/60 px-2 py-0.5 text-[10px] text-slate-400 transition-colors hover:border-gold-500/40 hover:text-gold-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isEnglish ? 'Add pairing' : '添加配对'}
            </button>
          </div>
        )}

        {seating.mode === 'fixedSlots' && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500">
                {isEnglish ? 'Pinned slots' : '固定签位'}
                <span className="ml-1 text-slate-600">
                  {isEnglish ? `(layout of stage "${target.name || 'untitled'}")` : `（${target.name || '未命名赛段'} 的对位）`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => updateSeedRules(target.id, rules => [
                  ...rules,
                  { sourceGroupName: upstreamGroupNames[0] ?? '', rank: 1, targetSlot: rules.length },
                ])}
                className="rounded border border-dashed border-slate-600/60 px-2 py-0.5 text-[10px] text-slate-400 transition-colors hover:border-gold-500/40 hover:text-gold-400"
              >
                {isEnglish ? 'Add slot' : '添加对位'}
              </button>
            </div>
            {seatingSlots.map((rule, seedIndex) => (
              <div key={`seed-${seedIndex}`} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                {upstreamGroupNames.length > 0 ? (
                  <select
                    value={rule.sourceGroupName}
                    onChange={event => updateSeedRules(target.id, rules => rules.map((item, index) =>
                      index === seedIndex ? { ...item, sourceGroupName: event.target.value } : item
                    ))}
                    aria-label={isEnglish ? `Pinned slot ${seedIndex + 1} source group` : `固定签位第${seedIndex + 1}位的来源小组`}
                    className="rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-0.5 text-slate-200 outline-none focus:border-gold-500/40"
                  >
                    {upstreamGroupNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    {!upstreamGroupNames.includes(rule.sourceGroupName) && (
                      <option value={rule.sourceGroupName}>{rule.sourceGroupName}</option>
                    )}
                  </select>
                ) : (
                  // 目标赛段还没声明来源小组时，允许手动填写小组名，避免固定签位表无处可填。
                  <input
                    value={rule.sourceGroupName}
                    onChange={event => updateSeedRules(target.id, rules => rules.map((item, index) =>
                      index === seedIndex ? { ...item, sourceGroupName: event.target.value } : item
                    ))}
                    placeholder={isEnglish ? 'Group name' : '小组名'}
                    aria-label={isEnglish ? `Pinned slot ${seedIndex + 1} source group` : `固定签位第${seedIndex + 1}位的来源小组`}
                    className="w-20 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-0.5 text-slate-200 outline-none focus:border-gold-500/40"
                  />
                )}
                <span>{isEnglish ? 'rank' : '第'}</span>
                <NumberField
                  value={rule.rank}
                  min={1}
                  max={64}
                  onCommit={next => updateSeedRules(target.id, rules => rules.map((item, index) =>
                    index === seedIndex ? { ...item, rank: next ?? 1 } : item
                  ))}
                  ariaLabel={isEnglish ? `Pinned slot ${seedIndex + 1} source rank` : `固定签位第${seedIndex + 1}位的来源名次`}
                />
                <span className="text-slate-500">→</span>
                <span>{isEnglish ? 'slot' : '签位'}</span>
                <NumberField
                  value={rule.slot + 1}
                  min={1}
                  max={64}
                  onCommit={next => updateSeedRules(target.id, rules => rules.map((item, index) =>
                    index === seedIndex ? { ...item, targetSlot: (next ?? 1) - 1 } : item
                  ))}
                  ariaLabel={isEnglish ? `Pinned slot ${seedIndex + 1} target slot` : `固定签位第${seedIndex + 1}位的目标签位`}
                />
                <button
                  type="button"
                  onClick={() => updateSeedRules(target.id, rules => rules.filter((_, index) => index !== seedIndex))}
                  aria-label={isEnglish ? `Remove pinned slot ${seedIndex + 1}` : `删除第${seedIndex + 1}个固定签位`}
                  className="rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-rose-300 hover:bg-rose-500/20"
                >
                  {isEnglish ? 'Remove' : '删除'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /** 名单来源可以多选：例如淘汰赛同时接收小组赛直进与突围赛晋级。 */
  const toggleSourceStage = (stageId: string, sourceStageId: string) => {
    setStages(current => current.map(stage => {
      if (stage.id !== stageId) return stage;
      const sources = stage.sourceStageIds ?? [];
      const next = sources.includes(sourceStageId)
        ? sources.filter(id => id !== sourceStageId)
        : [...sources, sourceStageId];
      return { ...stage, sourceStageIds: next.length > 0 ? next : undefined };
    }));
  };

  /** 落位方式：接收方赛段把进来的席位排成名单/签表的方式。 */
  const updateSeating = (stageId: string, updater: (stage: MultiStageDraftStage) => MultiStageDraftStage['seating']) => {
    setStages(current => current.map(stage => (
      stage.id === stageId ? { ...stage, seating: updater(stage) } : stage
    )));
  };

  /** 问题一：落位方式——接进来的名单按什么顺序铺开。 */
  const changeSeatingMode = (stageId: string, mode: SeatingMode) => {
    if (mode === 'rankPairs') return;
    updateSeating(stageId, stage => {
      const current = normalizeSeatingPlan(stage);
      const currentPairs = current.pairs && current.pairs.length > 0
        ? current.pairs.map(pair => [...pair] as [number, number])
        : DEFAULT_RANK_PAIRS.map(pair => [...pair] as [number, number]);
      if (mode === 'fixedSlots') {
        return { mode, sameGroup: 'none', slots: current.slots ?? [] };
      }
      const sameGroup = getSameGroupMode(current);
      return sameGroup === 'rankPairs'
        ? { mode, sameGroup, pairs: currentPairs }
        : { mode, sameGroup };
    });
  };

  /** 问题二：同一个来源小组的人怎么处理。 */
  const changeSameGroupMode = (stageId: string, sameGroup: SameGroupMode) => {
    updateSeating(stageId, stage => {
      const current = normalizeSeatingPlan(stage);
      if (current.mode === 'fixedSlots') return stage.seating;
      if (sameGroup === 'rankPairs') {
        const pairs = current.pairs && current.pairs.length > 0
          ? current.pairs.map(pair => [...pair] as [number, number])
          : DEFAULT_RANK_PAIRS.map(pair => [...pair] as [number, number]);
        return { mode: current.mode, sameGroup, pairs };
      }
      return { mode: current.mode, sameGroup };
    });
  };

  /** 组内名次配对：编辑「哪两个名次对阵」，默认 3 对 6、4 对 5。 */
  const updateBreakoutPair = (
    stageId: string,
    pairIndex: number,
    side: 0 | 1,
    value: number
  ) => {
    updateSeating(stageId, stage => {
      const current = normalizeSeatingPlan(stage);
      const pairs = (getSameGroupMode(current) === 'rankPairs' ? current.pairs ?? DEFAULT_RANK_PAIRS : DEFAULT_RANK_PAIRS)
        .map(pair => [...pair] as [number, number]);
      const pair = pairs[pairIndex];
      if (!pair) return stage.seating;
      pair[side] = Math.max(1, Math.floor(value) || 1);
      return { mode: current.mode === 'fixedSlots' ? 'ordered' : current.mode, sameGroup: 'rankPairs', pairs };
    });
  };

  const addBreakoutPair = (stageId: string) => {
    updateSeating(stageId, stage => {
      const current = normalizeSeatingPlan(stage);
      const pairs = (getSameGroupMode(current) === 'rankPairs' ? current.pairs ?? DEFAULT_RANK_PAIRS : DEFAULT_RANK_PAIRS)
        .map(pair => [...pair] as [number, number]);
      if (pairs.length >= 4) return stage.seating;
      const first = 3 + pairs.length * 2;
      return {
        mode: current.mode === 'fixedSlots' ? 'ordered' : current.mode,
        sameGroup: 'rankPairs',
        pairs: [...pairs, [first, first + 1]],
      };
    });
  };

  const removeBreakoutPair = (stageId: string, pairIndex: number) => {
    updateSeating(stageId, stage => {
      const current = normalizeSeatingPlan(stage);
      const pairs = (getSameGroupMode(current) === 'rankPairs' ? current.pairs ?? [] : [])
        .filter((_, index) => index !== pairIndex)
        .map(pair => [...pair] as [number, number]);
      const mode = current.mode === 'fixedSlots' ? 'ordered' : current.mode;
      return pairs.length > 0 ? { mode, sameGroup: 'rankPairs', pairs } : { mode, sameGroup: 'none' };
    });
  };

  /** 签表对位：来源小组的第几名站到签表第几位。 */
  const updateSeedRules = (
    stageId: string,
    updater: (rules: StageSeedRule[]) => StageSeedRule[]
  ) => {
    updateSeating(stageId, stage => {
      const current = normalizeSeatingPlan(stage);
      const rules = current.mode === 'fixedSlots' ? current.slots ?? [] : [];
      const next = updater(rules.map(rule => ({
        sourceGroupName: rule.sourceGroupName,
        rank: rule.rank,
        targetSlot: rule.slot,
      }))).sort((a, b) => a.targetSlot - b.targetSlot);
      return {
        mode: 'fixedSlots',
        sameGroup: 'none',
        slots: next.map(rule => ({
          sourceGroupName: rule.sourceGroupName,
          rank: rule.rank,
          slot: rule.targetSlot,
        })),
      };
    });
  };

  const moveStage = (index: number, delta: number) => {
    setStages(current => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const removeStage = (stageId: string) => {
    setStages(current => (current.length <= 1 ? current : current.filter(stage => stage.id !== stageId)));
  };

  const addStage = () => {
    setStages(current => [...current, createDefaultStageDraft(current.length + 1)]);
  };

  const hasInvalidStage = stages.some(stage => !stage.name.trim() || stage.playerCountPerGroup < 2);
  const ruleIssues = useMemo(() => validateStageDrafts(stages, isEnglish), [stages, isEnglish]);
  const ruleErrors = ruleIssues.filter(issue => issue.severity === 'error');
  const canStartEvent = !hasInvalidStage && ruleErrors.length === 0;

  const doStartEvent = () => {
    const nextCompetition = createMultiStageCompetition(nameInput.trim() || '多阶段赛事', stages);
    initMultiStageCompetition(nextCompetition);
    navigate('/workspace');
  };

  const startEvent = () => {
    if (!canStartEvent) return;
    if (hasExistingEvent) {
      setShowReplaceConfirm(true);
      return;
    }
    doStartEvent();
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <StorageBanner />
      <WriterLockBanner />

      <button
        onClick={() => setLanguage(isEnglish ? 'zh' : 'en')}
        className="fixed top-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-slate-700/40 bg-slate-800/60 px-2.5 py-2 text-xs font-medium text-slate-200 backdrop-blur-sm transition-all hover:border-gold-500/30 hover:bg-slate-700 hover:text-gold-400"
        title={isEnglish ? 'Switch to Chinese' : 'Switch to English'}
      >
        <Languages className="w-3.5 h-3.5" />
        <span>{t.swapLanguage}</span>
      </button>

      <header className="relative overflow-hidden border-b border-slate-700/40">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/40 to-transparent" />
        <div className="relative px-4 py-4 sm:px-6 sm:py-5">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/50 bg-slate-800/50 text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-white"
              title={isEnglish ? 'Back to type selection' : '返回类型选择'}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600">
              <Layers className="h-5 w-5 text-indigo-900" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-slate-100">
                  {isEnglish ? 'Multi-stage rules' : '多阶段赛制设置'}
                </h1>
                <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                  {isEnglish ? 'Test feature' : '测试功能'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isEnglish
                  ? 'Define stages and formats, then continue in the standard setup.'
                  : '先设置赛段与赛制，确认后进入原版赛事设置界面。'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-3 py-4 sm:px-4 md:px-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/50 p-4">
            <label className="text-xs text-slate-500" htmlFor="multi-stage-name">
              {isEnglish ? 'Event name' : '赛事名称'}
            </label>
            <input
              id="multi-stage-name"
              type="text"
              value={nameInput}
              onChange={event => setNameInput(event.target.value)}
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
            />
          </section>

          {stages.map((stage, index) => {
            const laterStages = stages.slice(index + 1);
            const upstreamStages = (stage.sourceStageIds ?? [])
              .map(id => stages.find(item => item.id === id))
              .filter((item): item is MultiStageDraftStage => Boolean(item));
            const upstreamNames = upstreamStages.map(item => item.name);
            const plan = normalizeAdvancementPlan(stage);
            const planSlots = plan?.slots ?? [];
            const downstreamNames = stages
              .filter(target =>
                target.id !== stage.id
                && (
                  (target.sourceStageIds ?? []).includes(stage.id)
                  || planSlots.some(slot => slot.targetStageId === target.id)
                )
              )
              .map(target => target.name || (isEnglish ? 'Untitled stage' : '未命名赛段'));
            return (
            <section
              key={stage.id}
              className="space-y-4 rounded-lg border border-slate-700/50 bg-slate-800/50 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {isEnglish ? `Stage ${index + 1}` : `第${index + 1}赛段`}
                </span>
                <input
                  type="text"
                  value={stage.name}
                  onChange={event => updateStage(stage.id, { name: event.target.value })}
                  placeholder={isEnglish ? 'Stage name' : '赛段名称'}
                  aria-label={isEnglish ? `Stage ${index + 1} name` : `第${index + 1}赛段名称`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-sm text-white outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                />
                <button
                  type="button"
                  onClick={() => moveStage(index, -1)}
                  disabled={index === 0}
                  className="shrink-0 rounded-md border border-slate-700/50 bg-slate-800/50 p-1 text-slate-300 transition-colors hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 disabled:cursor-not-allowed disabled:opacity-30"
                  title={isEnglish ? 'Move up' : '上移'}
                  aria-label={isEnglish ? 'Move stage up' : '上移赛段'}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStage(index, 1)}
                  disabled={index === stages.length - 1}
                  className="shrink-0 rounded-md border border-slate-700/50 bg-slate-800/50 p-1 text-slate-300 transition-colors hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 disabled:cursor-not-allowed disabled:opacity-30"
                  title={isEnglish ? 'Move down' : '下移'}
                  aria-label={isEnglish ? 'Move stage down' : '下移赛段'}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeStage(stage.id)}
                  disabled={stages.length <= 1}
                  className="shrink-0 rounded-md border border-rose-500/25 bg-rose-500/10 p-1 text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:opacity-30"
                  title={isEnglish ? 'Delete stage' : '删除赛段'}
                  aria-label={isEnglish ? 'Delete stage' : '删除赛段'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-700/40 bg-slate-900/20 p-3">
                <span className="text-xs font-medium text-slate-400">
                  {isEnglish ? 'Stage settings' : '赛段设置'}
                </span>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-slate-700/50 bg-slate-800/40 p-0.5 text-[11px] font-medium">
                  {([
                    { kind: 'swiss' as PairingType, label: isEnglish ? 'Swiss' : '瑞士轮' },
                    { kind: 'single_elimination' as PairingType, label: isEnglish ? 'Single elimination' : '单败淘汰' },
                  ]).map(option => (
                    <button
                      key={option.kind}
                      type="button"
                      onClick={() => updateStage(stage.id, { kind: option.kind })}
                      className={`rounded px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 ${
                        stage.kind === option.kind
                          ? 'bg-gold-500/20 text-gold-400'
                          : 'text-slate-400 hover:bg-slate-700/40'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500">{isEnglish ? 'Groups' : '小组数'}</span>
                    <select
                      value={stage.groupCount}
                      onChange={event => updateStage(stage.id, { groupCount: Number(event.target.value) })}
                      aria-label={isEnglish ? 'Number of groups' : '小组数'}
                      className="h-8 rounded-md border border-slate-700/50 bg-slate-800/60 px-2 text-xs text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                    >
                      {Array.from({ length: 8 }, (_, i) => i + 1).map(count => (
                        <option key={count} value={count}>{count}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500">{isEnglish ? 'Players / group' : '每组人数'}</span>
                    {stage.sourceStageIds?.length ? (
                      <span
                        className="flex h-8 items-center rounded-md bg-slate-800/30 px-2 text-[10px] text-slate-400"
                        title={(() => {
                          const min = minIncomingPlayers(stage, stages);
                          const max = maxIncomingPlayers(stage, stages);
                          return isEnglish
                            ? `Estimated ${min}–${max} players arrive. The bracket sizes itself to the actual count.`
                            : `预计 ${min}–${max} 人到达，签表按实际人数生成。`;
                        })()}
                      >
                        {isEnglish ? 'By advancement' : '由晋级决定'}
                      </span>
                    ) : (
                      <NumberField
                        value={stage.playerCountPerGroup}
                        min={2}
                        max={128}
                        onCommit={next => {
                          if (next !== undefined) updateStage(stage.id, { playerCountPerGroup: next });
                        }}
                        ariaLabel={isEnglish ? 'Players per group' : '每组人数'}
                        className="h-8 w-full rounded-md border border-slate-700/50 bg-slate-800/60 px-2 text-center text-xs text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                      />
                    )}
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500">{isEnglish ? 'Rounds (auto)' : '轮数（自动）'}</span>
                    <span
                      className="flex h-8 items-center rounded-md bg-slate-800/30 px-2 text-xs text-slate-300"
                      title={stage.kind === 'swiss'
                        ? (isEnglish ? 'ceil(log2 players per group)' : '按每组人数自动计算：ceil(log2 人数)')
                        : (isEnglish ? 'ceil(log2 players arriving)' : '按到达人数自动计算：ceil(log2 人数)')}
                    >
                      {effectiveRounds(stage)}
                    </span>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500">{isEnglish ? 'Match length' : '每轮局数'}</span>
                    <select
                      value={commonGameType(stage)}
                      onChange={event => {
                        if (event.target.value === 'custom') return;
                        updateStage(stage.id, {
                          roundGameTypes: Array.from(
                            { length: effectiveRounds(stage) },
                            () => event.target.value as GameType
                          ),
                        });
                      }}
                      aria-label={isEnglish ? 'Match length per round' : '每轮局数'}
                      className="h-8 rounded-md border border-slate-700/50 bg-slate-800/60 px-2 text-xs text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                    >
                      {GAME_TYPES.map(gameType => (
                        <option key={gameType} value={gameType}>{gameType.toUpperCase()}</option>
                      ))}
                      <option value="custom">{isEnglish ? 'Custom per round' : '逐轮不同'}</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* 赛段关系：名单从哪里来，晋级到哪里去 */}
              <div className="space-y-3 rounded-lg border border-slate-700/40 bg-slate-900/20 p-3">
                <span className="text-xs font-medium text-slate-400">
                  {isEnglish ? 'Stage relationships' : '赛段关系'}
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-500">
                      {isEnglish ? 'Roster source' : '名单来源'}
                    </span>
                    {index === 0 ? (
                      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-2 py-1.5 text-[11px] leading-tight text-slate-400">
                        {isEnglish ? 'Imported for this stage' : '本赛段自行导入名单'}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {stages.slice(0, index).map(previous => {
                          const active = (stage.sourceStageIds ?? []).includes(previous.id);
                          return (
                            <button
                              key={previous.id}
                              type="button"
                              onClick={() => toggleSourceStage(stage.id, previous.id)}
                              className={`rounded-lg px-2 py-1 text-[11px] transition-colors ${
                                active
                                  ? 'border border-gold-500/30 bg-gold-500/20 text-gold-400'
                                  : 'border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                              }`}
                            >
                              {previous.name || (isEnglish ? 'Untitled stage' : '未命名赛段')}
                            </button>
                          );
                        })}
                        {upstreamNames.length === 0 && (
                          <span className="text-[10px] leading-6 text-slate-500">
                            {isEnglish ? 'Not set: import a roster manually' : '未选择：自行导入名单'}
                          </span>
                        )}
                      </div>
                    )}
                    {upstreamNames.length > 0 && (
                      <span className="block text-[10px] text-slate-500">
                        {isEnglish
                          ? `Advancers come from ${upstreamNames.join(', ')}`
                          : `晋级选手来自 ${upstreamNames.join('、')}`}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-500">
                      {isEnglish ? 'Advancement path' : '晋级去向'}
                    </span>
                    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-2 py-1.5 text-[11px] leading-relaxed text-slate-400">
                      {downstreamNames.length > 0
                        ? downstreamNames.join(isEnglish ? ', ' : '、')
                        : (isEnglish ? 'No target stage yet' : '暂未指向任何赛段')}
                    </div>
                  </div>
                </div>
              </div>

              {/* 赛段内规则：轮次局制、跨组配对与签表对位 */}
              <div className="space-y-3 rounded-lg border border-slate-700/40 bg-slate-900/20 p-3">
                <span className="text-xs font-medium text-slate-400">
                  {isEnglish ? 'In-stage rules' : '赛段内规则'}
                </span>

                <details className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[11px] text-slate-400 hover:text-slate-200">
                    <span>{isEnglish ? 'Per-round match length' : '逐轮局数'}</span>
                    <span className="text-[10px] text-slate-500">
                      {Array.from({ length: effectiveRounds(stage) }, (_, i) =>
                        (stage.roundGameTypes[i] ?? stage.gameType).toUpperCase()
                      ).join(' / ')}
                    </span>
                  </summary>
                  <div className="mt-2 space-y-1">
                    {Array.from({ length: effectiveRounds(stage) }, (_, i) => i + 1).map(round => (
                      <div key={round} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-[10px] text-slate-500">
                          {isEnglish ? `Round ${round}` : `第${round}轮`}
                        </span>
                        <div className="grid flex-1 grid-cols-4 gap-1">
                          {GAME_TYPES.map(gameType => (
                            <button
                              key={gameType}
                              type="button"
                              onClick={() => {
                                const next = [...stage.roundGameTypes];
                                next[round - 1] = gameType;
                                updateStage(stage.id, { roundGameTypes: next });
                              }}
                              className={`rounded px-1 py-0.5 text-[10px] font-medium transition-colors ${
                                stage.roundGameTypes[round - 1] === gameType
                                  ? 'bg-gold-500/20 text-gold-400'
                                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/40'
                              }`}
                            >
                              {gameType.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

              </div>

              {laterStages.length > 0 && (
              <div className="space-y-3 rounded-lg border border-slate-700/40 bg-slate-900/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-400">
                    {isEnglish ? 'Advancement destinations' : '晋级去向'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {isEnglish ? 'Who moves on, and where.' : '先决定谁能晋级，再决定晋级到哪。'}
                  </span>
                </div>

                {planSlots.length === 0 && (
                  <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200/90">
                    {isEnglish
                      ? 'No destination configured yet — the downstream stage will receive nobody.'
                      : '还没有配置去向，下游赛段将收不到任何选手。'}
                  </p>
                )}

                {planSlots.map(slot => (
                  <div key={slot.id} className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/40 p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {isEnglish ? 'Goes to' : '晋级到'}
                      </span>
                      <select
                        value={slot.targetStageId}
                        onChange={event => setPlanSlotTarget(stage.id, slot.id, event.target.value)}
                        aria-label={isEnglish ? 'Destination stage' : '晋级目标赛段'}
                        className={`min-w-0 flex-1 rounded border bg-slate-800/60 px-1.5 py-1 text-[11px] text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50 ${
                          slot.targetStageId ? 'border-slate-700/50' : 'border-amber-500/60'
                        }`}
                      >
                        <option value="">{isEnglish ? 'Choose stage' : '选择赛段'}</option>
                        {laterStages.map(target => (
                          <option key={target.id} value={target.id}>
                            {target.name || (isEnglish ? 'Untitled stage' : '未命名赛段')}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removePlanSlot(stage.id, slot.id)}
                        aria-label={isEnglish ? 'Remove destination' : '删除这条去向'}
                        className="rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                      >
                        {isEnglish ? 'Remove' : '删除'}
                      </button>
                    </div>

                    {slot.targetStageId ? renderLandingControls(slot.targetStageId) : null}

                    {slot.selectors.map((selector, selectorIndex) => {
                      const winsMode = selector.mode === 'wins';
                      // 淘汰赛按「淘汰轮次」，其它赛制（瑞士轮等）就是按胜场数。
                      const eliminationSource = stage.kind === 'single_elimination';
                      return (
                        <div
                          key={`${slot.id}-selector-${selectorIndex}`}
                          className="rounded border border-slate-700/40 bg-slate-900/40 p-2"
                        >
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                            <span>{isEnglish ? 'Pick' : '选人'}</span>
                            <div className="flex overflow-hidden rounded border border-slate-700/50">
                              <button
                                type="button"
                                onClick={() => updateSelector(stage.id, slot.id, selectorIndex, { mode: 'rank' })}
                                className={`px-1.5 py-1 text-[10px] font-medium transition-colors ${
                                  winsMode ? 'bg-slate-800/60 text-slate-400' : 'bg-gold-500/20 text-gold-400'
                                }`}
                              >
                                {isEnglish ? 'by rank' : '按名次'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateSelector(stage.id, slot.id, selectorIndex, {
                                    mode: 'wins',
                                    ...(selector.minWins === undefined && selector.maxWins === undefined
                                      ? { minWins: 1 }
                                      : {}),
                                  })
                                }
                                className={`px-1.5 py-1 text-[10px] font-medium transition-colors ${
                                  winsMode ? 'bg-gold-500/20 text-gold-400' : 'bg-slate-800/60 text-slate-400'
                                }`}
                              >
                                {eliminationSource
                                  ? (isEnglish ? 'by round' : '按淘汰轮次')
                                  : (isEnglish ? 'by wins' : '按胜场')}
                              </button>
                            </div>

                            {winsMode ? (
                              <>
                                <span>{isEnglish ? 'wins' : '胜场'}</span>
                                <NumberField
                                  value={selector.minWins}
                                  allowEmpty
                                  min={0}
                                  max={20}
                                  placeholder={isEnglish ? 'any' : '不限'}
                                  onCommit={next => updateSelector(stage.id, slot.id, selectorIndex, { minWins: next })}
                                  ariaLabel={isEnglish ? 'Minimum wins' : '最低胜场'}
                                />
                                <span>-</span>
                                <NumberField
                                  value={selector.maxWins}
                                  allowEmpty
                                  min={0}
                                  max={20}
                                  placeholder={isEnglish ? 'any' : '不限'}
                                  onCommit={next => updateSelector(stage.id, slot.id, selectorIndex, { maxWins: next })}
                                  ariaLabel={isEnglish ? 'Maximum wins' : '最高胜场'}
                                />
                              </>
                            ) : (
                              <>
                                <span>{isEnglish ? 'rank' : '名次'}</span>
                                <NumberField
                                  value={selector.fromRank}
                                  min={1}
                                  max={64}
                                  onCommit={next => updateSelector(stage.id, slot.id, selectorIndex, { fromRank: next ?? 1 })}
                                  ariaLabel={isEnglish ? 'Starting rank' : '起始名次'}
                                />
                                <span>-</span>
                                <NumberField
                                  value={selector.toRank}
                                  min={1}
                                  max={64}
                                  onCommit={next => updateSelector(stage.id, slot.id, selectorIndex, { toRank: next ?? 1 })}
                                  ariaLabel={isEnglish ? 'Ending rank' : '结束名次'}
                                />
                              </>
                            )}

                            <span
                              title={isEnglish
                                ? 'Leave empty to take everyone who matches. Fill a number to cap the qualifiers at N, ordered by points and opponent win rate.'
                                : '留空表示符合条件的人全要；填数字则最多取 N 人（按积分与对手胜率排序），可用于固定晋级人数。'}
                            >
                              {isEnglish ? 'best' : '跨组取'}
                            </span>
                            <NumberField
                              value={selector.take}
                              allowEmpty
                              min={1}
                              max={64}
                              placeholder={isEnglish ? 'all' : '全部'}
                              onCommit={next => updateSelector(stage.id, slot.id, selectorIndex, { take: next })}
                              ariaLabel={isEnglish ? 'Take best N across groups' : '跨组取前几名'}
                            />
                            <button
                              type="button"
                              onClick={() => removeSelector(stage.id, slot.id, selectorIndex)}
                              aria-label={isEnglish ? 'Remove condition' : '删除这个条件'}
                              className="ml-auto rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-1 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                            >
                              {isEnglish ? 'Remove' : '删除'}
                            </button>
                          </div>
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                            {winsMode
                              ? (eliminationSource
                                ? (isEnglish
                                  ? 'Counts match wins only: in single elimination, same-round losers tie on rank but differ on wins (0 = out in round 1).'
                                  : '只按赢下的场数选人：单败淘汰里同一轮出局的选手名次并列，但胜场不同（0 胜 = 首轮出局），按轮次选不会有并列歧义。')
                                : (isEnglish
                                  ? 'Counts match wins in this stage (e.g. 4-1 and above). Ties are ordered by points and opponent win rate. The number of qualifiers depends on results — use "best N" if you need a fixed count.'
                                  : '按本赛段的比赛胜场筛选（例如胜场 ≥ 4）；胜场相同的按积分与对手胜率排队。符合几人就晋级几人、人数不固定——需要固定人数时在「跨组取」填上限。'))
                              : (isEnglish
                                ? 'Ranks come from the group standings of this stage. In single elimination, same-round losers tie on rank — prefer the round mode there.'
                                : '按本赛段的小组排名选人。单败淘汰里同一轮出局的选手名次并列，这种情况建议改用「按淘汰轮次」。')}
                          </p>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => addSelector(stage.id, slot.id, stage)}
                      className="rounded border border-dashed border-slate-600/60 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-gold-500/40 hover:text-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
                    >
                      {isEnglish ? 'Add condition' : '添加选人条件'}
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addPlanSlot(stage.id, laterStages[0]?.id ?? '', stage.kind)}
                  className="rounded border border-dashed border-slate-600/60 px-2 py-1 text-[11px] text-slate-400 hover:border-gold-500/40 hover:text-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
                >
                  {isEnglish ? 'Add destination' : '添加去向'}
                </button>

                <p className="text-[10px] leading-relaxed text-slate-500">
                  {isEnglish
                    ? 'Each condition is checked inside every source group. "Best N across groups" then keeps only the top N candidates (e.g. the best four 3rd places). A stage may point to several destinations.'
                    : '每个条件都会在来源赛段的每个小组里分别判定；「跨组取 N」再把所有小组的候选人按积分、胜场、胜率排一遍，只留前 N 名（例如 4 个小组只收最好的 4 个第三名）。同一赛段可以有多条去向。'}
                </p>
              </div>
              )}
            </section>
            );
          })}

          <button
            type="button"
            onClick={addStage}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600/60 bg-slate-800/30 py-3 text-xs text-slate-400 transition-colors hover:border-gold-500/40 hover:text-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
          >
            <Plus className="h-3.5 w-3.5" />
            {isEnglish ? 'Add stage' : '添加赛段'}
          </button>

          {/* 规则检查：结构、赛段内规则、晋级规则与赛段关系一起体检 */}
          <section className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-300">
                {isEnglish ? 'Rule check' : '规则检查'}
              </span>
              {ruleErrors.length === 0 && ruleIssues.length === 0 && (
                <span className="text-[11px] text-emerald-400/80">
                  {isEnglish ? 'No problems found.' : '检查通过，可以开赛。'}
                </span>
              )}
              {ruleErrors.length > 0 && (
                <span className="text-[11px] text-rose-300">
                  {isEnglish
                    ? `${ruleErrors.length} blocking issue(s)`
                    : `${ruleErrors.length} 项必须修正`}
                </span>
              )}
              {ruleIssues.length - ruleErrors.length > 0 && (
                <span className="text-[11px] text-amber-300">
                  {isEnglish
                    ? `${ruleIssues.length - ruleErrors.length} warning(s)`
                    : `${ruleIssues.length - ruleErrors.length} 项提示`}
                </span>
              )}
            </div>
            {ruleIssues.length > 0 && (
              <ul className="space-y-1">
                {ruleIssues.map((issue, index) => (
                  <li
                    key={`${issue.stageId ?? 'global'}-${index}`}
                    className={`flex gap-2 text-[11px] leading-relaxed ${
                      issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'
                    }`}
                  >
                    <span className="shrink-0">{issue.severity === 'error' ? '✕' : '!'}</span>
                    <span>
                      {issue.stageName ? `${issue.stageName}：` : ''}
                      {issue.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 赛事流程图：箭头按选手的晋级方向绘制，一个赛段可以有多个下游 */}
          <section className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/50 p-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs font-medium text-slate-300">
                {isEnglish ? 'Event flow' : '赛事流程图'}
              </span>
              <span className="text-[10px] text-slate-500">
                {isEnglish
                  ? 'Arrows follow where players actually advance.'
                  : '箭头按选手的晋级方向绘制。'}
              </span>
            </div>
            <EventFlowDiagram
              stages={stages.map(stage => ({
                id: stage.id,
                name: stage.name,
                kind: stage.kind,
                sourceStageIds: stage.sourceStageIds,
                advancementRules: stage.advancementRules,
                advancementPlan: stage.advancementPlan,
                note: isEnglish ? `${stage.groupCount} groups` : `${stage.groupCount} 组`,
              }))}
              isEnglish={isEnglish}
            />
          </section>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-slate-700/50 bg-slate-900/80 px-3 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Swords className="h-3.5 w-3.5" />
            {isEnglish
              ? `${stages.length} stage(s) configured`
              : `已配置 ${stages.length} 个赛段`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
            >
              {isEnglish ? 'Cancel' : '取消'}
            </button>
            <button
              type="button"
              onClick={startEvent}
              disabled={!canStartEvent}
              className="flex items-center gap-2 rounded-lg border border-gold-500/40 bg-gold-500/20 px-4 py-2 text-sm font-medium text-gold-400 transition-colors hover:bg-gold-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trophy className="h-4 w-4" />
              {isEnglish ? 'Continue to setup' : '进入赛事设置'}
            </button>
          </div>
        </div>
      </footer>

      <ConfirmDialog
        isOpen={showReplaceConfirm}
        onClose={() => setShowReplaceConfirm(false)}
        title={isEnglish ? 'Replace current event?' : '替换当前赛事？'}
        message={
          isEnglish
            ? `Continuing replaces "${competition.name}" and its match history. This cannot be undone.`
            : `进入赛事设置会替换当前赛事「${competition.name}」及其比赛记录，且无法撤销。`
        }
        confirmText={isEnglish ? 'Replace and continue' : '替换并继续'}
        onConfirm={doStartEvent}
      />
    </div>
  );
}
