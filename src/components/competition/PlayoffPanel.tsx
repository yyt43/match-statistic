import { useMemo, useState } from 'react';
import { useCurrentGroup, useTournamentStore } from '../../store/useTournamentStore';
import { detectTieGroups, getRankedPlayers } from '../../utils/swissPairing';
import { getPlayoffOrder, type ThreePlayerFormats } from '../../utils/playoffs';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';

export function PlayoffPanel() {
  const group = useCurrentGroup();
  const { language, t } = useLanguagePreference();
  const { generatePlayoff, resetPlayoffs, setViewRound } = useTournamentStore();
  const [formats, setFormats] = useState<ThreePlayerFormats>({});
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const ties = useMemo(() => detectTieGroups(group.players, group.gameType), [group.players, group.gameType]);
  const ranked = getRankedPlayers(
    group.players.filter(player => !player.dropped && !player.eliminated),
    group.gameType,
    group.pairingType
  );
  const name = (id: string) => group.players.find(player => player.id === id)?.name ?? id;
  const brackets = group.playoffBrackets ?? [];
  const hasMatches = group.matches.some(match => match.isPlayoff);
  const legacy = hasMatches && brackets.length === 0;
  const ready = brackets.some(bracket =>
    bracket.format !== 'two'
    && !group.matches.some(match => match.playoffBracketId === bracket.id && match.playoffStage === 2)
    && group.matches
      .filter(match => match.playoffBracketId === bracket.id && match.playoffStage === 1)
      .every(match => match.result === 'player1' || match.result === 'player2')
  );
  const defaultFormat = (id: string): 'three_one' | 'three_two' =>
    ranked.findIndex(player => player.id === id) === 2 ? 'three_two' : 'three_one';
  const nameSeparator = language === 'en' ? ', ' : '、';
  const orderSeparator = language === 'en' ? '; ' : '；';

  const advance = () => {
    setError('');
    try {
      const selected = Object.fromEntries(
        ties
          .filter(tie => tie.length === 3)
          .map(tie => [tie[0].id, formats[tie[0].id] ?? defaultFormat(tie[0].id)])
      );
      generatePlayoff(selected);
    } catch {
      setError(t.playoffGenerateFailed);
    }
  };

  const formatLabel = (format: 'two' | 'three_one' | 'three_two' | 'four') => {
    if (format === 'two') return t.playoffTwo;
    if (format === 'three_one') return t.playoffThreeOne;
    if (format === 'three_two') return t.playoffThreeTwo;
    return t.playoffFour;
  };

  return (
    <div className="mt-3 text-left border-t border-slate-700/50 pt-3 space-y-3" aria-label={t.playoffManagement}>
      <p className="text-sm font-semibold text-amber-300">
        {t.playoffManagement} · {group.gameType.toUpperCase()}
      </p>
      <p className="text-xs text-slate-400">{t.playoffDescription}</p>

      {!hasMatches && ties.map(tie => {
        const start = ranked.findIndex(player => player.id === tie[0].id) + 1;
        const end = start + tie.length - 1;
        return (
          <div key={tie[0].id} className="text-xs space-y-1.5">
            <p className="text-slate-200">
              {formatText(t.playoffRanks, {
                start,
                end,
                names: tie.map(player => player.name).join(nameSeparator),
              })}
            </p>
            {tie.length === 3 ? (
              <label className="block text-slate-400">
                {t.threePlayerFormat}
                <select
                  aria-label={formatText(t.threePlayerFormat, { start })}
                  value={formats[tie[0].id] ?? defaultFormat(tie[0].id)}
                  onChange={event => setFormats({
                    ...formats,
                    [tie[0].id]: event.target.value as 'three_one' | 'three_two',
                  })}
                  className="block w-full mt-1 rounded bg-slate-800 text-slate-100 p-2"
                >
                  <option value="three_one">{t.threeOneOption}</option>
                  <option value="three_two">{t.threeTwoOption}</option>
                </select>
              </label>
            ) : (
              <p className="text-slate-400">
                {tie.length === 2
                  ? t.twoPlayerDirect
                  : tie.length === 4
                    ? t.fourPlayerPlacement
                    : t.moreThanFourPlayers}
              </p>
            )}
          </div>
        );
      })}

      {!hasMatches && ties.length === 0 && (
        <p className="text-xs text-slate-400">{t.noPlayoffTies}</p>
      )}

      {brackets.map(bracket => {
        const order = getPlayoffOrder(bracket, group.matches);
        const stage2 = group.matches.some(match =>
          match.playoffBracketId === bracket.id && match.playoffStage === 2
        );
        return (
          <div key={bracket.id} className="text-xs space-y-1.5">
            <p className="text-slate-200">
              {formatText(t.playoffBracketRanks, {
                start: bracket.startRank,
                end: bracket.startRank + bracket.playerIds.length - 1,
                format: formatLabel(bracket.format),
              })}
            </p>
            <p className="text-slate-400">{bracket.playerIds.map(name).join(nameSeparator)}</p>
            {bracket.waitingPlayerId && !stage2 && !order && (
              <p className="text-amber-200">
                {formatText(t.waitingSecondStage, { name: name(bracket.waitingPlayerId) })}
              </p>
            )}
            {order ? (
              <p className="text-emerald-300">
                {formatText(t.decidedOrder, {
                  order: order.map((id, index) => formatText(t.rankPlacement, {
                    rank: bracket.startRank + index,
                    name: name(id),
                  })).join(orderSeparator),
                })}
              </p>
            ) : (
              <p className="text-amber-300">
                {stage2 ? t.secondStagePending : t.firstStageComplete}
              </p>
            )}
          </div>
        );
      })}

      {legacy && <p role="alert" className="text-xs text-amber-300">{t.legacyPlayoffWarning}</p>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {!legacy && (
          <button
            disabled={hasMatches ? !ready : ties.length === 0}
            onClick={advance}
            className="px-3 py-2 text-xs rounded bg-amber-500/20 text-amber-200 disabled:opacity-40"
          >
            {hasMatches ? t.generateNextPlayoffStage : t.drawPlayoff}
          </button>
        )}
        {hasMatches && (
          <button onClick={() => setViewRound(0)} className="px-3 py-2 text-xs rounded bg-slate-700 text-slate-200">
            {t.viewPlayoffMatches}
          </button>
        )}
        {hasMatches && (
          <button onClick={() => setResetOpen(true)} className="px-3 py-2 text-xs rounded text-rose-300 border border-rose-500/30">
            {t.clearPlayoff}
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          resetPlayoffs();
          setError('');
        }}
        title={t.clearPlayoff}
        message={t.clearPlayoffMessage}
      />
    </div>
  );
}
