import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import { buildFinalStandings } from '../../utils/advancement';

/** 图片导出的「最终名次」视图：淘汰赛冠军到八强等档位。 */
export function FinalStandingsImageView() {
  const competition = useTournamentStore(state => state.competition);
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const standings = buildFinalStandings(competition);

  return (
    <div
      id="standings-image"
      className="min-w-[420px] rounded-xl border border-slate-700/60 bg-slate-900 p-6"
    >
      <div className="mb-1 text-center text-base font-semibold text-white">
        {competition.name}
      </div>
      <div className="mb-5 text-center text-sm text-gold-400">
        {isEnglish ? 'Final standings' : '最终名次'}
      </div>

      {standings.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">
          {isEnglish ? 'No playoff results yet.' : '暂无淘汰赛结果。'}
        </div>
      ) : (
        <div className="space-y-2">
          {standings.map(entry => (
            <div
              key={entry.place}
              className="flex items-start gap-3 rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2"
            >
              <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-sm font-semibold text-gold-400">
                {entry.place}
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                {entry.players.map((player, index) => (
                  <span
                    key={`${player.participantCode ?? player.name}-${index}`}
                    className="block text-sm text-slate-200"
                  >
                    {player.participantCode && (
                      <span className="mr-1.5 font-mono text-xs text-slate-400">
                        {player.participantCode}
                      </span>
                    )}
                    {player.name}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
