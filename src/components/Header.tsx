import { Trophy, Swords, Medal } from 'lucide-react';
import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';

export function Header() {
  const currentGroup = useCurrentGroup();
  const competition = useTournamentStore(state => state.competition);
  // 比赛开始前显示网站标题，开始后显示赛事名称 - 小组名称（同一行）
  const isStarted = currentGroup.currentRound > 0;
  const titleText = isStarted ? `${competition.name} - ${currentGroup.name}` : '诗意 · 比赛战绩统计系统';
  
  const statusText = {
    setup: '准备阶段',
    in_progress: '进行中',
    completed: '已结束',
  }[currentGroup.status];
  
  const statusColor = {
    setup: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    in_progress: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    completed: 'bg-gold-500/20 text-gold-400 border-gold-500/30',
  }[currentGroup.status];

  return (
    <header className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/50 to-transparent" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-700/20 rounded-full blur-3xl" />
      
      <div className="relative px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-lg shadow-gold-500/30">
                  <Trophy className="w-7 h-7 text-indigo-900" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-indigo-900 flex items-center justify-center">
                  <Swords className="w-3 h-3 text-white" />
                </div>
              </div>
              
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold gold-gradient tracking-wider">
                  {titleText}
                </h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                    {statusText}
                  </span>
                  {currentGroup.currentRound > 0 && (
                    <span className="text-sm text-slate-400 flex items-center gap-1.5">
                      <Medal className="w-4 h-4 text-gold-400" />
                      第 {currentGroup.currentRound} / {currentGroup.totalRounds} 轮
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="glass-panel rounded-xl px-4 py-2.5 text-center">
                <div className="text-2xl font-bold font-mono text-gold-400">
                  {currentGroup.players.length}
                </div>
                <div className="text-xs text-slate-400">参赛选手</div>
              </div>
              <div className="glass-panel rounded-xl px-4 py-2.5 text-center">
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {currentGroup.matches.filter(m => m.result !== 'pending').length}
                </div>
                <div className="text-xs text-slate-400">已完赛场次</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="h-px bg-gradient-to-r from-transparent via-gold-500/30 to-transparent" />
    </header>
  );
}
