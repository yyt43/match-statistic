import { useTournamentStore } from '../store/useTournamentStore';
import { useLanguagePreference } from '../i18nContext';
import { formatText } from '../i18nData';

export function GroupTabs() {
  const { competition, setCurrentGroup } = useTournamentStore();
  const { t } = useLanguagePreference();

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      <span className="text-xs text-slate-500 mr-1">{t.groupSwitchLabel}</span>
      {competition.groups.map((group, index) => {
        const isActive = index === competition.currentGroupIndex;
        return (
          <button
            key={group.id}
            onClick={() => setCurrentGroup(index)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap
              ${isActive
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/50'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
              }
            `}
          >
            {group.name}
            {group.status === 'in_progress' && (
              <span className="ml-1 text-xs text-slate-500">
                {formatText(t.groupRoundStatus, { current: group.currentRound, total: group.totalRounds })}
              </span>
            )}
            {group.status === 'completed' && (
              <span className="ml-1 text-xs text-emerald-400">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
