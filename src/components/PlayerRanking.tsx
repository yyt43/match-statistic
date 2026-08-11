import { Trophy, Medal, Award, BarChart2 } from 'lucide-react';
import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';
import { useMemo } from 'react';
import { getEliminationTitle, getEliminatedRound, getPlayerMatchHistory } from '../utils/ranking';

export function PlayerRanking() {
  const currentGroup = useCurrentGroup();
  const { getRankedPlayers } = useTournamentStore();
  const isCompleted = currentGroup.status === 'completed';
  
  const rankedPlayers = useMemo(() => {
    return getRankedPlayers();
  }, [currentGroup.players, currentGroup.matches, currentGroup.gameType, currentGroup.pairingType]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return <Trophy className="w-5 h-5 text-yellow-400" />;
    }
    if (rank === 2) {
      return <Medal className="w-5 h-5 text-slate-300" />;
    }
    if (rank === 3) {
      return <Award className="w-5 h-5 text-amber-500" />;
    }
    return <span className="text-lg font-bold text-slate-400">{rank}</span>;
  };

  const getResultBlock = (result: 'win' | 'loss' | 'draw' | 'bye') => {
    if (result === 'win') {
      return (
        <div className="w-4 h-4 rounded bg-red-500 flex items-center justify-center text-[9px] font-bold text-white leading-none">
          胜
        </div>
      );
    }
    if (result === 'loss') {
      return (
        <div className="w-4 h-4 rounded bg-black border border-slate-600 flex items-center justify-center text-[9px] font-bold text-white leading-none">
          负
        </div>
      );
    }
    if (result === 'draw') {
      return (
        <div className="w-4 h-4 rounded bg-orange-500 flex items-center justify-center text-[9px] font-bold text-white leading-none">
          双
        </div>
      );
    }
    return (
      <div className="w-4 h-4 rounded bg-amber-500 flex items-center justify-center text-[9px] font-bold text-white leading-none">
        轮
      </div>
    );
  };

  if (currentGroup.currentRound === 0) {
    return (
      <div className="glass-panel rounded-2xl p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-gold-400" />
            排行榜
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <BarChart2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm">比赛尚未开始</p>
            <p className="text-xs mt-1">开始比赛后将显示排名</p>
          </div>
        </div>
      </div>
    );
  }

  const isMultiGame = currentGroup.gameType !== 'bo1';
  const isSingleElimination = currentGroup.pairingType === 'single_elimination';

  return (
    <div className="glass-panel rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-gold-400" />
          排行榜
        </h2>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>{rankedPlayers.filter(p => !p.dropped && !(isCompleted && isSingleElimination && p.eliminated)).length} 人参赛</span>
          {!(isCompleted && isSingleElimination) && rankedPlayers.some(p => p.eliminated) && (
            <span className="text-slate-400">{rankedPlayers.filter(p => p.eliminated).length} 淘汰</span>
          )}
          {rankedPlayers.some(p => p.dropped) && (
            <span className="text-rose-400">{rankedPlayers.filter(p => p.dropped).length} 弃赛</span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="bg-slate-800/40 rounded-lg mb-1.5">
          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-medium text-slate-500 leading-5">
          <div className="col-span-1">排名</div>
          {isSingleElimination ? (
            <>
              <div className="col-span-4">选手名称</div>
              <div className="col-span-2 text-center">头衔</div>
              <div className="col-span-2 text-center">战绩</div>
              <div className="col-span-3 text-center">淘汰轮次</div>
            </>
          ) : isMultiGame ? (
            <>
              <div className="col-span-2">选手名称</div>
              <div className="col-span-1 text-center">战绩</div>
              <div className="col-span-2 text-center">对手胜率</div>
              <div className="col-span-1 text-center">局胜率</div>
              <div className="col-span-1 text-center">对手局胜率</div>
              <div className="col-span-4 text-center">比赛历史</div>
            </>
          ) : (
            <>
              <div className="col-span-3">选手名称</div>
              <div className="col-span-1 text-center">战绩</div>
              <div className="col-span-2 text-center">对手胜率</div>
              <div className="col-span-2 text-center">对手对手胜率</div>
              <div className="col-span-3 text-center">比赛历史</div>
            </>
          )}
        </div>
        </div>

        <div className="space-y-1">
          {rankedPlayers.map((player, index) => {
            const rank = index + 1;
            const history = getPlayerMatchHistory(player.id, currentGroup.matches, currentGroup.totalRounds);

            return (
              <div
                key={player.id}
                className={`
                  grid grid-cols-12 gap-2 px-3 py-2 rounded-md items-center transition-all
                  ${rank <= 3 ? 'bg-slate-800/40' : 'bg-slate-800/20'}
                  ${rank === 1 ? 'border-l-2 border-yellow-400' : ''}
                  ${player.dropped
                    ? 'opacity-60'
                    : (player.eliminated && !(isCompleted && isSingleElimination))
                      ? 'opacity-60'
                      : ''}
                  hover:bg-slate-800/50
                `}
              >
                <div className="col-span-1 flex items-center">
                  {getRankBadge(rank)}
                </div>

                <div className={`${isSingleElimination ? 'col-span-4' : isMultiGame ? 'col-span-2' : 'col-span-3'} min-w-0 flex items-center`}>
                  <div className="flex items-center gap-1.5 w-full">
                    <span className={`font-medium text-sm truncate ${
                      rank === 1
                        ? 'text-yellow-400'
                        : player.dropped
                          ? 'text-rose-400'
                          : (isCompleted && isSingleElimination)
                            ? 'text-white'
                            : player.eliminated
                              ? 'text-slate-400'
                              : 'text-white'
                    } ${player.dropped ? 'line-through' : ''}`}>
                      {player.name}
                    </span>
                    {player.eliminated && !(isCompleted && isSingleElimination) && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-600/30 text-slate-300 border border-slate-500/30">
                        淘汰
                      </span>
                    )}
                    {player.dropped && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        弃赛
                      </span>
                    )}
                  </div>
                </div>

                {isSingleElimination ? (
                  <>
                    <div className="col-span-2 flex items-center justify-center">
                      <span className={`text-sm font-bold ${
                        rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : 'text-amber-500'
                      }`}>
                        {getEliminationTitle(rank, currentGroup.totalRounds)}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      <span className="font-mono font-bold text-sm text-white">
                        {player.wins}-{player.losses}
                      </span>
                    </div>
                    <div className="col-span-3 flex items-center justify-center">
                      {getEliminatedRound(player.id, currentGroup.matches) !== null ? (
                        <span className="text-sm text-slate-300">
                          第{getEliminatedRound(player.id, currentGroup.matches)}轮
                        </span>
                      ) : rank === 1 ? (
                        <span className="text-sm text-yellow-400">冠军</span>
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </div>
                  </>
                ) : isMultiGame ? (
                  <>
                    <div className="col-span-1 flex items-center justify-center">
                      <span className="font-mono font-bold text-sm text-white">
                        {player.wins}-{player.losses}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      <span className="text-sm text-slate-300 font-mono">
                        {(player.opponentWinRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      <span className="text-sm text-slate-300 font-mono">
                        {(player.gameWinRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      <span className="text-sm text-slate-300 font-mono">
                        {(player.opponentGameWinRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="col-span-4 flex gap-1 justify-center flex-nowrap min-w-0 items-center">
                      {history.length > 0 ? (
                        history.map((h, i) => (
                          <div key={i} className="shrink-0">{getResultBlock(h.result)}</div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">无结果</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-1 flex items-center justify-center">
                      <span className="font-mono font-bold text-sm text-white">
                        {player.wins}-{player.losses}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      <span className="text-sm text-slate-300 font-mono">
                        {(player.opponentWinRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      <span className="text-sm text-slate-300 font-mono">
                        {(player.opponentOpponentWinRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="col-span-3 flex gap-1 justify-center flex-nowrap min-w-0 items-center">
                      {history.length > 0 ? (
                        history.map((h, i) => (
                          <div key={i} className="shrink-0">{getResultBlock(h.result)}</div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">无结果</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-slate-700/40">
        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500"></div>
            <span>胜</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-black border border-slate-600"></div>
            <span>负</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-orange-500"></div>
            <span>双负</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500"></div>
            <span>轮空</span>
          </div>
        </div>
        <div className="text-center text-[10px] text-slate-600 mt-1.5">
          {isSingleElimination
            ? '排名依据：未被淘汰轮次 → 胜场数 → 败场数 → 姓名'
            : `排名依据：胜率 → 对手胜率 ${isMultiGame ? '→ 局胜率 → 对手局胜率' : '→ 对手对手胜率'}`}
        </div>
      </div>
    </div>
  );
}
