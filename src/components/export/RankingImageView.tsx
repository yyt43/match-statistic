import { useCurrentGroup } from '../../store/useTournamentStore';
import { useMemo, useState, useEffect } from 'react';
import { getEliminationTitleI18n, getEliminatedRound, getPlayerMatchHistory } from '../../utils/ranking';
import { getRankedPlayers } from '../../utils/swissPairing';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';

export function RankingImageView() {
  const currentGroup = useCurrentGroup();
  const { t, language } = useLanguagePreference();

  const rankedPlayers = useMemo(() => {
    return getRankedPlayers(
      currentGroup.players,
      currentGroup.gameType,
      currentGroup.pairingType,
      currentGroup.tiebreakRules
    );
  }, [
    currentGroup.players,
    currentGroup.gameType,
    currentGroup.pairingType,
    currentGroup.tiebreakRules,
  ]);

  const isMultiGame = currentGroup.gameType !== 'bo1';
  const isSingleElimination = currentGroup.pairingType === 'single_elimination';
  const isCompleted = currentGroup.status === 'completed';

  if (currentGroup.currentRound === 0) {
    return (
      <div id="ranking-image" className="p-6 bg-slate-900 min-h-[400px]">
        <div className="text-center text-slate-500 py-20">{t.noRankingData}</div>
      </div>
    );
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
    textAlign: 'left',
    background: 'rgba(30, 41, 59, 0.8)',
    borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
    verticalAlign: 'middle',
  };
  const thCenter: React.CSSProperties = { ...thStyle, textAlign: 'center' };

  const tdBase: React.CSSProperties = {
    padding: '12px',
    fontSize: '14px',
    verticalAlign: 'middle',
    lineHeight: '24px',
  };
  const tdCenter: React.CSSProperties = { ...tdBase, textAlign: 'center' };

  let colWidths: string[];
  if (isSingleElimination) {
    colWidths = ['8%', '32%', '17%', '17%', '26%'];
  } else if (isMultiGame) {
    colWidths = ['8%', '17%', '8%', '17%', '8%', '8%', '34%'];
  } else {
    colWidths = ['8%', '25%', '8%', '17%', '17%', '25%'];
  }

  return (
    <div id="ranking-image" className="p-6 bg-slate-900" style={{ width: 1280 }}>
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-3 bg-slate-700/50 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">{formatText(t.rankingImageTitle, { group: currentGroup.name })}</h2>
          <p className="text-xs text-slate-400 mt-1">
            {formatText(t.rankingImageMeta, {
              rounds: currentGroup.totalRounds,
              players: rankedPlayers.length,
              format: isSingleElimination ? t.singleElimination : t.swiss,
              gameType: currentGroup.gameType.toUpperCase(),
            })}
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: colWidths[0] }}>{t.rankCol}</th>
              <th style={{ ...thStyle, width: colWidths[1] }}>{t.playerCol}</th>
              {isSingleElimination ? (
                <>
                  <th style={{ ...thCenter, width: colWidths[2] }}>{t.titleCol}</th>
                  <th style={{ ...thCenter, width: colWidths[3] }}>{t.recordCol}</th>
                  <th style={{ ...thCenter, width: colWidths[4] }}>{t.eliminatedRoundCol}</th>
                </>
              ) : isMultiGame ? (
                <>
                  <th style={{ ...thCenter, width: colWidths[2] }}>{t.recordCol}</th>
                  <th style={{ ...thCenter, width: colWidths[3] }}>{t.oppWinRateCol}</th>
                  <th style={{ ...thCenter, width: colWidths[4] }}>{t.gameWinRateCol}</th>
                  <th style={{ ...thCenter, width: colWidths[5] }}>{t.oppGameWinRateCol}</th>
                  <th style={{ ...thCenter, width: colWidths[6] }}>{t.historyCol}</th>
                </>
              ) : (
                <>
                  <th style={{ ...thCenter, width: colWidths[2] }}>{t.recordCol}</th>
                  <th style={{ ...thCenter, width: colWidths[3] }}>{t.oppWinRateCol}</th>
                  <th style={{ ...thCenter, width: colWidths[4] }}>{t.oppOppWinRateCol}</th>
                  <th style={{ ...thCenter, width: colWidths[5] }}>{t.historyCol}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rankedPlayers.map((player, index) => {
              const rank = index + 1;
              const history = getPlayerMatchHistory(player.id, currentGroup.matches, currentGroup.totalRounds);
              const bgColor = index % 2 === 0 ? 'rgba(30, 41, 59, 0.4)' : 'rgba(30, 41, 59, 0.7)';
              const rankColor = rank === 1 ? '#facc15' : '#cbd5e1';
              const eliminatedRound = getEliminatedRound(player.id, currentGroup.matches);
              const nameColor = rank === 1
                ? '#facc15'
                : player.dropped
                  ? '#fb7185'
                  : (isCompleted && isSingleElimination)
                    ? '#fff'
                    : player.eliminated
                      ? '#94a3b8'
                      : '#fff';

              return (
                <tr key={player.id} style={{ background: bgColor }}>
                  <td style={{ ...tdBase, color: rankColor, fontWeight: 700 }}>{rank}</td>
                  <td style={{ ...tdBase, color: nameColor, fontWeight: 500 }}>
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                      maxWidth: '100%',
                      verticalAlign: 'middle',
                      lineHeight: '28px',
                      paddingBottom: '4px',
                      textDecoration: player.dropped ? 'line-through' : 'none',
                    }}>
                      {player.name}
                      {player.eliminated && !(isCompleted && isSingleElimination) && (
                        <span style={{
                          display: 'inline-block',
                          marginLeft: '6px',
                          padding: '1px 5px',
                          fontSize: '10px',
                          borderRadius: '3px',
                          background: 'rgba(71, 85, 105, 0.3)',
                          color: '#cbd5e1',
                          border: '1px solid rgba(71, 85, 105, 0.5)',
                          verticalAlign: 'middle',
                          lineHeight: '14px',
                        }}>
                          {t.eliminatedMarkImage}
                        </span>
                      )}
                      {player.dropped && (
                        <span style={{
                          display: 'inline-block',
                          marginLeft: '6px',
                          padding: '1px 5px',
                          fontSize: '10px',
                          borderRadius: '3px',
                          background: 'rgba(244, 63, 94, 0.2)',
                          color: '#fb7185',
                          border: '1px solid rgba(244, 63, 94, 0.3)',
                          verticalAlign: 'middle',
                          lineHeight: '14px',
                        }}>
                          {t.droppedMarkImage}
                        </span>
                      )}
                    </span>
                  </td>

                  {isSingleElimination ? (
                    <>
                      <td style={tdCenter}>
                        <span style={{
                          fontWeight: 700,
                          color: rank === 1 ? '#facc15' : rank === 2 ? '#cbd5e1' : '#f59e0b',
                        }}>
                          {getEliminationTitleI18n(rank, currentGroup.totalRounds, language)}
                        </span>
                      </td>
                      <td style={{ ...tdCenter, fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>
                        {player.wins}-{player.losses}
                      </td>
                      <td style={tdCenter}>
                        {eliminatedRound !== null ? (
                          <span style={{ color: '#cbd5e1' }}>{formatText(t.eliminatedRound, { round: eliminatedRound })}</span>
                        ) : rank === 1 ? (
                          <span style={{ color: '#facc15' }}>{t.champion}</span>
                        ) : (
                          <span style={{ color: '#64748b' }}>-</span>
                        )}
                      </td>
                    </>
                  ) : isMultiGame ? (
                    <>
                      <td style={{ ...tdCenter, fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>
                        {player.wins}-{player.losses}
                      </td>
                      <td style={{ ...tdCenter, color: '#cbd5e1', fontFamily: 'monospace' }}>{(player.opponentWinRate * 100).toFixed(2)}%</td>
                      <td style={{ ...tdCenter, color: '#cbd5e1', fontFamily: 'monospace' }}>{(player.gameWinRate * 100).toFixed(2)}%</td>
                      <td style={{ ...tdCenter, color: '#cbd5e1', fontFamily: 'monospace' }}>{(player.opponentGameWinRate * 100).toFixed(2)}%</td>
                      <td style={tdCenter}>
                        {history.length > 0 ? (
                          <HistoryBadges history={history} />
                        ) : (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{t.noResult}</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ ...tdCenter, fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>
                        {player.wins}-{player.losses}
                      </td>
                      <td style={{ ...tdCenter, color: '#cbd5e1', fontFamily: 'monospace' }}>{(player.opponentWinRate * 100).toFixed(2)}%</td>
                      <td style={{ ...tdCenter, color: '#cbd5e1', fontFamily: 'monospace' }}>{(player.opponentOpponentWinRate * 100).toFixed(2)}%</td>
                      <td style={tdCenter}>
                        {history.length > 0 ? (
                          <HistoryBadges history={history} />
                        ) : (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{t.noResult}</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        marginTop: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        fontSize: '12px',
        color: '#94a3b8',
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: 'rgba(100, 116, 139, 0.75)',
          letterSpacing: '0.5px',
          fontFamily: '"PingFang SC", "Microsoft YaHei", -apple-system, sans-serif',
          whiteSpace: 'nowrap',
          width: '165px',
          flexShrink: 0,
        }}>
          <span style={{
            display: 'inline-block',
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'rgba(251, 191, 36, 0.7)',
          }} />
          {t.appName}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '24px', margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-flex', width: '14px', height: '14px', borderRadius: '3px', background: '#ef4444', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700 }}>{t.winCell}</span>{t.winLegend}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-flex', width: '14px', height: '14px', borderRadius: '3px', background: '#000', border: '1px solid #475569', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700 }}>{t.lossCell}</span>{t.lossLegend}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-flex', width: '14px', height: '14px', borderRadius: '3px', background: '#f97316', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700 }}>{t.drawCell}</span>{t.drawLegend}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-flex', width: '14px', height: '14px', borderRadius: '3px', background: '#f59e0b', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700 }}>{t.byeCell}</span>{t.byeLegend}
          </span>
          <span style={{ marginLeft: '12px', color: '#64748b' }}>
            {isSingleElimination
              ? t.rankingCriterionElim
              : isMultiGame
                ? t.rankingCriterionSwissMulti
                : t.rankingCriterionSwissBO1}
          </span>
        </span>
        <span style={{ width: '165px', flexShrink: 0 }} />
      </div>
    </div>
  );
}

function HistoryBadges({ history }: { history: { result: 'win' | 'loss' | 'draw' | 'bye' }[] }) {
  const { t } = useLanguagePreference();
  const [dataUrl, setDataUrl] = useState('');
  const labels = useMemo(() => ({
    win: t.winCell,
    loss: t.lossCell,
    draw: t.drawCell,
    bye: t.byeCell,
  }), [t]);

  useEffect(() => {
    const size = 20;
    const gap = 3;
    const count = history.length;
    const totalW = count * size + (count - 1) * gap;
    const canvas = document.createElement('canvas');
    canvas.width = totalW * 2;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, totalW, size);
    history.forEach((h, i) => {
      const x = i * (size + gap);
      const y = 0;
      let bg = '#ef4444';
      let text: string = labels.win;
      let borderColor: string | null = null;
      if (h.result === 'win') { bg = '#ef4444'; text = labels.win; }
      else if (h.result === 'loss') { bg = '#000'; text = labels.loss; borderColor = '#475569'; }
      else if (h.result === 'draw') { bg = '#f97316'; text = labels.draw; }
      else { bg = '#f59e0b'; text = labels.bye; }
      const radius = 3;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + size - radius, y);
      ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
      ctx.lineTo(x + size, y + size - radius);
      ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
      ctx.lineTo(x + radius, y + size);
      ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fillStyle = bg;
      ctx.fill();
      if (borderColor) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + size / 2, y + size / 2 + 0.5);
    });
    setDataUrl(canvas.toDataURL('image/png'));
  }, [history, labels]);

  const count = history.length;
  const totalW = count * 20 + (count - 1) * 3;
  return (
    <span style={{
      display: 'inline-block',
      width: `${totalW}px`,
      height: '20px',
      verticalAlign: 'middle',
      marginTop: '2px',
    }}>
      {dataUrl && (
        <img
          src={dataUrl}
          alt=""
          style={{
            display: 'block',
            width: `${totalW}px`,
            height: '20px',
          }}
        />
      )}
    </span>
  );
}
