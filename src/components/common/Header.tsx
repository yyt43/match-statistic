import { Trophy, Swords, Medal, Redo2, Undo2 } from 'lucide-react';
import { useTournamentStore, useCurrentGroup } from '../../store/useTournamentStore';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';

export function Header({ lastSavedAt }: { lastSavedAt?: string | null }) {
  const currentGroup = useCurrentGroup();
  const competition = useTournamentStore(state => state.competition);
  const canUndo = useTournamentStore(state => state.historyPast.length > 0);
  const canRedo = useTournamentStore(state => state.historyFuture.length > 0);
  const isReadOnly = useTournamentStore(state => state.isReadOnly);
  const undo = useTournamentStore(state => state.undo);
  const redo = useTournamentStore(state => state.redo);
  const { language, t } = useLanguagePreference();
  const isStarted = currentGroup.currentRound > 0;
  const isSetup = currentGroup.status === 'setup';
  const totalPlayers = competition.groups.reduce((sum, group) => sum + group.players.length, 0);
  const titleText = isStarted ? `${competition.name} - ${currentGroup.name}` : t.appName;
  const savedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString(language === 'en' ? 'en-US' : 'zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : null;

  const statusText = {
    setup: t.setup,
    in_progress: t.inProgress,
    completed: t.finished,
  }[currentGroup.status];

  const statusColor = {
    setup: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    in_progress: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    completed: 'bg-gold-500/20 text-gold-400 border-gold-500/30',
  }[currentGroup.status];

  return (
    <header className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/50 to-transparent" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-700/20 rounded-full blur-3xl" />
      
      <div className="relative px-4 py-5 sm:px-6 sm:py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-lg shadow-gold-500/30">
                  <Trophy className="w-7 h-7 text-indigo-900" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-indigo-900 flex items-center justify-center">
                  <Swords className="w-3 h-3 text-white" />
                </div>
              </div>
              
              <div>
                <h1 className="font-display text-xl font-bold gold-gradient tracking-wider sm:text-2xl md:text-3xl">
                  {titleText}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                    {statusText}
                  </span>
                  {currentGroup.currentRound > 0 && (
                    <span className="text-sm text-slate-400 flex items-center gap-1.5">
                      <Medal className="w-4 h-4 text-gold-400" />
                      {formatText(t.roundN, { round: `${currentGroup.currentRound} / ${currentGroup.totalRounds}` })}
                    </span>
                  )}
                  {savedTime && (
                    <span className="text-xs text-slate-500">
                      {formatText(t.lastSaved, { time: savedTime })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-4 md:justify-end">
              <div className="glass-panel flex items-center gap-1 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => { undo(); }}
                  disabled={!canUndo || isReadOnly}
                  className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-700/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  title={t.undoAction}
                  aria-label={t.undoAction}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { redo(); }}
                  disabled={!canRedo || isReadOnly}
                  className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-700/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  title={t.redoAction}
                  aria-label={t.redoAction}
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </div>
              <div className="glass-panel rounded-xl px-3 py-2 text-center sm:px-4 sm:py-2.5">
                <div className="text-xl font-bold font-mono text-gold-400 sm:text-2xl">
                  {currentGroup.players.length}
                </div>
                <div className="text-xs text-slate-400">{t.players}</div>
              </div>
              <div className="glass-panel rounded-xl px-3 py-2 text-center sm:px-4 sm:py-2.5">
                <div className="text-xl font-bold font-mono text-emerald-400 sm:text-2xl">
                  {isSetup
                    ? totalPlayers
                    : currentGroup.matches.filter(m => m.result !== 'pending').length}
                </div>
                <div className="text-xs text-slate-400">
                  {isSetup ? t.totalPlayersLabel : t.completedMatches}
                </div>
              </div>
              {isSetup && (
                <div className="glass-panel rounded-xl px-3 py-2 text-center sm:px-4 sm:py-2.5">
                  <div className="text-xl font-bold font-mono text-sky-400 sm:text-2xl">
                    {competition.groups.length}
                  </div>
                  <div className="text-xs text-slate-400">{t.groupCountLabel}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="h-px bg-gradient-to-r from-transparent via-gold-500/30 to-transparent" />
    </header>
  );
}
