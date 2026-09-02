import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';
import type { Match } from '../types';

export function MatchImageView() {
  const currentGroup = useCurrentGroup();
  const { viewRound } = useTournamentStore();

  const matches = currentGroup.matches.filter(m => m.round === viewRound);
  const playerMap = new Map(currentGroup.players.map(p => [p.id, p]));
  const isMultiGame = currentGroup.gameType !== 'bo1';
  const isSingleElimination = currentGroup.pairingType === 'single_elimination';
  const roundGameType = currentGroup.roundGameTypes?.[viewRound - 1] ?? currentGroup.gameType;

  const getPlayerName = (id: string) => {
    if (id === 'bye') return '轮空';
    return playerMap.get(id)?.name || '未知选手';
  };

  const getScore = (match: Match, playerNum: 1 | 2) => {
    if (match.result === 'pending') return '-';
    if (match.isBye) {
      return playerNum === 1 ? String(match.player1Games ?? 1) : '0';
    }
    if (match.result === 'draw') return '0';
    if (isMultiGame && match.player1Games !== undefined && match.player2Games !== undefined) {
      return playerNum === 1 ? String(match.player1Games) : String(match.player2Games);
    }
    if (match.result === 'player1') return playerNum === 1 ? '1' : '0';
    if (match.result === 'player2') return playerNum === 2 ? '1' : '0';
    return '0';
  };

  const isWinner = (match: Match, playerNum: 1 | 2) => {
    if (match.result === 'pending' || match.isBye) return playerNum === 1 && match.isBye;
    return (match.result === 'player1' && playerNum === 1) || (match.result === 'player2' && playerNum === 2);
  };

  if (currentGroup.currentRound === 0) {
    return (
      <div id="match-image" className="p-6 bg-slate-900 min-h-[400px]">
        <div className="text-center text-slate-500 py-20">暂无对阵数据</div>
      </div>
    );
  }

  return (
    <div id="match-image" className="p-6 bg-slate-900" style={{ width: 1280 }}>
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-3 bg-slate-700/50 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{currentGroup.name} - 第 {viewRound} 轮对阵表</h2>
            <p className="text-xs text-slate-400 mt-1">共 {matches.length} 场对阵</p>
          </div>
          <div className="px-3 py-1 bg-orange-500 rounded text-xs font-bold text-white">
            第 {viewRound} 轮
          </div>
        </div>

        <div className="p-4 grid grid-cols-4 gap-3">
          {matches.map((match) => (
            <div key={match.id} className="bg-slate-800/60 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-700/30 text-[11px] text-slate-400 text-right">
                {isSingleElimination ? `单败淘汰 ${roundGameType.toUpperCase()}` : roundGameType.toUpperCase()}
              </div>

              <div className="flex items-stretch">
                <div className="flex-1 p-3 flex items-center min-w-0">
                  <span className="text-sm font-medium text-white truncate min-w-0" style={{ lineHeight: '28px', paddingBottom: '4px' }}>
                    {getPlayerName(match.player1Id)}
                  </span>
                </div>
                <div className={`
                  ${isMultiGame ? 'w-16' : 'w-12'} flex items-center justify-center text-xl font-bold text-white leading-none shrink-0
                  ${isWinner(match, 1) ? 'bg-orange-500' : 'bg-slate-700'}
                `}>
                  {getScore(match, 1)}
                </div>
              </div>

              <div className="flex items-stretch">
                <div className="flex-1 p-3 flex items-center min-w-0">
                  <span className="text-sm font-medium text-white truncate min-w-0" style={{ lineHeight: '28px', paddingBottom: '4px' }}>
                    {getPlayerName(match.player2Id)}
                  </span>
                </div>
                <div className={`
                  ${isMultiGame ? 'w-16' : 'w-12'} flex items-center justify-center text-xl font-bold text-white leading-none shrink-0
                  ${isWinner(match, 2) ? 'bg-orange-500' : 'bg-slate-700'}
                `}>
                  {getScore(match, 2)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 水印与场次信息（同一行，与网格底部对齐，上移紧贴网格） */}
        <div style={{
          padding: '0 16px 12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '12px',
          color: '#94a3b8',
        }}>
          {/* 网站标题水印（左对齐，不收缩） */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'rgba(100, 116, 139, 0.75)',
            letterSpacing: '0.5px',
            fontFamily: '"PingFang SC", "Microsoft YaHei", -apple-system, sans-serif',
            whiteSpace: 'nowrap',
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
          <span style={{ flex: 1 }} />
          <span style={{ color: '#64748b' }}>
            共 {matches.length} 场 · {isSingleElimination ? '单败淘汰' : '瑞士轮'} · {roundGameType.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
