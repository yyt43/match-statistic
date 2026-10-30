import { useState } from 'react';
import { ArrowRight, Check, ShieldCheck, Undo2, X } from 'lucide-react';
import type { StageAdvancementPreview, StageAdvancementSeat } from '../../types';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import { getOrderedStages } from '../../utils/multiStage';
import { getStageGroups } from '../../utils/multiStage';
import { buildRankedGroup } from '../../store/competitionState';
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
    return `${group} ${isEnglish ? `rank ${rank}` : `第${rank}名`} · ${code} · ${isEnglish ? 'play-in match' : '参加附加赛对局'}`;
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
  const [excludedSeats, setExcludedSeats] = useState<Set<string>>(new Set());
  const [adjustReason, setAdjustReason] = useState('');
  const [extraSeats, setExtraSeats] = useState<StageAdvancementSeat[]>([]);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const seatKey = (seat: StageAdvancementSeat, index: number) =>
    `${seat.targetStageId ?? ''}:${seat.participantCode ?? seat.playerId}:${index}`;

  const stages = getOrderedStages(competition);
  const currentGroup = competition.groups[competition.currentGroupIndex];
  const currentStage = stages.find(stage => stage.id === currentGroup?.stageId);
  const downstream = currentStage
    ? stages.filter(stage => stage.sourceStageIds?.includes(currentStage.id))
    : [];
  if (!currentStage || downstream.length === 0) return null;

  // 可补选的候选：来源赛段所有选手，按小组与名次列出。
  const candidates = getStageGroups(competition, currentStage).flatMap(group =>
    buildRankedGroup(group).players.map((player, index) => ({
      group,
      player,
      rank: index + 1,
    }))
  );

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
          onClick={() => {
            setConfirmError(null);
            setExcludedSeats(new Set());
            setExtraSeats([]);
            setAdjustReason('');
            setPreview(previewStageAdvancement(currentStage.id, language));
          }}
          disabled={!stageComplete || resultsLocked}
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
              {confirmError && (
                <p className="rounded bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">
                  {confirmError}
                </p>
              )}
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
                      {seats.map((seat, index) => {
                        const key = seatKey(seat, preview.seats.indexOf(seat));
                        const isExcluded = excludedSeats.has(key);
                        return (
                          <li
                            key={`${seat.targetStageId}-${seat.participantCode}-${index}`}
                            className={`flex items-center gap-2 rounded px-2 py-1 text-[11px] ${
                              isExcluded
                                ? 'bg-rose-500/10 text-slate-500 line-through'
                                : 'bg-slate-800/50 text-slate-400'
                            }`}
                          >
                            <span className="w-6 shrink-0 text-right font-mono text-[10px] text-slate-500">
                              {seat.targetSlot !== undefined ? seat.targetSlot + 1 : index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{describeSeat(seat, isEnglish)}</span>
                            <button
                              onClick={() => {
                                setExcludedSeats(current => {
                                  const next = new Set(current);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                              className="shrink-0 rounded border border-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
                            >
                              {isExcluded
                                ? (isEnglish ? 'Restore' : '恢复')
                                : (isEnglish ? 'Exclude' : '取消席位')}
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="flex items-center gap-2 pt-1">
                      <select
                        value=""
                        onChange={event => {
                          const value = event.target.value;
                          if (!value) return;
                          const [groupId, rankText] = value.split('|');
                          const entry = candidates.find(item =>
                            item.group.id === groupId && item.rank === Number(rankText)
                          );
                          if (!entry) return;
                          const usedSlots = new Set(
                            [...preview.seats, ...extraSeats]
                              .filter(item => item.targetStageId === stage.id)
                              .map(item => item.targetSlot)
                              .filter((slot): slot is number => slot !== undefined)
                          );
                          let slot = 0;
                          while (usedSlots.has(slot)) slot += 1;
                          setExtraSeats(current => [
                            ...current,
                            {
                              playerId: entry.player.id,
                              name: entry.player.name,
                              participantCode: entry.player.participantCode,
                              uid: entry.player.profile?.uid,
                              qq: entry.player.profile?.qq,
                              sourceStageId: currentStage?.id ?? '',
                              sourceGroupId: entry.group.id,
                              sourceGroupName: entry.group.name,
                              finalRank: entry.rank,
                              route: 'direct',
                              targetStageId: stage.id,
                              targetSlot: slot,
                              originGroupName: entry.group.name,
                              originRank: entry.rank,
                            },
                          ]);
                        }}
                        className="min-w-0 flex-1 rounded border border-slate-700/60 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-gold-500/40"
                      >
                        <option value="">
                          {isEnglish ? 'Add a seat from the source stage…' : '从来源赛段添加席位…'}
                        </option>
                        {candidates
                          .filter(entry =>
                            ![...preview.seats, ...extraSeats].some(seat =>
                              seat.participantCode === entry.player.participantCode
                            )
                          )
                          .map(entry => (
                            <option
                              key={`${entry.group.id}-${entry.rank}`}
                              value={`${entry.group.id}|${entry.rank}`}
                            >
                              {entry.group.name} #{entry.rank} · {entry.player.participantCode ?? ''} {entry.player.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {extraSeats.filter(seat => seat.targetStageId === stage.id).map(seat => (
                      <div
                        key={`extra-${seat.playerId}-${seat.targetSlot ?? ''}`}
                        className="flex items-center gap-2 rounded bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200"
                      >
                        <span className="w-6 shrink-0 text-right font-mono text-[10px] text-emerald-400/70">
                          {(seat.targetSlot ?? 0) + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {isEnglish ? 'Added' : '人工添加'}：{seat.participantCode ?? ''} {seat.name}
                        </span>
                        <button
                          onClick={() => setExtraSeats(current =>
                            current.filter(item =>
                              !(item.playerId === seat.playerId && item.targetSlot === seat.targetSlot)
                            )
                          )}
                          className="shrink-0 rounded border border-emerald-500/30 px-1.5 py-0.5 text-[10px] hover:border-rose-500/40 hover:text-rose-300"
                        >
                          {isEnglish ? 'Remove' : '移除'}
                        </button>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>

            <div className="space-y-2 border-t border-slate-700/50 px-4 py-3">
              <input
                value={adjustReason}
                onChange={event => setAdjustReason(event.target.value)}
                placeholder={isEnglish ? 'Reason for manual adjustment (optional)' : '人工调整理由（可选）'}
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 outline-none focus:border-gold-500/40"
              />
              <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/50"
              >
                {isEnglish ? 'Cancel' : '取消'}
              </button>
              <button
                onClick={() => {
                  const confirmed = confirmStageAdvancement(
                    {
                      ...preview,
                      seats: [
                        ...preview.seats.filter(
                          (seat, index) => !excludedSeats.has(seatKey(seat, index))
                        ),
                        ...extraSeats,
                      ],
                      reason: adjustReason.trim() || undefined,
                    },
                    language
                  );
                  if (!confirmed) {
                    setConfirmError(
                      isEnglish
                        ? 'This advancement can no longer be confirmed: the downstream stage may already have results or the roster cannot be overwritten. Review the errors below.'
                        : '该赛段已无法确认晋级：下游赛段可能已有赛果或已开赛，或名单无法安全覆盖。请查看下方错误提示。'
                    );
                    // 重新计算一次，把锁定 / 席位冲突等错误即时显示出来。
                    setPreview(previewStageAdvancement(currentStage.id, language));
                    return;
                  }
                  setConfirmError(null);
                  setPreview(null);
                  setExcludedSeats(new Set());
                  setExtraSeats([]);
                  setAdjustReason('');
                }}
                disabled={preview.errors.length > 0 || preview.seats.length === 0 || resultsLocked}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                {isEnglish ? 'Confirm and write' : '确认并落库'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
