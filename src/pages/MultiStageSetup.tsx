import { useState } from 'react';
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
import type { GameType, PairingType } from '../types';
import { useLanguagePreference } from '../i18n/context';
import { useTournamentStore } from '../store/useTournamentStore';
import { createDefaultStageDraft, createMultiStageCompetition } from '../store/multiStageFactory';
import type { MultiStageDraftStage } from '../utils/multiStage';
import { getSingleEliminationRounds } from '../utils/swissPairing';
import { StorageBanner } from '../components/common/StorageBanner';
import { WriterLockBanner } from '../components/common/WriterLockBanner';

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
  return stage.kind === 'single_elimination'
    ? getSingleEliminationRounds(stage.playerCountPerGroup)
    : stage.rounds;
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
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="h-7 w-7 shrink-0 rounded border border-slate-700/50 bg-slate-800/50 text-slate-300 transition-colors hover:bg-slate-700/50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-[3rem] flex-1 rounded border border-slate-700/50 bg-slate-800/30 py-1 text-center text-sm tabular-nums text-slate-200">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="h-7 w-7 shrink-0 rounded border border-slate-700/50 bg-slate-800/50 text-slate-300 transition-colors hover:bg-slate-700/50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </span>
    </label>
  );
}

export default function MultiStageSetup() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguagePreference();
  const isEnglish = language === 'en';
  const initMultiStageCompetition = useTournamentStore(state => state.initMultiStageCompetition);

  const [nameInput, setNameInput] = useState('新建赛事');
  const [stages, setStages] = useState<MultiStageDraftStage[]>(() => [createDefaultStageDraft(1)]);

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

  const startEvent = () => {
    if (hasInvalidStage) return;
    const competition = createMultiStageCompetition(nameInput.trim() || '多阶段赛事', stages);
    initMultiStageCompetition(competition);
    navigate('/workspace');
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
              <h1 className="truncate text-lg font-semibold text-slate-100">
                {isEnglish ? 'Multi-stage rules' : '多阶段赛制设置'}
              </h1>
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
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-gold-500/40"
            />
          </section>

          {stages.map((stage, index) => (
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
                  className="min-w-0 flex-1 rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-sm text-white outline-none focus:border-gold-500/40"
                />
                <button
                  type="button"
                  onClick={() => moveStage(index, -1)}
                  disabled={index === 0}
                  className="shrink-0 rounded-md border border-slate-700/50 bg-slate-800/50 p-1 text-slate-300 transition-colors hover:bg-slate-700/50 disabled:cursor-not-allowed disabled:opacity-30"
                  title={isEnglish ? 'Move up' : '上移'}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStage(index, 1)}
                  disabled={index === stages.length - 1}
                  className="shrink-0 rounded-md border border-slate-700/50 bg-slate-800/50 p-1 text-slate-300 transition-colors hover:bg-slate-700/50 disabled:cursor-not-allowed disabled:opacity-30"
                  title={isEnglish ? 'Move down' : '下移'}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeStage(stage.id)}
                  disabled={stages.length <= 1}
                  className="shrink-0 rounded-md border border-rose-500/25 bg-rose-500/10 p-1 text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                  title={isEnglish ? 'Delete stage' : '删除赛段'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

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
                      className={`rounded-lg py-2 text-xs font-medium transition-colors ${
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

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stepper
                  label={isEnglish ? 'Groups' : '小组数'}
                  value={stage.groupCount}
                  min={1}
                  max={8}
                  onChange={value => updateStage(stage.id, { groupCount: value })}
                />
                <Stepper
                  label={isEnglish ? 'Players per group' : '每组人数'}
                  value={stage.playerCountPerGroup}
                  min={2}
                  max={128}
                  onChange={value => updateStage(stage.id, { playerCountPerGroup: value })}
                />
                {stage.kind === 'swiss' ? (
                  <Stepper
                    label={isEnglish ? 'Rounds' : '轮数'}
                    value={stage.rounds}
                    min={1}
                    max={20}
                    onChange={value => updateStage(stage.id, { rounds: value })}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-500">
                      {isEnglish ? 'Rounds (auto)' : '轮数（自动）'}
                    </span>
                    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 py-1.5 text-center text-sm tabular-nums text-slate-400">
                      {effectiveRounds(stage)}
                    </div>
                  </div>
                )}
                <label className="block space-y-1.5">
                  <span className="text-xs text-slate-500">{isEnglish ? 'Roster source' : '名单来源'}</span>
                  <select
                    value={stage.sourceStageIds?.[0] ?? ''}
                    onChange={event =>
                      updateStage(stage.id, {
                        sourceStageIds: event.target.value ? [event.target.value] : undefined,
                      })}
                    className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2 py-1.5 text-sm text-white outline-none focus:border-gold-500/40"
                  >
                    <option value="">{isEnglish ? 'Manual import' : '手动导入'}</option>
                    {stages.slice(0, index).map(previous => (
                      <option key={previous.id} value={previous.id}>
                        {previous.name || (isEnglish ? 'Untitled stage' : '未命名赛段')}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <span className="text-xs text-slate-500">
                  {isEnglish ? 'Match length per round' : '每轮比赛局数'}
                </span>
                <div className="space-y-1.5">
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
              </div>
            </section>
          ))}

          <button
            type="button"
            onClick={addStage}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600/60 bg-slate-800/30 py-3 text-xs text-slate-400 transition-colors hover:border-gold-500/40 hover:text-gold-400"
          >
            <Plus className="h-3.5 w-3.5" />
            {isEnglish ? 'Add stage' : '添加赛段'}
          </button>

          {hasInvalidStage && (
            <p className="text-xs text-amber-400">
              {isEnglish
                ? 'Every stage needs a name and at least two players per group.'
                : '每个赛段都需要名称，且每组至少两人。'}
            </p>
          )}
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
              className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700/50"
            >
              {isEnglish ? 'Cancel' : '取消'}
            </button>
            <button
              type="button"
              onClick={startEvent}
              disabled={hasInvalidStage}
              className="flex items-center gap-2 rounded-lg border border-gold-500/40 bg-gold-500/20 px-4 py-2 text-sm font-medium text-gold-400 transition-colors hover:bg-gold-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trophy className="h-4 w-4" />
              {isEnglish ? 'Continue to setup' : '进入赛事设置'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
