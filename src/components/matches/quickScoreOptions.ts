import type { GameType } from '../../types';

export interface QuickScoreOption {
  result: 'player1' | 'player2';
  player1Games: number;
  player2Games: number;
  shortcut: string;
}

export function buildQuickScoreOptions(gameType: GameType): QuickScoreOption[] {
  const target = gameType === 'bo7' ? 4 : gameType === 'bo5' ? 3 : gameType === 'bo3' ? 2 : 1;
  const options: QuickScoreOption[] = [];
  let shortcut = 1;

  for (let loserGames = 0; loserGames < target; loserGames += 1) {
    options.push({
      result: 'player1',
      player1Games: target,
      player2Games: loserGames,
      shortcut: String(shortcut++),
    });
    options.push({
      result: 'player2',
      player1Games: loserGames,
      player2Games: target,
      shortcut: String(shortcut++),
    });
  }

  return options;
}
