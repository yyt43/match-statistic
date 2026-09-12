import { ArrowDown, ArrowUp, ListOrdered } from 'lucide-react';
import type { TiebreakRule, TiebreakTemplate } from '../../types';
import { useLanguagePreference } from '../../i18n/context';
import { TIEBREAK_RULES, getDefaultTiebreakRules, getDefaultTiebreakTemplate, normalizeTiebreakRules } from '../../utils/tiebreak';
import { useTournamentStore } from '../../store/useTournamentStore';

interface TiebreakSettingsProps {
  gameType: 'bo1' | 'bo3' | 'bo5' | 'bo7';
  template?: TiebreakTemplate;
  rules?: TiebreakRule[];
}

export function TiebreakSettings({ gameType, template, rules }: TiebreakSettingsProps) {
  const setTiebreakTemplate = useTournamentStore(state => state.setTiebreakTemplate);
  const { language, t } = useLanguagePreference();
  const activeTemplate = template ?? getDefaultTiebreakTemplate(gameType);
  const activeRules = normalizeTiebreakRules(rules, gameType);

  const ruleLabel: Record<TiebreakRule, string> = {
    opponentWinRate: t.tiebreakOppWinRate,
    opponentOpponentWinRate: t.tiebreakOppOppWinRate,
    gameWinRate: t.tiebreakGameWinRate,
    opponentGameWinRate: t.tiebreakOppGameWinRate,
    points: t.tiebreakPoints,
    playoffWins: t.tiebreakPlayoffWins,
  };

  const changeRule = (rule: TiebreakRule, enabled: boolean) => {
    const next = enabled
      ? [...activeRules, rule]
      : activeRules.filter(item => item !== rule);
    if (next.length === 0) return;
    setTiebreakTemplate('custom', next);
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= activeRules.length) return;
    const next = [...activeRules];
    [next[index], next[target]] = [next[target], next[index]];
    setTiebreakTemplate('custom', next);
  };

  const presets: Array<{ value: TiebreakTemplate; label: string }> = [
    { value: 'standard_bo1', label: t.tiebreakPresetBo1 },
    { value: 'standard_multi', label: t.tiebreakPresetMulti },
    { value: 'custom', label: t.tiebreakPresetCustom },
  ];

  return (
    <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
        <ListOrdered className="h-3.5 w-3.5 text-gold-400" />
        {t.tiebreakChain}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{t.tiebreakChainDescription}</p>

      <div className="grid grid-cols-3 gap-1.5">
        {presets.map(preset => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              setTiebreakTemplate(
                preset.value,
                preset.value === 'custom'
                  ? activeRules
                  : getDefaultTiebreakRules(preset.value === 'standard_bo1' ? 'bo1' : 'bo3')
              );
            }}
            className={`rounded-md px-2 py-1.5 text-[11px] transition-colors ${
              activeTemplate === preset.value
                ? 'border border-gold-500/30 bg-gold-500/15 text-gold-300'
                : 'border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:bg-slate-700/60'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {activeTemplate === 'custom' && (
        <div className="space-y-1">
          {TIEBREAK_RULES.map(rule => {
            const index = activeRules.indexOf(rule);
            const enabled = index >= 0;
            return (
              <div
                key={rule}
                className="flex items-center gap-2 rounded-md bg-slate-800/45 px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={event => changeRule(rule, event.target.checked)}
                  className="accent-gold-500"
                  aria-label={ruleLabel[rule]}
                />
                <span className="flex-1 text-xs text-slate-300">{ruleLabel[rule]}</span>
                <button
                  type="button"
                  onClick={() => moveRule(index, -1)}
                  disabled={!enabled || index <= 0}
                  className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-white disabled:opacity-20"
                  title={language === 'en' ? 'Move up' : '上移'}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveRule(index, 1)}
                  disabled={!enabled || index === activeRules.length - 1}
                  className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-white disabled:opacity-20"
                  title={language === 'en' ? 'Move down' : '下移'}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTemplate !== 'custom' && (
        <div className="flex flex-wrap gap-1.5">
          {activeRules.map((rule, index) => (
            <span
              key={rule}
              className="rounded-md border border-slate-700/50 bg-slate-800/60 px-2 py-1 text-[10px] text-slate-400"
            >
              {index + 1}. {ruleLabel[rule]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
