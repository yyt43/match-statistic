import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Keyboard, Swords, X } from 'lucide-react';
import type { MatchResult } from '../../types';
import { useCurrentGroup, useTournamentStore } from '../../store/useTournamentStore';
import { useLanguagePreference } from '../../i18n/context';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { getRoundGameType } from '../../utils/swissPairing';
import { ResultButtons } from './ResultButtons';

interface QuickScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function winScore(gameType: 'bo1' | 'bo3' | 'bo5' | 'bo7'): number {
  return gameType === 'bo7' ? 4 : gameType === 'bo5' ? 3 : gameType === 'bo3' ? 2 : 1;
}

export function QuickScoreModal({ isOpen, onClose }: QuickScoreModalProps) {
  const currentGroup = useCurrentGroup();
  const updateMatchResult = useTournamentStore(state => state.updateMatchResult);
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEscapeClose(isOpen, onClose);
  useFocusTrap(isOpen, dialogRef);

  const matches = useMemo(
    () => currentGroup.matches.filter(match => match.round === currentGroup.currentRound),
    [currentGroup.currentRound, currentGroup.matches]
  );
  const selectedIndex = Math.max(0, matches.findIndex(match => match.id === selectedMatchId));
  const selectedMatch = matches[selectedIndex] ?? null;
  const gameType = getRoundGameType(currentGroup, currentGroup.currentRound);
  const pendingCount = matches.filter(match => match.result === 'pending').length;

  useEffect(() => {
    if (!isOpen) return;
    setSelectedMatchId(current => {
      if (current && matches.some(match => match.id === current)) return current;
      const firstPending = matches.find(match => match.result === 'pending');
      return firstPending?.id ?? null;
    });
  }, [isOpen, currentGroup.id, currentGroup.currentRound, matches]);

  const moveSelection = (direction: -1 | 1) => {
    if (matches.length === 0) return;
    const next = (selectedIndex + direction + matches.length) % matches.length;
    setSelectedMatchId(matches[next].id);
  };

  const applyResult = (
    result: MatchResult,
    player1Games?: number,
    player2Games?: number,
    preDrop?: boolean
  ) => {
    if (!selectedMatch) return;
    updateMatchResult(selectedMatch.id, result, player1Games, player2Games, preDrop);

    const nextPending = matches.find((match, index) =>
      match.id !== selectedMatch.id && match.result === 'pending' && index > selectedIndex
    ) ?? matches.find(match => match.id !== selectedMatch.id && match.result === 'pending');
    window.setTimeout(() => setSelectedMatchId(nextPending?.id ?? null), 0);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key.toLowerCase() === 'd') {
        event.preventDefault();
        applyResult('draw', 0, 0);
      } else if (event.key === '1') {
        event.preventDefault();
        applyResult('player1', winScore(gameType), 0);
      } else if (event.key === '2') {
        event.preventDefault();
        applyResult('player2', 0, winScore(gameType));
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  if (!isOpen) return null;

  const playerName = (id: string) => {
    if (id === 'bye') return isEnglish ? 'Bye' : '轮空';
    return currentGroup.players.find(player => player.id === id)?.name
      ?? (isEnglish ? 'Unknown player' : '未知选手');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-300">
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">{isEnglish ? 'Quick score entry' : '快速录分'}</h3>
              <p className="text-[11px] text-slate-500">
                {isEnglish
                  ? `${currentGroup.name} · Round ${currentGroup.currentRound} · ${pendingCount} pending`
                  : `${currentGroup.name} · 第${currentGroup.currentRound}轮 · 剩余 ${pendingCount} 场`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-700/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => moveSelection(-1)}
              disabled={matches.length <= 1}
              className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex flex-1 gap-1.5 overflow-x-auto">
              {matches.map((match, index) => (
                <button
                  key={match.id}
                  onClick={() => setSelectedMatchId(match.id)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition-colors ${
                    match.id === selectedMatch?.id
                      ? 'border-gold-500/40 bg-gold-500/15 text-gold-300'
                      : match.result === 'pending'
                        ? 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700'
                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  }`}
                >
                  #{index + 1}
                  {match.result !== 'pending' && <span className="ml-1">✓</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => moveSelection(1)}
              disabled={matches.length <= 1}
              className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {selectedMatch ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => applyResult('player1', winScore(gameType), 0)}
                  className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-left hover:bg-emerald-500/20"
                >
                  <div className="text-[10px] text-emerald-400">{isEnglish ? 'Left player' : '左侧选手'}</div>
                  <div className="mt-1 truncate text-lg font-semibold text-white">{playerName(selectedMatch.player1Id)}</div>
                  <div className="mt-2 text-xs text-emerald-300">{isEnglish ? 'Press 1 to win' : '按 1 判胜'}</div>
                </button>
                <button
                  onClick={() => applyResult('player2', 0, winScore(gameType))}
                  className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-right hover:bg-emerald-500/20"
                >
                  <div className="text-[10px] text-emerald-400">{isEnglish ? 'Right player' : '右侧选手'}</div>
                  <div className="mt-1 truncate text-lg font-semibold text-white">{playerName(selectedMatch.player2Id)}</div>
                  <div className="mt-2 text-xs text-emerald-300">{isEnglish ? 'Press 2 to win' : '按 2 判胜'}</div>
                </button>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-800/35 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    {isEnglish ? 'Detailed result' : '详细赛果'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {isEnglish ? 'D = double loss · arrow keys switch match' : 'D = 双负 · 方向键切换比赛'}
                  </span>
                </div>
                <ResultButtons
                  gameType={gameType}
                  isEnglish={isEnglish}
                  playoff={!!selectedMatch.isPlayoff}
                  onResult={applyResult}
                />
              </div>

              {selectedMatch.result !== 'pending' && (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {isEnglish ? 'Result recorded. You can still correct or reset it.' : '赛果已记录，仍可修改或重置。'}
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-400" />
              <div className="text-base font-semibold text-white">
                {isEnglish ? 'Current round complete' : '当前轮已全部完成'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {isEnglish ? 'Close this panel to generate the next round.' : '关闭面板后可生成下一轮。'}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-700/60 px-5 py-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Keyboard className="h-3.5 w-3.5" />
            {isEnglish ? '1 / 2 / D score · ← → switch match' : '1 / 2 / D 录分 · ← → 切换比赛'}
          </span>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            {isEnglish ? 'Close' : '关闭'}
          </button>
        </div>
      </div>
    </div>
  );
}
