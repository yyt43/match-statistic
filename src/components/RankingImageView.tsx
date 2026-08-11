import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';
import { useMemo, useState, useEffect } from 'react';
import { getEliminationTitle, getEliminatedRound, getPlayerMatchHistory } from '../utils/ranking';

export function RankingImageView() {
  const currentGroup = useCurrentGroup();
  const { getRankedPlayers } = useTournamentStore();

  const rankedPlayers = useMemo(() => {
    return getRankedPlayers();
  }, [currentGroup.players, currentGroup.matches, currentGroup.gameType, currentGroup.pairingType]);

  const isMultiGame = currentGroup.gameType !== 'bo1';
  const isSingleElimination = currentGroup.pairingType === 'single_elimination';
  const isCompleted = currentGroup.status === 'completed';

  const HistoryBadges = ({ history }: { history: { result: 'win' | 'loss' | 'draw' | 'bye' }[] }) => {
    const [dataUrl, setDataUrl] = useState('');
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
        let text = '胜';
        let borderColor: string | null = null;
        if (h.result === 'win') { bg = '#ef4444'; text = '胜'; }
        else if (h.result === 'loss') { bg = '#000'; text = '负'; borderColor = '#475569'; }
        else if (h.result === 'draw') { bg = '#f97316'; text = '双'; }
        else { bg = '#f59e0b'; text = '轮'; }
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
    }, [history]);
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
  };

  if (currentGroup.currentRound === 0) {
    return (
      <div id="ranking-image" className="p-6 bg-slate-900 min-h-[400px]">
        <div className="text-center text-slate-500 py-20">暂无排行榜数据</div>
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
        {/* 标题栏 */}
        <div className="px-6 py-3 bg-slate-700/50 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">{currentGroup.name} - 排行榜</h2>
          <p className="text-xs text-slate-400 mt-1">
            共 {currentGroup.totalRounds} 轮 · {rankedPlayers.length} 人参赛 · {isSingleElimination ? '单败淘汰 ' : ''}{currentGroup.gameType.toUpperCase()}
          </p>
        </div>

        {/* 表格 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: colWidths[0] }}>排名</th>
              <th style={{ ...thStyle, width: colWidths[1] }}>选手名称</th>
              {isSingleElimination ? (
                <>
                  <th style={{ ...thCenter, width: colWidths[2] }}>头衔</th>
                  <th style={{ ...thCenter, width: colWidths[3] }}>战绩</th>
                  <th style={{ ...thCenter, width: colWidths[4] }}>淘汰轮次</th>
                </>
              ) : isMultiGame ? (
                <>
                  <th style={{ ...thCenter, width: colWidths[2] }}>战绩</th>
                  <th style={{ ...thCenter, width: colWidths[3] }}>对手胜率</th>
                  <th style={{ ...thCenter, width: colWidths[4] }}>局胜率</th>
                  <th style={{ ...thCenter, width: colWidths[5] }}>对手局胜率</th>
                  <th style={{ ...thCenter, width: colWidths[6] }}>比赛历史</th>
                </>
              ) : (
                <>
                  <th style={{ ...thCenter, width: colWidths[2] }}>战绩</th>
                  <th style={{ ...thCenter, width: colWidths[3] }}>对手胜率</th>
                  <th style={{ ...thCenter, width: colWidths[4] }}>对手对手胜率</th>
                  <th style={{ ...thCenter, width: colWidths[5] }}>比赛历史</th>
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
                          淘汰
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
                          弃赛
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
                          {getEliminationTitle(rank, currentGroup.totalRounds)}
                        </span>
                      </td>
                      <td style={{ ...tdCenter, fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>
                        {player.wins}-{player.losses}
                      </td>
                      <td style={tdCenter}>
                        {getEliminatedRound(player.id, currentGroup.matches) !== null ? (
                          <span style={{ color: '#cbd5e1' }}>第{getEliminatedRound(player.id, currentGroup.matches)}轮</span>
                        ) : rank === 1 ? (
                          <span style={{ color: '#facc15' }}>冠军</span>
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
                          <span style={{ fontSize: '12px', color: '#64748b' }}>无结果</span>
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
                          <span style={{ fontSize: '12px', color: '#64748b' }}>无结果</span>
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

      {/* 水印 + 图例（同一行：水印靠左，图例居中） */}
      <div style={{
        marginTop: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        fontSize: '12px',
        color: '#94a3b8',
      }}>
        {/* 网站标题水印（左对齐，占固定区域，不影响图例居中） */}
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
          诗意 · 比赛战绩统计系统
        </span>
        {/* 图例（中间居中） */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '24px', margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', background: '#ef4444' }}></span>胜
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', background: '#000', border: '1px solid #475569' }}></span>负
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', background: '#f97316' }}></span>双负
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', background: '#f59e0b' }}></span>轮空
          </span>
          <span style={{ marginLeft: '12px', color: '#64748b' }}>
            {isSingleElimination
              ? '排名依据：未被淘汰轮次 → 胜场数 → 败场数 → 姓名'
              : `排名依据：胜率 → 对手胜率 ${isMultiGame ? '→ 局胜率 → 对手局胜率' : '→ 对手对手胜率'}`}
          </span>
        </span>
        {/* 等宽占位，保证图例完美居中 */}
        <span style={{ width: '165px', flexShrink: 0 }} />
      </div>
    </div>
  );
}
