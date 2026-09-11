import { X } from 'lucide-react';
import type { GameType } from '../../types';

interface ResultButtonsProps {
  gameType: GameType;
  isEnglish: boolean;
  playoff?: boolean;
  onResult: (
    result: 'player1' | 'player2' | 'draw' | 'pending',
    player1Games?: number,
    player2Games?: number,
    preDrop?: boolean
  ) => void;
}

export function ResultButtons({ gameType, onResult, playoff, isEnglish }: ResultButtonsProps) {
  if (playoff) {
    const target = gameType === 'bo7' ? 4 : gameType === 'bo5' ? 3 : gameType === 'bo3' ? 2 : 1;
    return (
      <div className="space-y-2">
        <p className="text-xs text-amber-200">
          {isEnglish
            ? 'Playoff must determine a winner; scores are recorded only for the playoff and do not affect regular standings.'
            : '加赛需决出胜者；比分仅记录加赛，不计入常规小分。'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: target }, (_, loss) => (
            <div key={loss} className="contents">
              <button className="py-2 rounded bg-emerald-500/20 text-emerald-200" onClick={() => onResult('player1', target, loss)}>
                {isEnglish ? `Left ${target}-${loss}` : `左侧 ${target}-${loss}`}
              </button>
              <button className="py-2 rounded bg-emerald-500/20 text-emerald-200" onClick={() => onResult('player2', loss, target)}>
                {isEnglish ? `Right ${loss}-${target}` : `右侧 ${loss}-${target}`}
              </button>
            </div>
          ))}
        </div>
        <button className="text-xs text-rose-300" onClick={() => onResult('pending')}>
          {isEnglish ? 'Reset playoff result' : '重置加赛结果'}
        </button>
      </div>
    );
  }

  if (gameType === 'bo1') {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => onResult('player1', 1, 0)} className="py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30">
            {isEnglish ? 'Left wins (1-0)' : '左侧胜 (1-0)'}
          </button>
          <button onClick={() => onResult('player2', 0, 1)} className="py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30">
            {isEnglish ? 'Right wins (0-1)' : '右侧胜 (0-1)'}
          </button>
          <button onClick={() => onResult('draw', 0, 0)} className="py-2 rounded-lg text-sm font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition-colors border border-orange-500/30">
            {isEnglish ? 'Draw (0-0)' : '双负 (0-0)'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-700/40">
          <PreDropButton
            isEnglish={isEnglish}
            side="right"
            onClick={() => onResult('player1', undefined, undefined, true)}
          />
          <button onClick={() => onResult('pending')} className="py-2 rounded-lg text-[11px] text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1 border border-slate-700/40">
            <X className="w-3 h-3" />{isEnglish ? 'Reset' : '重置'}
          </button>
          <PreDropButton
            isEnglish={isEnglish}
            side="left"
            onClick={() => onResult('player2', undefined, undefined, true)}
          />
        </div>
      </div>
    );
  }

  const winScore = gameType === 'bo7' ? 4 : gameType === 'bo5' ? 3 : 2;
  const options: Array<{ result: 'player1' | 'player2'; p1g: number; p2g: number; label: string }> = [];

  for (let loserGames = 0; loserGames < winScore; loserGames++) {
    options.push({
      result: 'player1',
      p1g: winScore,
      p2g: loserGames,
      label: isEnglish ? `Left ${winScore}-${loserGames}` : `左侧 ${winScore}-${loserGames}`,
    });
  }
  for (let loserGames = winScore - 1; loserGames >= 0; loserGames--) {
    options.push({
      result: 'player2',
      p1g: loserGames,
      p2g: winScore,
      label: isEnglish ? `Right ${winScore}-${loserGames}` : `右侧 ${winScore}-${loserGames}`,
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {options.map((option, index) => (
          <button
            key={index}
            onClick={() => onResult(option.result, option.p1g, option.p2g)}
            className="py-2 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30"
          >
            {option.label}
          </button>
        ))}
        <button onClick={() => onResult('draw', 0, 0)} className="py-2 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition-colors border border-orange-500/30">
          {isEnglish ? 'Draw (0-0)' : '双负 (0-0)'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-700/40">
        <PreDropButton
          isEnglish={isEnglish}
          side="right"
          onClick={() => onResult('player1', undefined, undefined, true)}
        />
        <button onClick={() => onResult('pending')} className="py-2 rounded-lg text-[11px] text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1 border border-slate-700/40">
          <X className="w-3 h-3" />{isEnglish ? 'Reset' : '重置'}
        </button>
        <PreDropButton
          isEnglish={isEnglish}
          side="left"
          onClick={() => onResult('player2', undefined, undefined, true)}
        />
      </div>
    </div>
  );
}

function PreDropButton({
  isEnglish,
  side,
  onClick,
}: {
  isEnglish: boolean;
  side: 'left' | 'right';
  onClick: () => void;
}) {
  const rightForfeits = side === 'right';
  const title = isEnglish
    ? `Pre-drop: the ${side}-side player forfeits before the match.`
    : `赛前弃赛：${side === 'right' ? '右' : '左'}侧选手未开赛即弃权。`;

  return (
    <button
      onClick={onClick}
      className="py-1.5 px-1.5 rounded-lg text-[10px] font-medium bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-colors border border-rose-500/30 leading-tight"
      title={title}
    >
      <span className="block text-[9px] text-rose-400/70 font-semibold tracking-wide mb-0.5">
        {isEnglish ? 'Pre-drop' : '赛前弃'}
      </span>
      <span className="block">
        {rightForfeits
          ? (isEnglish ? 'Right forfeits · left wins' : '右弃权·左胜')
          : (isEnglish ? 'Left forfeits · right wins' : '左弃权·右胜')}
      </span>
      <span className="block text-[8px] text-rose-400/60">
        {rightForfeits
          ? (isEnglish ? 'No loss for right' : '右不记败场')
          : (isEnglish ? 'No loss for left' : '左不记败场')}
      </span>
    </button>
  );
}
