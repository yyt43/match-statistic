import { Trophy } from 'lucide-react';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import { buildFinalStandings } from '../../utils/advancement';

/** 淘汰赛最终名次：冠军、亚军、四强、八强……按档位展示。 */
export function FinalStandingsPanel() {
  const competition = useTournamentStore(state => state.competition);
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const standings = buildFinalStandings(competition);
  if (standings.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-gold-500/25 bg-gold-500/5 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-gold-400">
        <Trophy className="h-3.5 w-3.5" />
        {isEnglish ? 'Final standings' : '最终名次'}
      </div>
      <ul className="space-y-1.5">
        {standings.map(entry => (
          <li key={entry.place} className="flex items-start gap-2 text-[11px]">
            <span className="w-10 shrink-0 text-right font-mono text-[10px] text-slate-500">
              {entry.place}
            </span>
            <span className="min-w-0 flex-1 text-slate-300">
              {entry.players
                .map(player => `${player.participantCode ? `${player.participantCode} ` : ''}${player.name}`)
                .join(isEnglish ? ', ' : '、')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
