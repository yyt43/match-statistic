import { ArrowLeftRight, ListOrdered, Shuffle } from 'lucide-react';
import { useState } from 'react';
import type { Match, Player } from '../../types';

interface RoundEditorProps {
  matches: Match[];
  players: Player[];
  isEnglish: boolean;
  onSave: (updates: { matchId: string; player1Id: string; player2Id: string; isBye?: boolean }[]) => void;
  onCancel: () => void;
}

interface MatchSlots {
  p1: string;
  p2: string;
  isBye: boolean;
}

export function RoundEditor({ matches, players, onSave, onCancel, isEnglish }: RoundEditorProps) {
  const editableMatches = matches.filter(match => match.result === 'pending');
  const [slots, setSlots] = useState<Record<string, MatchSlots>>(() => {
    const initial: Record<string, MatchSlots> = {};
    for (const match of editableMatches) {
      initial[match.id] = { p1: match.player1Id, p2: match.player2Id, isBye: !!match.isBye };
    }
    return initial;
  });
  const [selected, setSelected] = useState<{ matchId: string; side: 'p1' | 'p2' } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerName = (id: string) => id === 'bye'
    ? (isEnglish ? 'Bye' : '轮空')
    : (players.find(player => player.id === id)?.name || (isEnglish ? 'Unknown' : '未知'));

  const isByeSlot = (matchId: string, side: 'p1' | 'p2') => {
    return slots[matchId]?.isBye && side === 'p2';
  };

  const showFlash = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 1200);
  };

  const handleSlotClick = (matchId: string, side: 'p1' | 'p2') => {
    if (isByeSlot(matchId, side)) return;
    if (!selected) {
      setSelected({ matchId, side });
      return;
    }
    if (isByeSlot(selected.matchId, selected.side)) return;
    if (selected.matchId === matchId && selected.side === side) {
      setSelected(null);
      return;
    }

    const fromId = slots[selected.matchId][selected.side];
    const toId = slots[matchId][side];
    setSlots(previous => {
      const next = { ...previous };
      next[selected.matchId] = { ...previous[selected.matchId], [selected.side]: toId };
      next[matchId] = { ...next[matchId], [side]: fromId };
      return next;
    });
    setSelected(null);
    showFlash(isEnglish ? 'Swapped' : '已交换');
  };

  const handleRandomAssign = () => {
    const allPlayerIds: string[] = [];
    for (const match of editableMatches) {
      if (slots[match.id].p1 !== 'bye') allPlayerIds.push(slots[match.id].p1);
      if (slots[match.id].p2 !== 'bye') allPlayerIds.push(slots[match.id].p2);
    }
    for (let index = allPlayerIds.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [allPlayerIds[index], allPlayerIds[randomIndex]] = [allPlayerIds[randomIndex], allPlayerIds[index]];
    }

    const next: Record<string, MatchSlots> = { ...slots };
    let playerIndex = 0;
    for (const match of editableMatches) {
      if (slots[match.id].isBye) {
        const player1 = allPlayerIds[playerIndex++];
        if (player1) next[match.id] = { p1: player1, p2: 'bye', isBye: true };
      } else {
        const player1 = allPlayerIds[playerIndex++];
        const player2 = allPlayerIds[playerIndex++];
        if (player1 && player2 && player1 !== player2) {
          next[match.id] = { p1: player1, p2: player2, isBye: false };
        }
      }
    }
    setSlots(next);
    setSelected(null);
    setError(null);
    showFlash(isEnglish ? 'Randomly assigned' : '已随机分配');
  };

  const handleSequentialAssign = () => {
    const ordered = players.filter(player => !player.dropped && !player.eliminated);
    const next: Record<string, MatchSlots> = { ...slots };
    let playerIndex = 0;
    let conflict = false;

    for (const match of editableMatches) {
      if (slots[match.id].isBye) {
        const player1 = ordered[playerIndex];
        if (!player1) {
          conflict = true;
          break;
        }
        next[match.id] = { p1: player1.id, p2: 'bye', isBye: true };
        playerIndex += 1;
      } else {
        const player1 = ordered[playerIndex];
        const player2 = ordered[playerIndex + 1];
        if (!player1 || !player2 || player1.id === player2.id) {
          conflict = true;
          break;
        }
        next[match.id] = { p1: player1.id, p2: player2.id, isBye: false };
        playerIndex += 2;
      }
    }

    setSlots(next);
    setSelected(null);
    if (conflict) {
      setError(isEnglish ? 'Not enough players to fill all matches; the remaining matches stay unchanged.' : '选手数量不足以填满所有对阵，剩余对阵保持原值');
    } else {
      setError(null);
      showFlash(isEnglish ? 'Assigned by entry order' : '已按录入顺序分配');
    }
  };

  const handleSave = () => {
    onSave(editableMatches.map(match => ({
      matchId: match.id,
      player1Id: slots[match.id].p1,
      player2Id: slots[match.id].p2,
      isBye: slots[match.id].isBye,
    })));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="mb-3 px-3 py-2 bg-gold-500/10 rounded-lg border border-gold-500/20 flex items-center gap-2">
        <ArrowLeftRight className="w-3.5 h-3.5 text-gold-400 flex-shrink-0" />
        <span className="text-[11px] text-gold-300/90">
          {isEnglish
            ? 'Click a player to select them, then click another player to swap; clicking the selected player again cancels the selection.'
            : '点击选手高亮选中，再点击另一选手即可交换；点击已选中选手可取消'}
        </span>
      </div>

      <div className="mb-3 flex gap-2">
        <button
          onClick={handleRandomAssign}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 transition-colors text-xs border border-violet-500/30"
        >
          <Shuffle className="w-3.5 h-3.5" />
          {isEnglish ? 'Randomize' : '随机分配'}
        </button>
        <button
          onClick={handleSequentialAssign}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors text-xs border border-emerald-500/30"
        >
          <ListOrdered className="w-3.5 h-3.5" />
          {isEnglish ? 'By entry order' : '按录入顺序'}
        </button>
      </div>

      {error && (
        <div className="mb-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {editableMatches.map((match, index) => {
          const player1Selected = selected?.matchId === match.id && selected.side === 'p1';
          const player2Selected = selected?.matchId === match.id && selected.side === 'p2';
          const isBye = slots[match.id].isBye;
          const samePerson = !isBye && slots[match.id].p1 === slots[match.id].p2;
          return (
            <div
              key={match.id}
              className={`bg-slate-800/40 rounded-lg p-3 border ${
                samePerson ? 'border-rose-500/50 bg-rose-500/5' : isBye ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700/40'
              }`}
            >
              <div className="text-[10px] text-slate-500 font-mono mb-2">
                #{String(index + 1).padStart(2, '0')}
                {isBye && <span className="ml-2 text-amber-400">{isEnglish ? 'Bye' : '轮空'}</span>}
                {samePerson && <span className="ml-2 text-rose-400">{isEnglish ? 'Same player on both sides; please adjust.' : '双方为同一人，请调整'}</span>}
              </div>
              <div className="flex items-stretch gap-3">
                <button
                  onClick={() => handleSlotClick(match.id, 'p1')}
                  className={`flex-1 rounded-md p-2.5 font-bold text-center transition-all relative ${
                    player1Selected
                      ? 'bg-gold-500/50 text-white ring-2 ring-gold-400 scale-[1.03] shadow-lg shadow-gold-500/20'
                      : 'bg-slate-700/40 text-white hover:bg-slate-700/60'
                  }`}
                >
                  {player1Selected && <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-gold-300 animate-pulse" />}
                  <span className="truncate text-sm block">{playerName(slots[match.id].p1)}</span>
                </button>
                <div className="flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600/50">
                    <span className="font-display text-[10px] font-bold text-slate-400">VS</span>
                  </div>
                </div>
                {isBye ? (
                  <div className="flex-1 rounded-md p-2.5 font-bold text-center bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-not-allowed">
                    <span className="truncate text-sm block">{isEnglish ? 'Bye' : '轮空'}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSlotClick(match.id, 'p2')}
                    className={`flex-1 rounded-md p-2.5 font-bold text-center transition-all relative ${
                      player2Selected
                        ? 'bg-gold-500/50 text-white ring-2 ring-gold-400 scale-[1.03] shadow-lg shadow-gold-500/20'
                        : 'bg-slate-700/40 text-white hover:bg-slate-700/60'
                    }`}
                  >
                    {player2Selected && <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-gold-300 animate-pulse" />}
                    <span className="truncate text-sm block">{playerName(slots[match.id].p2)}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {flash && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-gold-500/30 text-gold-200 text-xs border border-gold-400/40 backdrop-blur-sm pointer-events-none">
          {flash}
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-slate-700/40 mt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg bg-slate-700/40 text-slate-300 hover:bg-slate-700/60 transition-colors text-sm"
        >
          {isEnglish ? 'Cancel' : '取消'}
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 rounded-lg bg-gold-500/20 text-gold-400 hover:bg-gold-500/30 border border-gold-500/30 transition-colors text-sm font-medium"
        >
          {isEnglish ? 'Save pairings' : '保存对阵'}
        </button>
      </div>
    </div>
  );
}
