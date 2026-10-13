import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Dices, RotateCcw, Shuffle, Trophy, X } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import type { TournamentGroup } from '../../types';
import { EliminationBracketTree } from './EliminationBracketTree';
import { validateEliminationBracket } from '../../utils/elimination';
import { getPlayerDisplayName, validateRoster } from '../../utils/playerProfiles';
import { useLanguagePreference } from '../../i18n/context';

interface EliminationBracketConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupIndices: number[];
  title?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

type EditMode = 'swap' | 'assign';

export function EliminationBracketConfirmModal({
  isOpen,
  onClose,
  groupIndices,
  title,
  confirmLabel,
  onConfirm,
}: EliminationBracketConfirmModalProps) {
  const { competition } = useTournamentStore();
  const {
    prepareEliminationBracket,
    resetEliminationBracketOrder,
    randomizeEliminationBracket,
    swapEliminationBracketSlots,
    assignEliminationBracketSlot,
  } = useTournamentStore();
  const [activeGroupIndex, setActiveGroupIndex] = useState(groupIndices[0] ?? 0);
  const [editMode, setEditMode] = useState<EditMode>('swap');
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [assignPlayerId, setAssignPlayerId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';

  const group: TournamentGroup | undefined = competition.groups[activeGroupIndex];

  useEffect(() => {
    if (!isOpen) return;
    const firstIndex = groupIndices[0] ?? competition.currentGroupIndex;
    setActiveGroupIndex(firstIndex);
    setSelectedSlots([]);
    setAssignPlayerId('');
    setError(null);
  }, [competition.currentGroupIndex, groupIndices, isOpen]);

  useEffect(() => {
    if (!isOpen || !group || group.pairingType !== 'single_elimination') return;
    if (!group.eliminationBracket) {
      prepareEliminationBracket(activeGroupIndex);
    }
  }, [activeGroupIndex, group, isOpen, prepareEliminationBracket]);

  const rosterValidation = useMemo(() => validateRoster(competition), [competition]);
  const bracket = group?.eliminationBracket;
  const bracketError = bracket && group ? validateEliminationBracket(bracket, group.players) : null;
  const canConfirm = rosterValidation.valid && !bracketError && !!bracket;

  if (!isOpen || !group) return null;

  const handleSelectSlot = (slotIndex: number) => {
    setError(null);
    if (editMode === 'swap') {
      setSelectedSlots(current => {
        if (current.includes(slotIndex)) return current.filter(index => index !== slotIndex);
        if (current.length === 0) return [slotIndex];
        const [first] = current;
        swapEliminationBracketSlots(first, slotIndex, activeGroupIndex);
        return [];
      });
      return;
    }

    if (assignPlayerId) {
      assignEliminationBracketSlot(slotIndex, assignPlayerId, activeGroupIndex);
      setAssignPlayerId('');
      return;
    }
    if (slotIndex >= 0) {
      assignEliminationBracketSlot(slotIndex, null, activeGroupIndex);
    }
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (group.eliminationBracket?.lockedAt) {
      // 签表已锁定（例如晋级引擎写入的固定签位）时，确认即开赛，不再只关闭弹窗。
      onConfirm();
      return;
    }
    if (groupIndices.length > 1) {
      const invalidIndex = groupIndices.find(index => {
        const candidate = competition.groups[index];
        if (!candidate?.eliminationBracket) return true;
        return !!validateEliminationBracket(candidate.eliminationBracket, candidate.players);
      });
      if (invalidIndex !== undefined) {
        setActiveGroupIndex(invalidIndex);
        setError(isEnglish
          ? 'Please finish this bracket before starting all groups.'
          : '请先完成该小组的签表，再开始全部小组。');
        return;
      }
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3 sm:p-5">
      <div role="dialog" aria-modal="true" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 sm:px-5">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
              <Trophy className="h-4 w-4 text-gold-400" />
              {title ?? (isEnglish ? 'Confirm elimination bracket' : '确认单败淘汰签表')}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {isEnglish
                ? 'Seeds follow the current roster order by default. The bracket locks on confirmation and later rounds only receive winners.'
                : '默认按当前选手名单顺序排阵。确认后签表锁定，后续轮次只填入胜者。'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900/70 px-4 py-2.5 sm:px-5">
          {competition.groups.length > 1 && groupIndices.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {groupIndices.map(index => (
                <button
                  key={competition.groups[index].id}
                  onClick={() => {
                    setActiveGroupIndex(index);
                    setSelectedSlots([]);
                    setError(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    activeGroupIndex === index
                      ? 'border border-gold-500/30 bg-gold-500/15 text-gold-400'
                      : 'border border-slate-700 bg-slate-800/50 text-slate-400'
                  }`}
                >
                  {competition.groups[index].name}
                </button>
              ))}
            </div>
          )}
          <span className="mr-auto text-xs text-slate-400">
            {isEnglish
              ? `${group.players.length} players · ${group.eliminationBracket?.size ?? 0} slots`
              : `${group.players.length} 名选手 · ${group.eliminationBracket?.size ?? 0} 个签位`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => resetEliminationBracketOrder(activeGroupIndex)}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {isEnglish ? 'Roster order' : '名单顺序'}
            </button>
            <button
              onClick={() => randomizeEliminationBracket(activeGroupIndex)}
              className="flex items-center gap-1 rounded-md border border-violet-500/25 bg-violet-500/10 px-2.5 py-1.5 text-[11px] text-violet-300 hover:bg-violet-500/20"
            >
              <Dices className="h-3.5 w-3.5" />
              {isEnglish ? 'Redraw' : '随机重抽'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/70 px-4 py-2.5 sm:px-5">
          <div className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-0.5">
            <button
              onClick={() => {
                setEditMode('swap');
                setSelectedSlots([]);
              }}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] ${
                editMode === 'swap' ? 'bg-gold-500/20 text-gold-300' : 'text-slate-400'
              }`}
            >
              <Shuffle className="h-3.5 w-3.5" />
              {isEnglish ? 'Swap slots' : '交换签位'}
            </button>
            <button
              onClick={() => {
                setEditMode('assign');
                setSelectedSlots([]);
              }}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] ${
                editMode === 'assign' ? 'bg-gold-500/20 text-gold-300' : 'text-slate-400'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              {isEnglish ? 'Assign player/bye' : '指定选手/轮空'}
            </button>
          </div>

          {editMode === 'assign' && (
            <select
              value={assignPlayerId}
              onChange={event => setAssignPlayerId(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] text-slate-200 outline-none"
            >
              <option value="">{isEnglish ? 'Bye / clear slot' : '轮空 / 清空签位'}</option>
              {group.players.map(player => (
                <option key={player.id} value={player.id}>{getPlayerDisplayName(player)}</option>
              ))}
            </select>
          )}
          <span className="text-[10px] text-slate-500">
            {editMode === 'swap'
              ? (isEnglish ? 'Click two slots to swap them.' : '依次点击两个签位即可互换。')
              : assignPlayerId
                ? (isEnglish
                    ? 'Click a target slot to place the selected player. An already-seeded player will swap.'
                    : '点击目标签位放置所选选手；已入选的选手会自动换位。')
                : (isEnglish
                    ? 'Choose a player, then click a slot; clicking without a player clears it as a bye.'
                    : '选择选手后点击签位；直接点击签位会清为轮空。')}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-950/45 p-4">
          {!bracket ? (
            <div className="py-20 text-center text-sm text-slate-500">
              {isEnglish ? 'Preparing bracket...' : '正在准备签表...'}
            </div>
          ) : (
            <EliminationBracketTree
              group={{ ...group, eliminationBracket: bracket }}
              isEnglish={isEnglish}
              editable
              selectedSlotIndex={selectedSlots[0] ?? null}
              onSelectSlot={handleSelectSlot}
            />
          )}
        </div>

        <div className="border-t border-slate-700 px-4 py-3 sm:px-5">
          {(error || bracketError || !rosterValidation.valid) && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {error ?? bracketError ?? (isEnglish
                  ? `${rosterValidation.issues.length} roster issues must be resolved.`
                  : `选手档案还有 ${rosterValidation.issues.length} 项需要处理。`)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-slate-500">
              {isEnglish
                ? '8-player default: 1 vs 2, 3 vs 4, 5 vs 6, 7 vs 8; adjacent winners advance.'
                : '8 人默认示例：1 vs 2、3 vs 4、5 vs 6、7 vs 8，胜者按相邻节点晋级。'}
            </span>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800">
                {isEnglish ? 'Cancel' : '取消'}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="rounded-lg border border-gold-500/35 bg-gold-500/20 px-4 py-2 text-xs font-medium text-gold-300 hover:bg-gold-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {confirmLabel ?? (isEnglish ? 'Confirm and start' : '确认并开始比赛')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
