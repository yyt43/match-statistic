import type { Match, MatchResult, PlayoffBracket, PlayoffFormat, TournamentGroup } from '../types';
import { detectTieGroups, generatePlayoffPairings, getRankedPlayers } from './swissPairing';

export type ThreePlayerFormats = Record<string, 'three_one' | 'three_two'>;
export const formatLabels: Record<PlayoffFormat, string> = {
  two: '两人决胜', three_one: '三进一', three_two: '三进二', four: '四人名次赛',
};
const decided = (m: Match) => m.result === 'player1' || m.result === 'player2';
const winner = (m: Match) => m.result === 'player1' ? m.player1Id : m.player2Id;
const loser = (m: Match) => m.result === 'player1' ? m.player2Id : m.player1Id;

export function getPlayoffOrder(bracket: PlayoffBracket, matches: Match[]): string[] | null {
  const own = matches.filter(m => m.playoffBracketId === bracket.id);
  const first = own.filter(m => m.playoffStage === 1);
  if (first.length !== (bracket.format === 'four' ? 2 : 1) || !first.every(decided)) return null;
  if (bracket.format === 'two') return [winner(first[0]), loser(first[0])];
  const final = own.find(m => m.playoffRole === 'final');
  if (!final || !decided(final)) return null;
  if (bracket.format === 'three_one') return [winner(final), loser(final), loser(first[0])];
  if (bracket.format === 'three_two') return [winner(first[0]), winner(final), loser(final)];
  const placement = own.find(m => m.playoffRole === 'placement');
  return placement && decided(placement)
    ? [winner(final), loser(final), winner(placement), loser(placement)] : null;
}

/** 加赛只派生自己的胜场和组内名次，绝不变更常规战绩与对手历史。 */
export function syncPlayoffs(group: TournamentGroup): TournamentGroup {
  if (!group.playoffBrackets?.length) return group;
  const players = group.players.map(p => ({ ...p }));
  for (const bracket of group.playoffBrackets) {
    const order = getPlayoffOrder(bracket, group.matches);
    for (const id of bracket.playerIds) {
      const p = players.find(p => p.id === id);
      if (!p) continue;
      p.playoffBracketId = bracket.id;
      p.playoffRank = order ? order.indexOf(id) + 1 : undefined;
      p.playoffWins = group.matches.filter(m => m.playoffBracketId === bracket.id && !m.isBye && decided(m) && winner(m) === id).length;
    }
  }
  return { ...group, players: getRankedPlayers(players, group.gameType, group.pairingType) };
}

/** 生成初轮或继续下一阶段。同分组各自独立；三人等候位不是获胜场次。 */
export function advancePlayoffs(group: TournamentGroup, formats: ThreePlayerFormats = {}): TournamentGroup {
  const regular = group.matches.filter(m => !m.isPlayoff);
  if (group.pairingType !== 'swiss' || group.currentRound < group.totalRounds ||
      regular.length === 0 || regular.some(m => m.result === 'pending')) {
    throw new Error('请先完成全部常规轮次，再生成加赛。');
  }
  if (!group.playoffBrackets?.length) {
    if (group.matches.some(m => m.isPlayoff)) throw new Error('这是旧版加赛记录。请先导出备份，再清除旧加赛并按新版规则重新生成。');
    const ties = detectTieGroups(group.players, group.gameType);
    if (ties.some(t => t.length > 4)) throw new Error('存在超过4人的同分组，手册未规定其赛程；请由裁判确认补充规则后处理。');
    if (!ties.length) return group;
    const ranked = getRankedPlayers(group.players.filter(p => !p.dropped && !p.eliminated), group.gameType, group.pairingType);
    const brackets: PlayoffBracket[] = [];
    const matches: Match[] = [];
    for (const tied of ties) {
      const startRank = ranked.findIndex(p => p.id === tied[0].id) + 1;
      const format: PlayoffFormat = tied.length === 2 ? 'two' : tied.length === 4 ? 'four' : formats[tied[0].id] ?? 'three_one';
      const id = `tie-${crypto.randomUUID()}`;
      const first = generatePlayoffPairings(tied, group.gameType).matches;
      const matched = new Set(first.flatMap(m => [m.player1Id, m.player2Id]));
      brackets.push({ id, playerIds: tied.map(p => p.id), startRank, format,
        waitingPlayerId: tied.find(p => !matched.has(p.id))?.id });
      matches.push(...first.map(m => ({ ...m, playoffBracketId: id, playoffStage: 1 as const, playoffRole: 'opening' as const })));
    }
    return syncPlayoffs({ ...group, playoffBrackets: brackets, matches: [...group.matches, ...matches] });
  }
  const matches = [...group.matches];
  for (const bracket of group.playoffBrackets) {
    const own = matches.filter(m => m.playoffBracketId === bracket.id);
    if (bracket.format === 'two' || own.some(m => m.playoffStage === 2)) continue;
    const first = own.filter(m => m.playoffStage === 1);
    if (first.length !== (bracket.format === 'four' ? 2 : 1) || !first.every(decided)) continue;
    const add = (a: string, b: string, role: 'final' | 'placement') => matches.push({
      id: `playoff-${crypto.randomUUID()}`, round: 0, isPlayoff: true, result: 'pending',
      player1Id: a, player2Id: b, playoffBracketId: bracket.id, playoffStage: 2, playoffRole: role,
    });
    if (bracket.format === 'four') {
      add(winner(first[0]), winner(first[1]), 'final');
      add(loser(first[0]), loser(first[1]), 'placement');
    } else if (bracket.waitingPlayerId) {
      add(bracket.format === 'three_one' ? winner(first[0]) : loser(first[0]), bracket.waitingPlayerId, 'final');
    }
  }
  return syncPlayoffs({ ...group, matches });
}

export function recordPlayoffResult(group: TournamentGroup, matchId: string, result: MatchResult, p1g?: number, p2g?: number): TournamentGroup {
  const match = group.matches.find(m => m.id === matchId);
  if (!match?.playoffBracketId || !group.playoffBrackets?.some(b => b.id === match.playoffBracketId)) return group;
  if (result === 'draw') return group; // 决胜加赛必须产生胜者，不能用整场双负推进。
  const target = group.gameType === 'bo7' ? 4 : group.gameType === 'bo5' ? 3 : group.gameType === 'bo3' ? 2 : 1;
  if (result !== 'pending') {
    const win = result === 'player1' ? p1g : p2g;
    const loss = result === 'player1' ? p2g : p1g;
    if (win !== target || loss === undefined || !Number.isInteger(loss) || loss < 0 || loss >= target) return group;
  }
  // 改判首阶段胜者时，已依赖该胜者生成的第二阶段必须失效。
  let matches = group.matches;
  if (match.playoffStage === 1 && result !== match.result) {
    matches = matches.filter(m => m.playoffBracketId !== match.playoffBracketId || m.playoffStage !== 2);
  }
  matches = matches.map(m => m.id === matchId ? { ...m, result,
    player1Games: result === 'pending' ? undefined : p1g,
    player2Games: result === 'pending' ? undefined : p2g, preDrop: false } : m);
  return syncPlayoffs({ ...group, matches });
}

/** 显式重新抽签/撤回常规赛时，清理所有依赖的加赛，保留常规比分。 */
export function clearPlayoffs(group: TournamentGroup): TournamentGroup {
  const matches = group.matches.filter(m => !m.isPlayoff);
  return { ...group, matches, playoffBrackets: undefined, players: group.players.map(p => ({
    ...p, playoffWins: 0, playoffRank: undefined, playoffBracketId: undefined,
    playedAgainst: matches.filter(m => m.result !== 'pending' && !m.preDrop && (m.player1Id === p.id || m.player2Id === p.id))
      .map(m => m.isBye ? 'bye' : m.player1Id === p.id ? m.player2Id : m.player1Id),
  })) };
}
