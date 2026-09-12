import type { GameType, TiebreakRule, TiebreakTemplate } from '../types';

export const TIEBREAK_RULES: TiebreakRule[] = [
  'opponentWinRate',
  'opponentOpponentWinRate',
  'gameWinRate',
  'opponentGameWinRate',
  'points',
  'playoffWins',
];

const STANDARD_BO1_RULES: TiebreakRule[] = [
  'opponentWinRate',
  'opponentOpponentWinRate',
  'points',
  'playoffWins',
];

const STANDARD_MULTI_RULES: TiebreakRule[] = [
  'opponentWinRate',
  'gameWinRate',
  'opponentGameWinRate',
  'points',
  'playoffWins',
];

export function getDefaultTiebreakTemplate(gameType: GameType): TiebreakTemplate {
  return gameType === 'bo1' ? 'standard_bo1' : 'standard_multi';
}

export function getDefaultTiebreakRules(gameType: GameType): TiebreakRule[] {
  return [...(gameType === 'bo1' ? STANDARD_BO1_RULES : STANDARD_MULTI_RULES)];
}

export function normalizeTiebreakRules(
  rules: TiebreakRule[] | undefined,
  gameType: GameType
): TiebreakRule[] {
  if (!Array.isArray(rules)) return getDefaultTiebreakRules(gameType);
  const normalized: TiebreakRule[] = [];
  for (const rule of rules) {
    if (TIEBREAK_RULES.includes(rule) && !normalized.includes(rule)) {
      normalized.push(rule);
    }
  }
  return normalized.length > 0 ? normalized : getDefaultTiebreakRules(gameType);
}

export function resolveTiebreakRules(input: {
  gameType: GameType;
  tiebreakRules?: TiebreakRule[];
}): TiebreakRule[] {
  return normalizeTiebreakRules(input.tiebreakRules, input.gameType);
}
