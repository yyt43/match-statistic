import { useEffect, useId, useMemo, useState } from 'react';
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
import type { GameType, PairingType, StageSeedRule } from '../types';
import { useLanguagePreference } from '../i18n/context';
import { useTournamentStore } from '../store/useTournamentStore';
import { createDefaultStageDraft, createMultiStageCompetition } from '../store/multiStageFactory';
import { getDraftGroupNames, type MultiStageDraftStage } from '../utils/multiStage';
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

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const inputId = useId();
  return (
    <div className="block space-y-1.5">
      <label htmlFor={inputId} className="text-xs text-slate-500">{label}</label>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`${label} -1`}
          className="h-7 w-7 shrink-0 rounded border border-slate-700/50 bg-slate-800/50 text-slate-300 transition-colors hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-[3rem] flex-1 rounded border border-slate-700/50 bg-slate-800/30 py-1 text-center text-sm tabular-nums text-slate-200">
          <input
            id={inputId}
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={event => {
              const next = Number(event.target.value);
              if (Number.isNaN(next)) return;
              onChange(Math.max(min, Math.min(max, next)));
            }}
            className="w-full bg-transparent text-center text-sm tabular-nums text-slate-200 outline-none focus-visible:ring-1 focus-visible:ring-gold-400/50"
          />
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`${label} +1`}
          className="h-7 w-7 shrink-0 rounded border border-slate-700/50 bg-slate-800/50 text-slate-300 transition-colors hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </span>
    </div>
  );
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

  /** 选择晋级去向：目标赛段由用户自己命名，选好后自动补上「名单来自上游」的依赖。 */
  const updateRuleTarget = (stageId: string, ruleId: string, targetStageId: string) => {
    setStages(current =>
      linkTargetSource(
        current.map(stage =>
          stage.id === stageId
            ? {
                ...stage,
                advancementRules: (stage.advancementRules ?? []).map(rule =>
                  rule.id === ruleId ? { ...rule, targetStageId } : rule
                ),
              }
            : stage
        ),
        stageId,
        targetStageId
      )
    );
  };

  const addRule = (stageId: string, targetStageId: string) => {
    const ruleId = `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setStages(current =>
      linkTargetSource(
        current.map(stage =>
          stage.id === stageId
            ? {
                ...stage,
                advancementRules: [
                  ...(stage.advancementRules ?? []),
                  { id: ruleId, fromRank: 1, toRank: 2, targetStageId },
                ],
              }
            : stage
        ),
        stageId,
        targetStageId
      )
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

  /** 跨组配对：编辑「哪两个名次对阵」，默认 3 对 6、4 对 5。 */
  const updateBreakoutPair = (
    stageId: string,
    pairIndex: number,
    side: 0 | 1,
    value: number
  ) => {
    setStages(current => current.map(stage => {
      if (stage.id !== stageId) return stage;
      const pairs = (stage.breakout?.pairings ?? [[3, 6], [4, 5]])
        .map(pair => [...pair] as [number, number]);
      const pair = pairs[pairIndex];
      if (!pair) return stage;
      pair[side] = Math.max(1, Math.floor(value) || 1);
      return { ...stage, breakout: { pairings: pairs } };
    }));
  };

  const addBreakoutPair = (stageId: string) => {
    setStages(current => current.map(stage => {
      if (stage.id !== stageId) return stage;
      const pairs = (stage.breakout?.pairings ?? [[3, 6], [4, 5]])
        .map(pair => [...pair] as [number, number]);
      if (pairs.length >= 4) return stage;
      const first = 3 + pairs.length * 2;
      return { ...stage, breakout: { pairings: [...pairs, [first, first + 1]] } };
    }));
  };

  const removeBreakoutPair = (stageId: string, pairIndex: number) => {
    setStages(current => current.map(stage => {
      if (stage.id !== stageId) return stage;
      const pairs = (stage.breakout?.pairings ?? []).filter((_, index) => index !== pairIndex);
      return { ...stage, breakout: pairs.length > 0 ? { pairings: pairs } : undefined };
    }));
  };

  /** 签表对位：来源小组的第几名站到签表第几位。 */
  const updateSeedRules = (
    stageId: string,
    updater: (rules: StageSeedRule[]) => StageSeedRule[]
  ) => {
    setStages(current => current.map(stage => {
      if (stage.id !== stageId) return stage;
      const next = updater((stage.seedRules ?? []).map(rule => ({ ...rule })))
        .sort((a, b) => a.targetSlot - b.targetSlot);
      return { ...stage, seedRules: next.length > 0 ? next : undefined };
    }));
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
            const upstreamGroupNames = Array.from(
              new Set(upstreamStages.flatMap(item => getDraftGroupNames(item)))
            );
            const downstreamNames = stages
              .filter(target =>
                target.id !== stage.id
                && (
                  (target.sourceStageIds ?? []).includes(stage.id)
                  || (stage.advancementRules ?? []).some(rule => rule.targetStageId === target.id)
                )
              )
              .map(target => target.name || (isEnglish ? 'Untitled stage' : '未命名赛段'));
            const declaredDownstream = laterStages.filter(target =>
              (target.sourceStageIds ?? []).includes(stage.id)
            );
            const defaultTargetStageId = declaredDownstream.length === 1
              ? declaredDownstream[0].id
              : declaredDownstream.length === 0 && laterStages.length === 1
                ? laterStages[0].id
                : '';
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
                <div className="space-y-2">
                  <span className="text-xs text-slate-500">{isEnglish ? 'Format' : '赛制'}</span>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { kind: 'swiss' as PairingType, label: isEnglish ? 'Swiss' : '瑞士轮' },
                    { kind: 'single_elimination' as PairingType, label: isEnglish ? 'Single elimination' : '单败淘汰' },
                  ]).map(option => (
                    <button
                      key={option.kind}
                      type="button"
                      onClick={() => updateStage(stage.id, { kind: option.kind })}
                      className={`rounded-lg py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 ${
                        stage.kind === option.kind
                          ? 'border border-gold-500/30 bg-gold-500/20 text-gold-400'
                          : 'border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stepper
                    label={isEnglish ? 'Groups' : '小组数'}
                    value={stage.groupCount}
                    min={1}
                    max={8}
                    onChange={value => updateStage(stage.id, { groupCount: value })}
                  />
                  {stage.sourceStageIds?.length ? (
                    <div className="space-y-1.5">
                      <span className="text-xs text-slate-500">
                        {isEnglish ? 'Players per group' : '每组人数'}
                      </span>
                      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-2 py-1.5 text-[11px] leading-tight text-slate-400">
                        {isEnglish ? 'Decided by advancement' : '由晋级人数决定'}
                      </div>
                    </div>
                  ) : (
                    <Stepper
                      label={isEnglish ? 'Players per group' : '每组人数'}
                      value={stage.playerCountPerGroup}
                      min={2}
                      max={128}
                      onChange={value => updateStage(stage.id, { playerCountPerGroup: value })}
                    />
                  )}
                  {stage.kind === 'swiss' ? (
                    <Stepper
                      label={isEnglish ? 'Rounds' : '轮数'}
                      value={stage.rounds}
                      min={1}
                      max={20}
                      onChange={value => updateStage(stage.id, { rounds: value })}
                    />
                  ) : (
                    <Stepper
                      label={isEnglish ? 'Rounds' : '轮数'}
                      value={stage.fixedRounds ?? effectiveRounds(stage)}
                      min={1}
                      max={8}
                      onChange={value => updateStage(stage.id, { fixedRounds: value, rounds: value })}
                    />
                  )}
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

                <div className="space-y-1.5">
                  <span className="text-xs text-slate-500">
                    {isEnglish ? 'Match length per round' : '每轮比赛局数'}
                  </span>
                  {Array.from({ length: effectiveRounds(stage) }, (_, i) => i + 1).map(round => (
                    <div key={round} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-slate-500">
                        {isEnglish ? `Round ${round}` : `第${round}轮`}
                      </span>
                      <div className="grid flex-1 grid-cols-4 gap-1.5">
                        {GAME_TYPES.map(gameType => (
                          <button
                            key={gameType}
                            type="button"
                            onClick={() => {
                              const next = [...stage.roundGameTypes];
                              next[round - 1] = gameType;
                              updateStage(stage.id, { roundGameTypes: next });
                            }}
                            className={`rounded py-1 text-[10px] font-medium transition-colors ${
                              stage.roundGameTypes[round - 1] === gameType
                                ? 'border border-gold-500/30 bg-gold-500/20 text-gold-400'
                                : 'border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            {gameType.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {stage.kind === 'single_elimination' && (
                  <div className="space-y-1.5 border-t border-slate-700/40 pt-3">
                    <label className="flex items-center gap-2 text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        checked={!!stage.breakout}
                        onChange={event => updateStage(stage.id, {
                          breakout: event.target.checked
                            ? { pairings: [[3, 6], [4, 5]] }
                            : undefined,
                        })}
                        className="h-3.5 w-3.5 accent-gold-500"
                      />
                      <span>
                        {isEnglish
                          ? 'Pair advancers across source groups by rank'
                          : '按来源小组名次跨组配对晋级选手'}
                      </span>
                    </label>
                    {stage.breakout && (
                      <div className="space-y-1.5 pl-5">
                        {stage.breakout.pairings.map((pair, pairIndex) => (
                          <div
                            key={`pair-${pairIndex}`}
                            className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400"
                          >
                            <span>{isEnglish ? 'rank' : '名次'}</span>
                            <input
                              type="number"
                              min={1}
                              max={64}
                              value={pair[0]}
                              onChange={event => updateBreakoutPair(stage.id, pairIndex, 0, Number(event.target.value))}
                              aria-label={isEnglish ? `Pairing ${pairIndex + 1} first rank` : `第${pairIndex + 1}组配对的第一个名次`}
                              className="w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                            />
                            <span>vs</span>
                            <input
                              type="number"
                              min={1}
                              max={64}
                              value={pair[1]}
                              onChange={event => updateBreakoutPair(stage.id, pairIndex, 1, Number(event.target.value))}
                              aria-label={isEnglish ? `Pairing ${pairIndex + 1} second rank` : `第${pairIndex + 1}组配对的第二个名次`}
                              className="w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                            />
                            <button
                              type="button"
                              onClick={() => removeBreakoutPair(stage.id, pairIndex)}
                              aria-label={isEnglish ? `Remove pairing ${pairIndex + 1}` : `删除第${pairIndex + 1}组配对`}
                              className="rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-1 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                            >
                              {isEnglish ? 'Remove' : '删除'}</button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addBreakoutPair(stage.id)}
                          disabled={stage.breakout.pairings.length >= 4}
                          className="rounded border border-dashed border-slate-600/60 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-gold-500/40 hover:text-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {isEnglish ? 'Add pairing' : '添加配对'}
                        </button>
                        <p className="text-[10px] leading-relaxed text-slate-500">
                          {isEnglish
                            ? 'Both ranks present: they play each other. Only one present: that player advances directly.'
                            : '两个名次都有人：两人对阵；只有一边：该选手直接晋级。'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {stage.kind === 'single_elimination' && upstreamGroupNames.length > 0 && (
                  <div className="space-y-1.5 border-t border-slate-700/40 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        {isEnglish ? 'Bracket slots' : '签表对位'}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateSeedRules(stage.id, rules => [
                          ...rules,
                          {
                            sourceGroupName: upstreamGroupNames[0] ?? '',
                            rank: 1,
                            targetSlot: rules.length,
                          },
                        ])}
                        className="rounded border border-dashed border-slate-600/60 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-gold-500/40 hover:text-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
                      >
                        {isEnglish ? 'Add slot' : '添加对位'}
                      </button>
                    </div>
                    {(stage.seedRules ?? []).map((rule, seedIndex) => (
                      <div
                        key={`seed-${seedIndex}`}
                        className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400"
                      >
                        <select
                          value={rule.sourceGroupName}
                          onChange={event => updateSeedRules(stage.id, rules => rules.map((item, index) =>
                            index === seedIndex ? { ...item, sourceGroupName: event.target.value } : item
                          ))}
                          aria-label={isEnglish ? `Bracket slot ${seedIndex + 1} source group` : `签表第${seedIndex + 1}位的来源小组`}
                          className="rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                        >
                          {upstreamGroupNames.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          {!upstreamGroupNames.includes(rule.sourceGroupName) && (
                            <option value={rule.sourceGroupName}>{rule.sourceGroupName}</option>
                          )}
                        </select>
                        <span>{isEnglish ? 'rank' : '第'}</span>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={rule.rank}
                          onChange={event => updateSeedRules(stage.id, rules => rules.map((item, index) =>
                            index === seedIndex
                              ? { ...item, rank: Math.max(1, Number(event.target.value) || 1) }
                              : item
                          ))}
                          aria-label={isEnglish ? `Bracket slot ${seedIndex + 1} source rank` : `签表第${seedIndex + 1}位的来源名次`}
                          className="w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                        />
                        <span>{isEnglish ? '' : '名'}</span>
                        <span className="text-slate-500">→</span>
                        <span>{isEnglish ? 'slot' : '签表第'}</span>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={rule.targetSlot + 1}
                          onChange={event => updateSeedRules(stage.id, rules => rules.map((item, index) =>
                            index === seedIndex
                              ? { ...item, targetSlot: Math.max(0, (Number(event.target.value) || 1) - 1) }
                              : item
                          ))}
                          aria-label={isEnglish ? `Bracket slot ${seedIndex + 1} target slot` : `签表第${seedIndex + 1}位的目标签位`}
                          className="w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                        />
                        <span>{isEnglish ? '' : '位'}</span>
                        <button
                          type="button"
                          onClick={() => updateSeedRules(stage.id, rules =>
                            rules.filter((_, index) => index !== seedIndex)
                          )}
                          aria-label={isEnglish ? `Remove bracket slot ${seedIndex + 1}` : `删除第${seedIndex + 1}个签表对位`}
                          className="rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-1 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                        >
                          {isEnglish ? 'Remove' : '删除'}
                        </button>
                      </div>
                    ))}
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      {isEnglish
                        ? 'Pins each source group rank to a bracket slot. Advancers not listed fill the remaining slots in order.'
                        : '把来源小组的名次固定到签表位置；没有列出的晋级选手按顺序补入空位。'}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-slate-700/40 bg-slate-900/20 p-3">
                <span className="text-xs font-medium text-slate-400">
                  {isEnglish ? 'Advancement rules' : '晋级规则'}
                </span>
                <div className="space-y-1.5">
                  {(stage.advancementRules ?? []).map(rule => (
                    <div key={rule.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                      <span>{isEnglish ? 'Rank' : '名次'}</span>
                      <input
                        type="number"
                        value={rule.fromRank}
                        min={1}
                        max={64}
                        onChange={event => {
                          const next = Math.max(1, Number(event.target.value) || 1);
                          updateStage(stage.id, {
                            advancementRules: (stage.advancementRules ?? []).map(item =>
                              item.id === rule.id ? { ...item, fromRank: next } : item
                            ),
                          });
                        }}
                        aria-label={isEnglish ? 'Advancement starting rank' : '晋级起始名次'}
                        className="w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        value={rule.toRank}
                        min={1}
                        max={64}
                        onChange={event => {
                          const next = Math.max(1, Number(event.target.value) || 1);
                          updateStage(stage.id, {
                            advancementRules: (stage.advancementRules ?? []).map(item =>
                              item.id === rule.id ? { ...item, toRank: next } : item
                            ),
                          });
                        }}
                        aria-label={isEnglish ? 'Advancement ending rank' : '晋级结束名次'}
                        className="w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                      />
                      <span>{isEnglish ? 'wins' : '胜场'}</span>
                      <input
                        type="number"
                        value={rule.minWins ?? ''}
                        min={0}
                        max={20}
                        placeholder={isEnglish ? 'any' : '不限'}
                        onChange={event => {
                          const raw = event.target.value;
                          updateStage(stage.id, {
                            advancementRules: (stage.advancementRules ?? []).map(item =>
                              item.id === rule.id
                                ? { ...item, minWins: raw === '' ? undefined : Math.max(0, Number(raw) || 0) }
                                : item
                            ),
                          });
                        }}
                        aria-label={isEnglish ? 'Minimum wins' : '最低胜场'}
                        className="w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        value={rule.maxWins ?? ''}
                        min={0}
                        max={20}
                        placeholder={isEnglish ? 'any' : '不限'}
                        onChange={event => {
                          const raw = event.target.value;
                          updateStage(stage.id, {
                            advancementRules: (stage.advancementRules ?? []).map(item =>
                              item.id === rule.id
                                ? { ...item, maxWins: raw === '' ? undefined : Math.max(0, Number(raw) || 0) }
                                : item
                            ),
                          });
                        }}
                        aria-label={isEnglish ? 'Maximum wins' : '最高胜场'}
                        className="w-14 rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-1 text-center text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50"
                      />
                      <span className="text-slate-500">→</span>
                      <select
                        value={rule.targetStageId || defaultTargetStageId}
                        onChange={event => updateRuleTarget(stage.id, rule.id, event.target.value)}
                        className={`max-w-[10rem] rounded border bg-slate-800/60 px-1.5 py-1 text-slate-200 outline-none focus:border-gold-500/40 focus-visible:ring-1 focus-visible:ring-gold-400/50 ${
                          rule.targetStageId || defaultTargetStageId
                            ? 'border-slate-700/50'
                            : 'border-amber-500/60'
                        }`}
                        title={isEnglish ? 'Where these players advance to' : '这些选手晋级到哪个赛段'}
                        aria-label={isEnglish ? 'Target stage' : '目标赛段'}
                      >
                        <option value="">{isEnglish ? 'Choose target stage' : '选择目标赛段'}</option>
                        {laterStages.map(target => (
                          <option key={target.id} value={target.id}>
                            {target.name || (isEnglish ? 'Untitled stage' : '未命名赛段')}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => updateStage(stage.id, {
                          advancementRules: (stage.advancementRules ?? []).filter(item => item.id !== rule.id),
                        })}
                        className="rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-1 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                      >
                        {isEnglish ? 'Remove' : '删除'}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addRule(stage.id, laterStages[0]?.id ?? '')}
                    className="rounded border border-dashed border-slate-600/60 px-2 py-1 text-[11px] text-slate-400 hover:border-gold-500/40 hover:text-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
                  >
                    {isEnglish ? 'Add rule' : '添加晋级条件'}
                  </button>
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    {isEnglish
                      ? 'Checked per source group: ranks in range (and wins in range when set) advance to the chosen stage. One stage can point to several stages.'
                      : '按来源小组逐个判定：名次在区间内（若填写胜场则同时满足）的选手晋级到所选赛段；同一赛段可以指向多个赛段。'}
                  </p>
                </div>
              </div>
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
