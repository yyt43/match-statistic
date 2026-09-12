import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Keyboard, Search, Swords, X } from 'lucide-react';
import type { Match, MatchResult, TournamentGroup } from '../../types';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useLanguagePreference } from '../../i18n/context';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { getRoundGameType } from '../../utils/swissPairing';
import { ResultButtons } from './ResultButtons';

interface QuickScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QuickMatchEntry {
  key: string;
  groupIndex: number;
  group: TournamentGroup;
  match: Match;
  matchNumber: number;
}

const AUTO_ADVANCE_DELAY_MS = 900;

function winScore(gameType: 'bo1' | 'bo3' | 'bo5' | 'bo7'): number {
  return gameType === 'bo7' ? 4 : gameType === 'bo5' ? 3 : gameType === 'bo3' ? 2 : 1;
}

export function QuickScoreModal({ isOpen, onClose }: QuickScoreModalProps) {
  const competition = useTournamentStore(state => state.competition);
  const updateMatchResultForGroup = useTournamentStore(state => state.updateMatchResultForGroup);
  const isReadOnly = useTournamentStore(state => state.isReadOnly);
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchFilter, setMatchFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [groupFilter, setGroupFilter] = useState<number | 'all'>('all');
  const [recentlyRecordedKey, setRecentlyRecordedKey] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const recordFlashTimer = useRef<number | null>(null);

  useEscapeClose(isOpen, onClose);
  useFocusTrap(isOpen, dialogRef);

  const matchEntries = useMemo(() => {
    const entries: QuickMatchEntry[] = [];
    competition.groups.forEach((group, groupIndex) => {
      if (group.currentRound <= 0) return;
      const roundMatches = group.matches.filter(match => match.round === group.currentRound);
      roundMatches.forEach((match, matchIndex) => {
        entries.push({
          key: `${groupIndex}:${match.id}`,
          groupIndex,
          group,
          match,
          matchNumber: matchIndex + 1,
        });
      });
    });
    return entries;
  }, [competition.groups]);

  const groupOptions = useMemo(() => {
    const indices = Array.from(new Set(matchEntries.map(entry => entry.groupIndex)));
    return indices.map(groupIndex => {
      const group = competition.groups[groupIndex];
      const pending = matchEntries.filter(
        entry => entry.groupIndex === groupIndex && entry.match.result === 'pending'
      ).length;
      return { groupIndex, name: group.name, pending };
    });
  }, [competition.groups, matchEntries]);

  const visibleEntries = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return matchEntries.filter(entry => {
      if (entry.key === recentlyRecordedKey) return true;
      if (groupFilter !== 'all' && entry.groupIndex !== groupFilter) return false;
      if (matchFilter === 'pending' && entry.match.result !== 'pending') return false;
      if (matchFilter === 'completed' && entry.match.result === 'pending') return false;
      if (!keyword) return true;

      const resolveName = (id: string) => {
        if (id === 'bye') return isEnglish ? 'Bye' : '轮空';
        return entry.group.players.find(player => player.id === id)?.name
          ?? (isEnglish ? 'Unknown player' : '未知选手');
      };
      return (
        entry.group.name.toLowerCase().includes(keyword)
        || resolveName(entry.match.player1Id).toLowerCase().includes(keyword)
        || resolveName(entry.match.player2Id).toLowerCase().includes(keyword)
        || `#${entry.matchNumber}`.includes(keyword)
      );
    });
  }, [groupFilter, isEnglish, matchEntries, matchFilter, recentlyRecordedKey, searchQuery]);

  const selectedIndex = visibleEntries.findIndex(entry => entry.key === selectedKey);
  const selectedEntry = selectedIndex >= 0 ? visibleEntries[selectedIndex] : (visibleEntries[0] ?? null);
  const pendingCount = matchEntries.filter(entry => entry.match.result === 'pending').length;
  const visiblePendingCount = visibleEntries.filter(entry => entry.match.result === 'pending').length;
  const activeGroupCount = groupOptions.length;

  useEffect(() => {
    if (!isOpen) return;
    setSelectedKey(current => {
      if (current && visibleEntries.some(entry => entry.key === current)) return current;
      const firstPending = visibleEntries.find(entry => entry.match.result === 'pending');
      return firstPending?.key ?? visibleEntries[0]?.key ?? null;
    });
  }, [isOpen, visibleEntries]);

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setMatchFilter('all');
    setGroupFilter('all');
  }, [isOpen]);

  useEffect(() => () => {
    if (recordFlashTimer.current !== null) {
      window.clearTimeout(recordFlashTimer.current);
    }
  }, []);

  const moveSelection = (direction: -1 | 1) => {
    if (visibleEntries.length === 0) return;
    clearPendingAdvance();
    const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const next = (currentIndex + direction + visibleEntries.length) % visibleEntries.length;
    setSelectedKey(visibleEntries[next].key);
  };

  const clearPendingAdvance = () => {
    if (recordFlashTimer.current !== null) {
      window.clearTimeout(recordFlashTimer.current);
      recordFlashTimer.current = null;
    }
    setRecentlyRecordedKey(null);
  };

  const selectEntry = (key: string) => {
    clearPendingAdvance();
    setSelectedKey(key);
  };

  const jumpToNextPending = () => {
    const currentIndex = visibleEntries.findIndex(entry => entry.key === selectedEntry?.key);
    const nextPending = visibleEntries.find((entry, index) =>
      entry.match.result === 'pending' && index > currentIndex
    ) ?? visibleEntries.find(entry => entry.key !== selectedEntry?.key && entry.match.result === 'pending');
    if (nextPending) {
      clearPendingAdvance();
      setSelectedKey(nextPending.key);
    }
  };

  const playerName = (entry: QuickMatchEntry, id: string) => {
    if (id === 'bye') return isEnglish ? 'Bye' : '轮空';
    return entry.group.players.find(player => player.id === id)?.name
      ?? (isEnglish ? 'Unknown player' : '未知选手');
  };

  const applyResult = (
    result: MatchResult,
    player1Games?: number,
    player2Games?: number,
    preDrop?: boolean
  ) => {
    if (!selectedEntry || isReadOnly) return;
    updateMatchResultForGroup(
      selectedEntry.groupIndex,
      selectedEntry.match.id,
      result,
      player1Games,
      player2Games,
      preDrop
    );
    if (result !== 'pending') {
      setRecentlyRecordedKey(selectedEntry.key);
      if (recordFlashTimer.current !== null) {
        window.clearTimeout(recordFlashTimer.current);
      }
      recordFlashTimer.current = window.setTimeout(() => {
        const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
        const nextPending = visibleEntries.find((entry, index) =>
          index > currentIndex && entry.match.result === 'pending'
        ) ?? visibleEntries.find(entry =>
          entry.key !== selectedEntry.key && entry.match.result === 'pending'
        );
        if (nextPending) {
          setSelectedKey(nextPending.key);
        } else if (matchFilter === 'pending') {
          setMatchFilter('all');
        }
        setRecentlyRecordedKey(null);
        recordFlashTimer.current = null;
      }, AUTO_ADVANCE_DELAY_MS);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isReadOnly || !selectedEntry) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      const gameType = getRoundGameType(selectedEntry.group, selectedEntry.group.currentRound);
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
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        jumpToNextPending();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  if (!isOpen) return null;

  const selectedGameType = selectedEntry
    ? getRoundGameType(selectedEntry.group, selectedEntry.group.currentRound)
    : 'bo1';

  const matchResultLabel = (entry: QuickMatchEntry) => {
    if (entry.match.isBye) return isEnglish ? 'Bye' : '轮空';
    if (entry.match.result === 'player1') return isEnglish ? 'Left win' : '左胜';
    if (entry.match.result === 'player2') return isEnglish ? 'Right win' : '右胜';
    if (entry.match.result === 'draw') return isEnglish ? 'Double loss' : '双负';
    return isEnglish ? 'Pending' : '待录';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
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
                  ? `${activeGroupCount} groups · ${pendingCount} pending`
                  : `${activeGroupCount} 个小组 · 剩余 ${pendingCount} 场`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-700/50 px-4 py-3">
          {isReadOnly && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {isEnglish
                ? 'This tab is read-only because another tab is editing. Close the editing tab to enable score entry here.'
                : '当前标签页为只读，另一个标签页正在编辑。关闭编辑标签页后即可在此录分。'}
            </div>
          )}

          <div className="mb-3 flex flex-col gap-2 lg:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={isEnglish ? 'Search group, player, or match number...' : '搜索小组、选手或场次编号...'}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800/60 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold-500/40"
              />
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['all', isEnglish ? 'All' : '全部'],
                ['pending', isEnglish ? 'Pending' : '待录'],
                ['completed', isEnglish ? 'Completed' : '已完成'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMatchFilter(value)}
                  className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                    matchFilter === value
                      ? 'border-gold-500/40 bg-gold-500/15 text-gold-300'
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-700/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setGroupFilter('all')}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs ${
                groupFilter === 'all'
                  ? 'border-gold-500/40 bg-gold-500/15 text-gold-300'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-700/60'
              }`}
            >
              {isEnglish ? 'All groups' : '全部小组'}
            </button>
            {groupOptions.map(option => (
              <button
                key={option.groupIndex}
                type="button"
                onClick={() => setGroupFilter(option.groupIndex)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs ${
                  groupFilter === option.groupIndex
                    ? 'border-gold-500/40 bg-gold-500/15 text-gold-300'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-700/60'
                }`}
              >
                {option.name}
                <span className="ml-1 text-slate-500">{option.pending}</span>
              </button>
            ))}
          </div>

          <div className="flex items-start gap-2">
            <button
              onClick={() => moveSelection(-1)}
              disabled={visibleEntries.length <= 1}
              className="mt-1 rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="grid max-h-52 flex-1 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {visibleEntries.map(entry => {
                const { match } = entry;
                const isSelected = entry.key === selectedEntry?.key;
                const isCompleted = match.result !== 'pending';
                const player1Won = match.result === 'player1';
                const player2Won = match.result === 'player2';
                const isDraw = match.result === 'draw';
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => selectEntry(entry.key)}
                    aria-current={isSelected ? 'true' : undefined}
                    title={`${entry.group.name} #${entry.matchNumber} ${playerName(entry, match.player1Id)} vs ${playerName(entry, match.player2Id)}`}
                    aria-label={`${entry.group.name} #${entry.matchNumber} ${playerName(entry, match.player1Id)} vs ${playerName(entry, match.player2Id)}`}
                    className={`relative flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2 text-xs transition-all ${
                      isCompleted
                        ? 'border-emerald-500/25 bg-slate-800/60 text-slate-200'
                        : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700'
                    } ${isSelected ? 'border-yellow-400 bg-yellow-500/10 shadow-lg shadow-yellow-500/15 ring-2 ring-yellow-400/80' : ''} ${
                      recentlyRecordedKey === entry.key ? 'ring-2 ring-emerald-400/80 ring-offset-1 ring-offset-slate-900 animate-pulse' : ''
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-yellow-400" />
                    )}
                    <span className="flex shrink-0 flex-col items-start">
                      <span className="max-w-20 truncate rounded bg-slate-700/70 px-1.5 py-0.5 text-[9px] text-slate-300">
                        {entry.group.name}
                      </span>
                      <span className="mt-0.5 font-mono text-[10px] text-slate-500">#{entry.matchNumber}</span>
                      {isSelected && (
                        <span className="mt-0.5 rounded bg-yellow-400 px-1 py-0.5 text-[8px] font-bold text-indigo-950">
                          {isEnglish ? 'Current' : '当前'}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">
                      <span className={`rounded px-1 py-0.5 font-medium ${
                        player1Won
                          ? 'bg-yellow-500 text-white'
                          : isDraw
                            ? 'bg-orange-500/30 text-orange-200'
                            : isCompleted
                              ? 'bg-slate-700 text-slate-300'
                              : 'text-slate-200'
                      }`}>{playerName(entry, match.player1Id)}</span>
                      <span className="mx-1 text-slate-500">vs</span>
                      <span className={`rounded px-1 py-0.5 font-medium ${
                        player2Won
                          ? 'bg-yellow-500 text-white'
                          : isDraw
                            ? 'bg-orange-500/30 text-orange-200'
                            : isCompleted
                              ? 'bg-slate-700 text-slate-300'
                              : 'text-slate-200'
                      }`}>
                        {playerName(entry, match.player2Id)}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[9px] ${match.result === 'pending' ? 'text-slate-500' : match.result === 'draw' ? 'text-orange-300' : 'text-emerald-400'}`}>
                      {matchResultLabel(entry)}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => moveSelection(1)}
              disabled={visibleEntries.length <= 1}
              className="mt-1 rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {selectedEntry ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/35 px-3 py-2">
                <div className="text-xs text-slate-300">
                  <span className="font-semibold text-white">{selectedEntry.group.name}</span>
                  <span className="mx-2 text-slate-600">·</span>
                  {isEnglish ? `Match #${selectedEntry.matchNumber}` : `第 ${selectedEntry.matchNumber} 场`}
                </div>
                <span className="text-[10px] text-slate-500">
                  {isEnglish
                    ? `Round ${selectedEntry.group.currentRound}`
                    : `第${selectedEntry.group.currentRound}轮`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => applyResult('player1', winScore(selectedGameType), 0)}
                  disabled={isReadOnly}
                  className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selectedEntry.match.result === 'player1'
                      ? 'border-yellow-400 bg-yellow-500 text-white'
                      : selectedEntry.match.result === 'draw'
                        ? 'border-orange-500/40 bg-orange-500/25 text-orange-100'
                        : selectedEntry.match.result === 'player2'
                          ? 'border-slate-700 bg-slate-700 text-slate-300'
                          : 'border-emerald-500/25 bg-emerald-500/10 text-white hover:bg-emerald-500/20'
                  }`}
                >
                  <div className="text-[10px] opacity-75">{isEnglish ? 'Left player' : '左侧选手'}</div>
                  <div className="mt-1 truncate text-lg font-semibold">
                    {playerName(selectedEntry, selectedEntry.match.player1Id)}
                  </div>
                  <div className="mt-2 text-xs opacity-80">{isEnglish ? 'Press 1 to win' : '按 1 判胜'}</div>
                </button>
                <button
                  onClick={() => applyResult('player2', 0, winScore(selectedGameType))}
                  disabled={isReadOnly}
                  className={`rounded-xl border p-4 text-right transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selectedEntry.match.result === 'player2'
                      ? 'border-yellow-400 bg-yellow-500 text-white'
                      : selectedEntry.match.result === 'draw'
                        ? 'border-orange-500/40 bg-orange-500/25 text-orange-100'
                        : selectedEntry.match.result === 'player1'
                          ? 'border-slate-700 bg-slate-700 text-slate-300'
                          : 'border-emerald-500/25 bg-emerald-500/10 text-white hover:bg-emerald-500/20'
                  }`}
                >
                  <div className="text-[10px] opacity-75">{isEnglish ? 'Right player' : '右侧选手'}</div>
                  <div className="mt-1 truncate text-lg font-semibold">
                    {playerName(selectedEntry, selectedEntry.match.player2Id)}
                  </div>
                  <div className="mt-2 text-xs opacity-80">{isEnglish ? 'Press 2 to win' : '按 2 判胜'}</div>
                </button>
              </div>

              <div className={`rounded-xl border border-slate-700/60 bg-slate-800/35 p-4 ${
                isReadOnly ? 'pointer-events-none opacity-50' : ''
              }`}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    {isEnglish ? 'Detailed result' : '详细赛果'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {isEnglish ? 'D = double loss · arrow keys switch match' : 'D = 双负 · 方向键切换比赛'}
                  </span>
                </div>
                <ResultButtons
                  gameType={selectedGameType}
                  isEnglish={isEnglish}
                  playoff={!!selectedEntry.match.isPlayoff}
                  onResult={applyResult}
                />
              </div>

              {selectedEntry.match.result !== 'pending' && (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {isEnglish
                    ? 'Result recorded. This match stays selected; choose another match when ready.'
                    : '赛果已记录，当前比赛保持选中；可继续修改或手动选择其他比赛。'}
                </div>
              )}

              {visiblePendingCount > 0 && (
                <button
                  type="button"
                  onClick={jumpToNextPending}
                  className="w-full rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-300 hover:bg-sky-500/20"
                >
                  {isEnglish ? 'Jump to next pending match' : '跳到下一场待录比赛'}
                </button>
              )}
            </div>
          ) : matchEntries.length === 0 ? (
            <div className="py-16 text-center">
              <Swords className="mx-auto mb-3 h-10 w-10 text-slate-500" />
              <div className="text-base font-semibold text-white">
                {isEnglish ? 'No active rounds' : '暂无进行中的轮次'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {isEnglish ? 'Start at least one group before entering scores.' : '请先启动至少一个小组。'}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center">
              <Search className="mx-auto mb-3 h-10 w-10 text-slate-500" />
              <div className="text-base font-semibold text-white">
                {isEnglish ? 'No matching matches' : '没有匹配的比赛'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {isEnglish ? 'Adjust the group, search, or filter.' : '请调整小组、搜索条件或筛选范围。'}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-700/60 px-5 py-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Keyboard className="h-3.5 w-3.5" />
            {isEnglish
              ? '1 / 2 / D score · N next pending · ← → switch match'
              : '1 / 2 / D 录分 · N 下一场待录 · ← → 切换比赛'}
          </span>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            {isEnglish ? 'Close' : '关闭'}
          </button>
        </div>
      </div>
    </div>
  );
}
