import type { Match, TournamentCompetition, TournamentGroup } from '../types';
import { calculateAllWinRates, getRankedPlayers } from './swissPairing';
import { createEliminationNextRoundMatches, getEliminationBracketRounds } from './elimination';
import { applyMatchResultToMap } from '../store/matchResultMutators';

export interface EliminationRepairReport {
  /** 被删除的场次数量（含重复与超出轮数的场次）。 */
  removed: number;
  /** 其中因同一签表节点重复而删除的数量。 */
  deduped: number;
  /** 其中因超出赛段轮数而删除的数量。 */
  trimmed: number;
  /** 发生修复的赛段数量。 */
  groups: number;
}

const EMPTY_REPORT: EliminationRepairReport = { removed: 0, deduped: 0, trimmed: 0, groups: 0 };

/** 解析 `rN-mX` 形式的签表节点；解析失败返回 null（保持原样，不当作损坏）。 */
function parseBracketNode(nodeId: string): { round: number; index: number } | null {
  const matched = /^r(\d+)-m(\d+)$/.exec(nodeId);
  if (!matched) return null;
  const round = Number(matched[1]);
  const index = Number(matched[2]);
  if (!Number.isInteger(round) || !Number.isInteger(index)) return null;
  return { round, index };
}

function maxReachableRounds(group: TournamentGroup): number {
  const bracket = group.eliminationBracket;
  if (!bracket) return 0;
  const bracketRounds = getEliminationBracketRounds(bracket.size);
  const configured = Number.isInteger(group.totalRounds) && group.totalRounds > 0
    ? group.totalRounds
    : bracketRounds;
  return Math.max(1, Math.min(bracketRounds, configured));
}

/**
 * 从第 1 轮开始重建后续轮次：后续轮次的选手必须来自上一轮的胜者。
 * 原数据里同签表节点、同双方选手的已录结果会被保留（比分、赛前退赛等），
 * 对不上的结果丢弃，留给裁判重新录入。
 */
function rebuildBracketMatches(
  group: TournamentGroup,
  kept: Match[],
  maxRounds: number
): Match[] {
  const firstRound = kept
    .filter((match): match is Match & { bracketNodeId: string } => (
      match.round === 1 && typeof match.bracketNodeId === 'string'
    ))
    .sort((left, right) => {
      const leftNode = parseBracketNode(left.bracketNodeId);
      const rightNode = parseBracketNode(right.bracketNodeId);
      return (leftNode?.index ?? 0) - (rightNode?.index ?? 0);
    });
  // 带签表节点的后续轮次一律由重建结果替代；只有没有节点的场次才原样保留。
  const others = kept.filter(match => typeof match.bracketNodeId !== 'string');
  if (firstRound.length === 0) return kept;

  const recorded = new Map<string, Match>();
  for (const match of group.matches) {
    if (!match.bracketNodeId || match.result === 'pending') continue;
    const existing = recorded.get(match.bracketNodeId);
    if (!existing || existing.result === 'pending') recorded.set(match.bracketNodeId, match);
  }

  const rebuilt: Match[] = [...firstRound];
  for (let round = 2; round <= maxRounds; round += 1) {
    const generated = createEliminationNextRoundMatches({ ...group, matches: rebuilt }, round);
    if (generated.length === 0) break;
    let hasPending = false;
    const nextRound = generated.map(match => {
      const stored = match.bracketNodeId ? recorded.get(match.bracketNodeId) : undefined;
      if (
        stored
        && stored.player1Id === match.player1Id
        && stored.player2Id === match.player2Id
      ) {
        return {
          ...match,
          result: stored.result,
          player1Games: stored.player1Games,
          player2Games: stored.player2Games,
          preDrop: stored.preDrop,
          resultSource: stored.resultSource,
          isBye: stored.isBye ?? match.isBye,
        };
      }
      if (match.result === 'pending') hasPending = true;
      return match;
    });
    rebuilt.push(...nextRound);
    if (hasPending) break;
  }
  return [...rebuilt, ...others];
}

/**
 * 修复单败淘汰赛段里损坏的对阵数据：
 * 1. 同一 `bracketNodeId` 出现多条时只保留一条，避免「轮空同时晋级」「同轮重复对阵」；
 * 2. 删除超出赛段轮数的场次（例如突围赛只打 1 轮却生成了第 2 轮），否则导出文件会校验失败；
 * 3. 回滚被删除场次对选手统计的影响，保证战绩、对手分等与保留下来的对阵一致。
 *
 * 只处理「单败淘汰 + 有签表」的赛段，瑞士轮与多阶段其它数据不受影响。
 */
export function repairCompetitionEliminationMatches(
  competition: TournamentCompetition
): { competition: TournamentCompetition; report: EliminationRepairReport } {
  let removed = 0;
  let deduped = 0;
  let trimmed = 0;
  let repairedGroups = 0;

  const groups = competition.groups.map(group => {
    if (!group.eliminationBracket || group.pairingType !== 'single_elimination') {
      return group;
    }
    const maxRounds = maxReachableRounds(group);
    const bracketSize = group.eliminationBracket.size;
    const kept: Match[] = [];
    const dropped: Match[] = [];
    const nodeIndex = new Map<string, number>();
    let groupDeduped = 0;
    let groupTrimmed = 0;

    for (const match of group.matches) {
      if (!match.bracketNodeId) {
        kept.push(match);
        continue;
      }
      if (match.round < 1 || match.round > maxRounds) {
        dropped.push(match);
        groupTrimmed += 1;
        continue;
      }
      const node = parseBracketNode(match.bracketNodeId);
      if (node) {
        const nodeCount = Math.max(1, bracketSize / 2 ** node.round);
        if (node.round !== match.round || node.index >= nodeCount) {
          dropped.push(match);
          groupTrimmed += 1;
          continue;
        }
      }
      const existingIndex = nodeIndex.get(match.bracketNodeId);
      if (existingIndex === undefined) {
        nodeIndex.set(match.bracketNodeId, kept.length);
        kept.push(match);
        continue;
      }
      const existing = kept[existingIndex];
      // 优先保留已录入结果的一条；两条都有结果时保留先出现的，另一条按重复处理。
      if (existing.result === 'pending' && match.result !== 'pending') {
        dropped.push(existing);
        kept[existingIndex] = match;
      } else {
        dropped.push(match);
      }
      groupDeduped += 1;
    }

    if (dropped.length === 0) return group;

    // 只删重复/越界场次还不够：后续轮次的选手必须来自上一轮胜者，
    // 否则会出现「已淘汰的选手又出现在下一轮」。这里按第 1 轮重建后续对阵。
    const matches = rebuildBracketMatches(group, kept, maxRounds);

    // 不能只回滚被删除的场次：损坏数据里重复场次可能只被计入过一次统计，
    // 直接相减会出现负的胜局数。这里把选手统计清零后按保留下来的场次重新累加。
    const playerMap = new Map(
      group.players.map(player => [
        player.id,
        {
          ...player,
          points: 0,
          wins: 0,
          losses: 0,
          totalGames: 0,
          wonGames: 0,
          playedAgainst: [],
          playoffWins: 0,
          eliminated: false,
          dropped: false,
        },
      ])
    );
    const orderedMatches = [...matches].sort((left, right) => left.round - right.round);
    for (const match of orderedMatches) {
      if (match.result === 'pending') continue;
      applyMatchResultToMap(
        playerMap,
        match,
        match.result,
        !!match.preDrop,
        true,
        match.player1Games,
        match.player2Games,
        group.gameType
      );
    }
    const players = getRankedPlayers(
      calculateAllWinRates(Array.from(playerMap.values()), matches, group.gameType),
      group.gameType,
      group.pairingType,
      group.tiebreakRules
    );

    removed += dropped.length;
    deduped += groupDeduped;
    trimmed += groupTrimmed;
    repairedGroups += 1;

    const highestRound = matches.reduce((max, match) => Math.max(max, match.round), 0);
    const currentRound = Math.min(Math.max(1, highestRound), maxRounds);
    const hasPending = matches.some(match => match.result === 'pending');
    const status = hasPending && group.status === 'completed' ? 'in_progress' : group.status;

    return { ...group, matches, players, currentRound, status };
  });

  if (repairedGroups === 0) {
    return { competition, report: EMPTY_REPORT };
  }
  return {
    competition: { ...competition, groups },
    report: { removed, deduped, trimmed, groups: repairedGroups },
  };
}

/**
 * 把「已经存在后续轮次，但 currentRound 还停在前面」的赛段修正为实际最高轮次。
 *
 * 早期版本在生成下一轮后没有同步 currentRound（或重复生成时被覆盖），
 * 会留下「下一轮对阵已经存在，但系统以为还没生成」的状态：
 * 界面会提示数据里已经存在下一轮，用户刷新也无法摆脱。
 * 这里按实际场次把 currentRound 推到最高轮次（不超过 totalRounds）。
 */
export function reconcileCompetitionRounds(
  competition: TournamentCompetition
): TournamentCompetition {
  let changed = false;
  const groups = competition.groups.map(group => {
    if (group.matches.length === 0) return group;
    const highestRound = group.matches.reduce((max, match) => Math.max(max, match.round), 0);
    const totalRounds = Math.max(1, group.totalRounds || highestRound);
    const targetRound = Math.min(highestRound, totalRounds);
    if (targetRound <= group.currentRound) return group;
    changed = true;
    return { ...group, currentRound: targetRound };
  });
  return changed ? { ...competition, groups } : competition;
}
