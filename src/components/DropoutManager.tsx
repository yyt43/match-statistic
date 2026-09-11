import { ChevronDown, ChevronUp, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { useLanguagePreference } from '../i18nContext';
import { useCurrentGroup, useTournamentStore } from '../store/useTournamentStore';
import { collectPreDroppedPlayerIds } from '../store/competitionState';

export function DropoutManager() {
  const currentGroup = useCurrentGroup();
  const { language, t } = useLanguagePreference();
  const { togglePlayerDropped } = useTournamentStore();
  const [expanded, setExpanded] = useState(false);
  const isEnglish = language === 'en';

  if (currentGroup.status !== 'in_progress') return null;

  const preDroppedIds = collectPreDroppedPlayerIds(currentGroup.matches);
  const droppedCount = currentGroup.players.filter(player => player.dropped).length;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
      >
        <span className="flex items-center gap-2">
          <UserX className="w-3.5 h-3.5" />
          {isEnglish ? 'Dropout management' : '弃赛管理'}
          <span className="text-slate-500">
            ({droppedCount}{isEnglish ? ' players dropped' : '人已退赛'})
          </span>
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="max-h-28 overflow-y-auto space-y-1">
            {currentGroup.players.filter(player => !player.dropped && !player.eliminated).map(player => {
              const isPreDropped = preDroppedIds.has(player.id);
              return (
                <div key={player.id} className="flex items-center justify-between gap-2 px-2.5 py-1 bg-slate-800/30 rounded-md">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-xs text-slate-300 truncate">{player.name}</span>
                    {isPreDropped && (
                      <span className="shrink-0 text-[8px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-full px-1.5 py-0.5 whitespace-nowrap" title={t.preDropTitle}>
                        {t.preDropTag}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => togglePlayerDropped(player.id)}
                    className={
                      'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors shrink-0 '
                      + (isPreDropped
                        ? 'text-slate-400 hover:bg-amber-500/10 hover:text-amber-400/80 border border-amber-500/20 bg-amber-500/5'
                        : 'text-rose-400 hover:bg-rose-500/10')
                    }
                    title={isPreDropped ? t.confirmDropTitle : t.postDropTitle}
                  >
                    <UserX className="w-2.5 h-2.5" />
                    {isPreDropped ? t.confirmDropTag : t.postDropTag}
                  </button>
                </div>
              );
            })}
          </div>

          {currentGroup.players.some(player => player.eliminated) && (
            <div className="space-y-1">
              <h4 className="text-[10px] text-slate-500">{t.eliminatedSection}</h4>
              <div className="max-h-16 overflow-y-auto space-y-1">
                {currentGroup.players.filter(player => player.eliminated).map(player => (
                  <div key={player.id} className="flex items-center justify-between px-2.5 py-1 bg-slate-700/20 rounded-md">
                    <span className="text-xs text-slate-500">{player.name}</span>
                    <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-600/20 border border-slate-500/20">
                      {t.eliminatedMarkSimple}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentGroup.players.some(player => player.dropped) && (
            <div className="space-y-1">
              <h4 className="text-[10px] text-slate-500">{t.droppedSection}</h4>
              <div className="max-h-16 overflow-y-auto space-y-1">
                {currentGroup.players.filter(player => player.dropped).map(player => (
                  <div key={player.id} className="flex items-center justify-between px-2.5 py-1 bg-rose-500/5 rounded-md">
                    <span className="text-xs text-rose-400/70 line-through">{player.name}</span>
                    <button
                      onClick={() => togglePlayerDropped(player.id)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                      title={t.restoreTitle}
                    >
                      <UserCheck className="w-2.5 h-2.5" />
                      {t.restore}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[9px] leading-relaxed text-slate-500 bg-slate-800/40 border border-slate-700/40 rounded px-2 py-1.5 space-y-1">
            <p>{t.preDropExplanation}</p>
            <p>{t.postDropExplanation}</p>
            <p>{t.dropBothExplanation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
