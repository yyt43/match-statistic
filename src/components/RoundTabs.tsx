import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';

export function RoundTabs() {
  const currentGroup = useCurrentGroup();
  const { viewRound, setViewRound } = useTournamentStore();
  
  const rounds = [];
  for (let i = 1; i <= currentGroup.currentRound; i++) {
    rounds.push(i);
  }
  
  if (rounds.length === 0) return null;

  const canGoLeft = viewRound > 1;
  const canGoRight = viewRound < currentGroup.currentRound;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setViewRound(viewRound - 1)}
        disabled={!canGoLeft}
        className="p-1.5 rounded-lg btn-secondary disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      
      <div className="flex gap-1 overflow-x-auto max-w-md">
        {rounds.map(round => {
          const isActive = round === viewRound;
          const isCurrent = round === currentGroup.currentRound;
          const roundMatches = currentGroup.matches.filter(m => m.round === round);
          const isComplete = roundMatches.length > 0 && roundMatches.every(m => m.result !== 'pending');
          
          return (
            <button
              key={round}
              onClick={() => setViewRound(round)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                ${isActive
                  ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-indigo-900 shadow-lg shadow-gold-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300'
                }
              `}
            >
              第{round}轮
              {isCurrent && <span className="ml-1 text-xs">· 当前</span>}
              {isComplete && !isCurrent && <span className="ml-1 text-xs">✓</span>}
            </button>
          );
        })}
      </div>
      
      <button
        onClick={() => setViewRound(viewRound + 1)}
        disabled={!canGoRight}
        className="p-1.5 rounded-lg btn-secondary disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
