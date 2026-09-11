import type { Match, Player } from '../types';
import type { AppLanguage } from '../i18n/data';

/**
 * 单败淘汰头衔：根据排名与总轮次计算。默认中文，保持向后兼容。
 * 推荐使用 getEliminationTitleI18n(rank, totalRounds, language)。
 */
export function getEliminationTitle(rank: number, totalRounds: number): string {
  return getEliminationTitleI18n(rank, totalRounds, 'zh');
}

/** 同上，但根据 language 返回本地化标题。 */
export function getEliminationTitleI18n(rank: number, totalRounds: number, language: AppLanguage): string {
  const isEn = language === 'en';
  if (rank === 1) return isEn ? 'Champion' : '冠军';
  if (rank === 2) return isEn ? 'Runner-up' : '亚军';
  const roundOfNamesZh: Record<number, string> = { 4: '四强', 8: '八强', 16: '十六强', 32: '三十二强', 64: '六十四强' };
  const roundOfNamesEn: Record<number, string> = { 4: 'Semi-finals', 8: 'Quarter-finals', 16: 'Round of 16', 32: 'Round of 32', 64: 'Round of 64' };
  let size = 4;
  let label = isEn ? 'Semi-finals' : '四强';
  for (let r = totalRounds - 1; r >= 1; r--) {
    if (rank <= size) return label;
    size *= 2;
    label = (isEn ? roundOfNamesEn : roundOfNamesZh)[size] || (isEn ? `Round of ${size}` : `${size}强`);
  }
  return label;
}

/**
 * 单败淘汰：获取选手被淘汰的轮次（无败绩则返回 null）。
 * 同时兼容传入 player 对象或 playerId 字符串两种调用方式。
 */
export function getEliminatedRound(playerOrId: Player | string, matches: Match[]): number | null {
  const playerId = typeof playerOrId === 'string' ? playerOrId : playerOrId.id;
  const lossMatch = matches
    .filter(m => !m.isBye && (m.result === 'player1' || m.result === 'player2'))
    .find(m => {
      if (m.player1Id === playerId) return m.result === 'player2';
      if (m.player2Id === playerId) return m.result === 'player1';
      return false;
    });
  if (lossMatch) return lossMatch.round;
  return null;
}

export type MatchHistoryResult = 'win' | 'loss' | 'draw' | 'bye';

/**
 * 获取选手在每一轮的比赛结果历史（结构化版，用于 PlayerRanking / RankingImageView）。
 * 仅返回有对阵的轮次，按轮次顺序排列。
 */
export function getPlayerMatchHistory(
  playerOrId: Player | string,
  matches: Match[],
  totalRounds: number
): { round: number; result: MatchHistoryResult }[] {
  const playerId = typeof playerOrId === 'string' ? playerOrId : playerOrId.id;
  const history: { round: number; result: MatchHistoryResult }[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const match = matches.find(
      m => m.round === round && (m.player1Id === playerId || m.player2Id === playerId)
    );
    if (!match) continue;
    if (match.isBye) {
      history.push({ round, result: 'bye' });
    } else if (match.result === 'player1') {
      history.push({ round, result: match.player1Id === playerId ? 'win' : 'loss' });
    } else if (match.result === 'player2') {
      history.push({ round, result: match.player2Id === playerId ? 'win' : 'loss' });
    } else if (match.result === 'draw') {
      history.push({ round, result: 'draw' });
    }
  }
  return history;
}

/**
 * 将选手比赛历史格式化为短文本（如 "胜-负-轮空-胜"），用于 Excel 导出。
 * 与原 excelExport.ts 中实现保持完全一致：按轮次排序、未对阵返回 "-"。
 */
export function formatPlayerMatchHistoryText(player: Player, matches: Match[]): string {
  const playerMatches = matches
    .filter(m => m.player1Id === player.id || m.player2Id === player.id)
    .sort((a, b) => a.round - b.round);

  if (playerMatches.length === 0) return '-';

  return playerMatches
    .map(m => {
      if (m.isBye) return '轮空';
      if (m.result === 'pending') return '待定';
      if (m.result === 'draw') return '双负';
      if (m.result === 'player1') {
        return m.player1Id === player.id ? '胜' : '负';
      }
      if (m.result === 'player2') {
        return m.player2Id === player.id ? '胜' : '负';
      }
      return '';
    })
    .join('-');
}
