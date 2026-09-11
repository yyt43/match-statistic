import { Trophy, Medal, Award, BarChart2 } from 'lucide-react';
import { useCurrentGroup } from '../../store/useTournamentStore';
import { useMemo } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { getEliminationTitleI18n, getEliminatedRound, getPlayerMatchHistory } from '../../utils/ranking';
import { getRankedPlayers, detectTieGroups } from '../../utils/swissPairing';

export function PlayerRanking() {
  const currentGroup = useCurrentGroup();
  const { language, t } = useLanguagePreference();
  const isEnglish = language === 'en';
  const isCompleted = currentGroup.status === 'completed';

  const rankedPlayers = useMemo(() => {
    return getRankedPlayers(currentGroup.players, currentGroup.gameType, currentGroup.pairingType);
  }, [currentGroup.players, currentGroup.gameType, currentGroup.pairingType]);

  // 检测平分选手（仅比赛完成且瑞士轮时）
  const tieGroups = useMemo(() => {
    if (!isCompleted || currentGroup.pairingType !== 'swiss') return [];
    return detectTieGroups(currentGroup.players, currentGroup.gameType);
  }, [isCompleted, currentGroup.pairingType, currentGroup.players, currentGroup.gameType]);

  const tiedPlayerIds = useMemo(() => {
    return new Set(tieGroups.flat().map(p => p.id));
  }, [tieGroups]);

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
    return <span className="text-base font-bold text-slate-400 font-mono">{rank}</span>;
  };

  const getResultBlock = (result: 'win' | 'loss' | 'draw' | 'bye') => {
    if (result === 'win') {
      return (
        <div className="w-4 h-4 rounded bg-red-500 flex items-center justify-center text-[9px] font-bold text-white leading-none">
          W
        </div>
      );
    }
    if (result === 'loss') {
      return (
        <div className="w-4 h-4 rounded bg-black border border-slate-600 flex items-center justify-center text-[9px] font-bold text-white leading-none">
          L
        </div>
      );
    }
    if (result === 'draw') {
      return (
        <div className="w-4 h-4 rounded bg-orange-500 flex items-center justify-center text-[9px] font-bold text-white leading-none">
          D
        </div>
      );
    }
    return (
      <div className="w-4 h-4 rounded bg-amber-500 flex items-center justify-center text-[9px] font-bold text-white leading-none">
        B
      </div>
    );
  };

  if (currentGroup.currentRound === 0) {
    return (
      <div className="glass-panel rounded-2xl p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-gold-400" />
            {isEnglish ? 'Leaderboard' : '排行榜'}
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <BarChart2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm">{isEnglish ? 'Tournament has not started yet' : '比赛尚未开始'}</p>
            <p className="text-xs mt-1">{isEnglish ? 'The ranking will appear once matches begin.' : '开始比赛后将显示排名'}</p>
          </div>
        </div>
      </div>
    );
  }

  const isMultiGame = currentGroup.gameType !== 'bo1';
  const isSingleElimination = currentGroup.pairingType === 'single_elimination';

  return (
    <div className="glass-panel rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-gold-400" />
          {isEnglish ? 'Leaderboard' : '排行榜'}
        </h2>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>{rankedPlayers.filter(p => !p.dropped && !(isCompleted && isSingleElimination && p.eliminated)).length} {isEnglish ? 'players' : '人参赛'}</span>
          {!(isCompleted && isSingleElimination) && rankedPlayers.some(p => p.eliminated) && (
            <span className="text-slate-400">{rankedPlayers.filter(p => p.eliminated).length} {isEnglish ? 'eliminated' : '淘汰'}</span>
          )}
          {rankedPlayers.some(p => p.dropped) && (
            <span className="text-rose-400">{rankedPlayers.filter(p => p.dropped).length} {isEnglish ? 'dropped' : '弃赛'}</span>
          )}
          {tiedPlayerIds.size > 0 && (
            <span className="text-amber-400" title={isEnglish ? `${tiedPlayerIds.size} players have identical tiebreak stats and need a playoff to decide placement.` : `${tiedPlayerIds.size} 名选手所有破分指标完全相同，需加赛区分名次`}>
              {tiedPlayerIds.size} {isEnglish ? 'need playoff' : '人需加赛'}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
        {isSingleElimination ? (
          /* ============ Single-elimination table layout ============ */
          <div>
            <div className="grid grid-cols-12 gap-1.5 px-2 py-1.5 text-[10px] font-medium text-slate-500 border-b border-slate-700/40">
              <div className="col-span-1">#</div>
              <div className="col-span-5">{isEnglish ? 'Player' : '选手'}</div>
              <div className="col-span-2 text-center">{isEnglish ? 'Title' : '头衔'}</div>
              <div className="col-span-2 text-center">{isEnglish ? 'Record' : '战绩'}</div>
              <div className="col-span-2 text-center">{isEnglish ? 'Elim. round' : '淘汰轮'}</div>
            </div>
            <div className="space-y-0.5 mt-1">
              {rankedPlayers.map((player, index) => {
                const rank = index + 1;
                return (
                  <div
                    key={player.id}
                    className={`grid grid-cols-12 gap-1.5 px-2 py-1.5 rounded-md items-center transition-all
                      ${rank <= 3 ? 'bg-slate-800/40' : 'bg-slate-800/20'}
                      ${rank === 1 ? 'border-l-2 border-yellow-400' : ''}
                      ${player.dropped
                        ? 'opacity-60'
                        : (player.eliminated && !(isCompleted && isSingleElimination))
                          ? 'opacity-60'
                          : ''}
                      hover:bg-slate-800/50`}
                  >
                    <div className="col-span-1 flex items-center">{getRankBadge(rank)}</div>
                    <div className="col-span-5 min-w-0 flex items-center gap-1.5">
                      <span className={`font-medium text-sm truncate ${
                        rank === 1 ? 'text-yellow-400'
                          : player.dropped ? 'text-rose-400'
                          : (isCompleted && isSingleElimination) ? 'text-white'
                          : player.eliminated ? 'text-slate-400'
                          : 'text-white'
                      } ${player.dropped ? 'line-through' : ''}`}>
                        {player.name}
                      </span>
                      {player.eliminated && !(isCompleted && isSingleElimination) && (
                        <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-slate-600/30 text-slate-300 border border-slate-500/30">
                          {isEnglish ? 'Eliminated' : '淘汰'}
                        </span>
                      )}
                      {player.dropped && (
                        <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          {isEnglish ? 'Dropped' : '弃赛'}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      <span className={`text-xs font-bold ${
                        rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : 'text-amber-500'
                      }`}>
                        {getEliminationTitleI18n(rank, currentGroup.totalRounds, language)}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      <span className="font-mono font-bold text-sm text-white">
                        {player.wins}-{player.losses}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      {getEliminatedRound(player.id, currentGroup.matches) !== null ? (
                        <span className="text-xs text-slate-300">{isEnglish ? `Round ${getEliminatedRound(player.id, currentGroup.matches)}` : `第${getEliminatedRound(player.id, currentGroup.matches)}轮`}</span>
                      ) : rank === 1 ? (
                        <span className="text-xs text-yellow-400">{isEnglish ? 'Champion' : '冠军'}</span>
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ============ 瑞士轮：卡片式布局（解决拥挤）============ */
          <div className="space-y-1">
            {rankedPlayers.map((player, index) => {
              const rank = index + 1;
              const history = getPlayerMatchHistory(player.id, currentGroup.matches, currentGroup.totalRounds);
              const isDead = player.dropped || (player.eliminated && !isCompleted);

              return (
                <div
                  key={player.id}
                  className={`rounded-md px-2 py-1.5 transition-all
                    ${rank <= 3 ? 'bg-slate-800/40' : 'bg-slate-800/20'}
                    ${rank === 1 ? 'border-l-2 border-yellow-400' : ''}
                    ${isDead ? 'opacity-60' : ''}
                    hover:bg-slate-800/50`}
                >
                  {/* 第一行：排名 + 选手名 + 战绩 + 比赛历史 */}
                  <div className="flex items-center gap-2">
                    <span className="w-6 shrink-0 flex items-center justify-center">
                      {getRankBadge(rank)}
                    </span>
                    <span className={`flex-1 min-w-0 font-medium text-sm truncate ${
                      rank === 1 ? 'text-yellow-400'
                        : player.dropped ? 'text-rose-400'
                        : player.eliminated ? 'text-slate-400'
                        : 'text-white'
                    } ${player.dropped ? 'line-through' : ''}`}>
                      {player.name}
                    </span>
                    {player.eliminated && !isCompleted && (
                      <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-slate-600/30 text-slate-300 border border-slate-500/30">
                        {isEnglish ? 'Eliminated' : '淘汰'}
                      </span>
                    )}
                    {player.dropped && (
                      <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        {isEnglish ? 'Dropped' : '弃赛'}
                      </span>
                    )}
                    {tiedPlayerIds.has(player.id) && (
                      <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30" title={isEnglish ? 'All tiebreak stats are identical; a playoff is needed to decide placement.' : '所有破分指标完全相同，需加赛区分名次'}>
                        {isEnglish ? 'Playoff' : '需加赛'}
                      </span>
                    )}
                    {(player.playoffWins || 0) > 0 && (
                      <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" title={isEnglish ? 'Playoff wins (not counted toward regular scores, only used to separate rankings).' : '加赛胜场（不计入常规小分，仅用于区分名次）'}>
                        {isEnglish ? `Playoff ${player.playoffWins}W` : `加赛${player.playoffWins}胜`}
                      </span>
                    )}
                    <span className="shrink-0 font-mono font-bold text-xs text-white">
                      {player.wins}-{player.losses}
                    </span>
                    <div className="shrink-0 flex gap-1 items-center min-w-0">
                      {history.length > 0 ? (
                        history.map((h, i) => (
                          <div key={i} className="shrink-0">{getResultBlock(h.result)}</div>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500">{t.none}</span>
                      )}
                    </div>
                  </div>
                  {/* 第二行：百分比数据（紧凑展示，避免遮挡） */}
                  <div className="flex items-center gap-2 pl-8 mt-0.5 text-[10px] text-slate-400 font-mono">
                    <span title={isEnglish ? 'Opponent win rate' : '对手胜率'}>{isEnglish ? 'Opp. W' : '对胜'} <span className="text-slate-300">{(player.opponentWinRate * 100).toFixed(1)}%</span></span>
                    {isMultiGame ? (
                      <>
                        <span className="text-slate-700">·</span>
                        <span title={isEnglish ? 'Game win rate' : '局胜率'}>{isEnglish ? 'Game W' : '局胜'} <span className="text-slate-300">{(player.gameWinRate * 100).toFixed(1)}%</span></span>
                        <span className="text-slate-700">·</span>
                        <span title={isEnglish ? 'Opponent game win rate' : '对手局胜率'}>{isEnglish ? 'Opp. Game W' : '对局胜'} <span className="text-slate-300">{(player.opponentGameWinRate * 100).toFixed(1)}%</span></span>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-700">·</span>
                        <span title={isEnglish ? 'Opponents-of-opponents win rate' : '对手对手胜率'}>{isEnglish ? 'Opp. opp. W' : '对对胜'} <span className="text-slate-300">{(player.opponentOpponentWinRate * 100).toFixed(1)}%</span></span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-700/40 shrink-0">
        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500"></div>
            <span>{isEnglish ? 'Win' : '胜'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-black border border-slate-600"></div>
            <span>{isEnglish ? 'Loss' : '负'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-orange-500"></div>
            <span>{isEnglish ? 'Draw' : '双负'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500"></div>
            <span>{isEnglish ? 'Bye' : '轮空'}</span>
          </div>
        </div>
        <div className="text-center text-[10px] text-slate-600 mt-1.5">
          {isSingleElimination
            ? (isEnglish ? 'Ranking criteria: remaining rounds → wins → losses → name' : '排名依据：未被淘汰轮次 → 胜场数 → 败场数 → 姓名')
            : (isEnglish ? `Ranking criteria: wins → opponent win rate ${isMultiGame ? '→ personal game win rate → opponent game win rate' : '→ opponents-of-opponents win rate'}` : `排名依据：胜场数 → 对手胜率 ${isMultiGame ? '→ 本人局胜率 → 对手局胜率' : '→ 对手对手胜率'}`)}
        </div>
      </div>
    </div>
  );
}
