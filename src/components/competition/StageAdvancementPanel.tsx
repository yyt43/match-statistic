import { useState } from 'react';
import { ArrowRight, Check, ShieldCheck, Undo2, X } from 'lucide-react';
import type { StageAdvancementPreview, StageAdvancementSeat } from '../../types';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import { getOrderedStages } from '../../utils/multiStage';
import {
  findAdvancementRecord,
  getUnconfirmedUpstreamStageIds,
  hasDownstreamResults,
  isStageResultLocked,
  isStageComplete,
} from '../../utils/advancement';

function describeSeat(seat: StageAdvancementSeat, isEnglish: boolean): string {
  const code = seat.participantCode ?? seat.name;
  const rank = seat.originRank ?? seat.finalRank;
  const group = seat.originGroupName ?? seat.sourceGroupName;
  if (seat.route === 'breakout_direct') {
    return `${group} ${isEnglish ? `rank ${rank}` : `第${rank}名`} · ${code} · ${isEnglish ? 'advances directly' : '直接晋级'}`;
  }
  if (seat.route === 'breakout') {
    return `${group} ${isEnglish ? `rank ${rank}` : `第${rank}名`} · ${code} · ${isEnglish ? 'breakout match' : '参加突围对局'}`;
  }
  return `${group} ${isEnglish ? `rank ${rank}` : `第${rank}名`} · ${code}`;
}

/** 赛段晋级：计算 → 预览 → 确认落库，并可回退。 */
export function StageAdvancementPanel() {
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const competition = useTournamentStore(state => state.competition);
  const previewStageAdvancement = useTournamentStore(state => state.previewStageAdvancement);
  const confirmStageAdvancement = useTournamentStore(state => state.confirmStageAdvancement);
  const revertStageAdvancement = useTournamentStore(state => state.revertStageAdvancement);
  const [preview, setPreview] = useState<StageAdvancementPreview | null>(null);

  const stages = getOrderedStages(competition);
  const currentGroup = competition.groups[competition.currentGroupIndex];
  const currentStage = stages.find(stage => stage.id === currentGroup?.stageId);
  const downstream = currentStage
    ? stages.filter(stage => stage.sourceStageIds?.includes(currentStage.id))
    : [];
  if (!currentStage || downstream.length === 0) return null;

  const record = findAdvancementRecord(competition, currentStage.id);
  const stageComplete = isStageComplete(competition, currentStage);
  const locked = record ? hasDownstreamResults(competition, currentStage) : false;
  const upstreamPending = getUnconfirmedUpstreamStageIds(competition, currentStage.id);
  const resultsLocked = isStageResultLocked(competition, currentStage.id);
  const targetNames = downstream.map(stage => stage.name).join(isEnglish ? ', ' : '、');

  return (
    <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
        <ShieldCheck className="h-3.5 w-3.5 text-gold-400" />
        {isEnglish ? 'Stage advancement' : '赛段晋级'}
        <span className="ml-auto text-[10px] text-slate-500">{currentStage.name}</span>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        {record
          ? (isEnglish
              ? `Confirmed at ${new Date(record.confirmedAt).toLocaleString()}`
              : `已于 ${new Date(record.confirmedAt).toLocaleString()} 确认`)
          : (isEnglish
              ? `Advancers will be written into ${targetNames}.`
              : `晋级名单将写入：${targetNames}。`)}
      </p>

      {!stageComplete && (
        <p className="text-[10px] text-amber-400">
          {isEnglish
            ? 'Finish every group of this stage first.'
            : '请先完成本赛段全部小组的比赛。'}
        </p>
      )}
      {locked && (
        <p className="text-[10px] text-amber-400">
          {isEnglish
            ? 'Downstream stages already have data. Clear them before reverting.'
            : '下游赛段已有名单或对阵，需先清空下游才能回退。'}
        </p>
      )}
      {upstreamPending.length > 0 && (
        <p className="text-[10px] text-amber-400">
          {isEnglish
            ? 'The upstream stage has not confirmed its advancers yet, so this stage cannot start.'
            : '上游赛段尚未确认晋级，本赛段不能开赛。'}
        </p>
      )}
      {resultsLocked && (
        <p className="text-[10px] text-amber-400">
          {isEnglish
            ? 'Results are locked because the downstream stage already started. Clear it and revert the advancement first.'
            : '下游赛段已开赛，本赛段赛果已锁定；请先清空下游并回退晋级。'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setPreview(previewStageAdvancement(currentStage.id))}
          disabled={!stageComplete}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gold-500/40 bg-gold-500/15 py-2 text-[11px] font-medium text-gold-400 transition-colors hover:bg-gold-500/25 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          {isEnglish ? 'Calculate' : '计算晋级'}
        </button>
        <button
          onClick={() => revertStageAdvancement(currentStage.id)}
          disabled={!record || locked}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 py-2 text-[11px] font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Undo2 className="h-3.5 w-3.5" />
          {isEnglish ? 'Revert' : '回退晋级'}
        </button>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-700/50 px-4 py-3">
              <ShieldCheck className="h-4 w-4 text-gold-400" />
              <span className="text-sm font-semibold text-slate-100">
                {isEnglish ? 'Advancement preview' : '晋级预览'}
              </span>
              <button
                onClick={() => setPreview(null)}
                className="ml-auto rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                title={isEnglish ? 'Close' : '关闭'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {preview.errors.map(error => (
                <p key={error} className="rounded bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">
                  {error}
                </p>
              ))}
              {preview.warnings.map(warning => (
                <p key={warning} className="rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
                  {warning}
                </p>
              ))}

              {downstream.map(stage => {
                const seats = preview.seats.filter(seat => seat.targetStageId === stage.id);
                if (seats.length === 0) return null;
                return (
                  <section key={stage.id} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="font-medium">{stage.name}</span>
                      <span className="text-[10px] text-slate-500">
                        {isEnglish ? `${seats.length} seats` : `${seats.length} 个席位`}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {seats.map((seat, index) => (
                        <li
                          key={`${seat.targetStageId}-${seat.participantCode}-${index}`}
                          className="flex items-center gap-2 rounded bg-slate-800/50 px-2 py-1 text-[11px] text-slate-400"
                        >
                          <span className="w-6 shrink-0 text-right font-mono text-[10px] text-slate-500">
                            {seat.targetSlot !== undefined ? seat.targetSlot + 1 : index + 1}
                          </span>
                          <span className="min-w-0 truncate">{describeSeat(seat, isEnglish)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-700/50 px-4 py-3">
              <button
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/50"
              >
                {isEnglish ? 'Cancel' : '取消'}
              </button>
              <button
                onClick={() => {
                  confirmStageAdvancement(preview);
                  setPreview(null);
                }}
                disabled={preview.errors.length > 0 || preview.seats.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                {isEnglish ? 'Confirm and write' : '确认并落库'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
