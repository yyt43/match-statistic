import type {
  Player,
  StageAdvancementPairing,
  StageAdvancementPreview,
  StageAdvancementRecord,
  StageAdvancementSeat,
  TournamentCompetition,
  TournamentGroup,
  TournamentStage,
} from '../types';
import { buildRankedGroup } from '../store/competitionState';
import { generateId } from '../store/tournamentFactory';
import { getOrderedStages, getStageGroups } from './multiStage';

function getRankedPlayers(group: TournamentGroup): Player[] {
  return buildRankedGroup(group).players;
}

function toSeat(
  player: Player,
  group: TournamentGroup,
  stage: TournamentStage,
  finalRank: number,
  route: StageAdvancementSeat['route'],
  origin?: { groupName: string; rank: number }
): StageAdvancementSeat {
  return {
    playerId: player.id,
    name: player.name,
    participantCode: player.participantCode,
    uid: player.profile?.uid,
    qq: player.profile?.qq,
    sourceStageId: stage.id,
    sourceGroupId: group.id,
    sourceGroupName: group.name,
    finalRank,
    route,
    originGroupName: origin?.groupName,
    originRank: origin?.rank,
  };
}

export function getDownstreamStages(
  competition: TournamentCompetition,
  stageId: string
): TournamentStage[] {
  return getOrderedStages(competition).filter(stage => stage.sourceStageIds?.includes(stageId));
}

/** 赛段是否已经打完：所有小组都已完成。 */
export function isStageComplete(
  competition: TournamentCompetition,
  stage: TournamentStage
): boolean {
  const groups = getStageGroups(competition, stage);
  return groups.length > 0 && groups.every(group => group.status === 'completed');
}

/** 上级赛段是否还没确认晋级，用于阻止下游提前开赛。 */
export function getUnconfirmedUpstreamStageIds(
  competition: TournamentCompetition,
  stageId: string
): string[] {
  const stage = getOrderedStages(competition).find(item => item.id === stageId);
  return (stage?.sourceStageIds ?? []).filter(
    sourceId => !findAdvancementRecord(competition, sourceId)
  );
}

/** 下游赛段是否已经开赛或录入赛果（只有名单不算）。 */
export function hasDownstreamResults(
  competition: TournamentCompetition,
  stage: TournamentStage
): boolean {
  return getDownstreamStages(competition, stage.id).some(target =>
    getStageGroups(competition, target).some(
      group =>
        group.currentRound > 0
        || group.matches.some(match => match.result !== 'pending')
    )
  );
}

/** 晋级已确认且下游已经开赛时，上游赛果不允许再改。 */
export function isStageResultLocked(
  competition: TournamentCompetition,
  stageId: string
): boolean {
  const stage = getOrderedStages(competition).find(item => item.id === stageId);
  if (!stage) return false;
  if (!findAdvancementRecord(competition, stage.id)) return false;
  return hasDownstreamResults(competition, stage);
}

export function findAdvancementRecord(
  competition: TournamentCompetition,
  sourceStageId: string
): StageAdvancementRecord | undefined {
  return (competition.stageAdvancements ?? []).find(
    record => record.sourceStageId === sourceStageId
  );
}

interface SeatCollection {
  seats: StageAdvancementSeat[];
  pairings: StageAdvancementPairing[];
}

/** 小组赛 → 下游：按名次区间与胜场条件选出直进席位与突围席位。 */
function collectGroupStageSeats(
  competition: TournamentCompetition,
  stage: TournamentStage
): SeatCollection & { errors: string[] } {
  const seats: StageAdvancementSeat[] = [];
  const pairings: StageAdvancementPairing[] = [];
  const rules = stage.advancementRules ?? [];
  const breakoutStage = getDownstreamStages(competition, stage.id).find(item => item.breakout);
  const pairCount = breakoutStage?.breakout?.pairings.length ?? 2;
  const blockSize = Math.max(2, pairCount * 2);

  getStageGroups(competition, stage).forEach((group, groupIndex) => {
    const ranking = getRankedPlayers(group);
    const directRanks = new Set<number>();
    const breakoutRanks = new Set<number>();

    for (const rule of rules) {
      for (let rank = rule.fromRank; rank <= rule.toRank; rank += 1) {
        const player = ranking[rank - 1];
        if (!player) continue;
        if (rule.minWins !== undefined && player.wins < rule.minWins) continue;
        if (rule.maxWins !== undefined && player.wins > rule.maxWins) continue;
        if (rule.destination === 'breakout') breakoutRanks.add(rank);
        else directRanks.add(rank);
      }
    }

    Array.from(directRanks)
      .sort((a, b) => a - b)
      .forEach(rank => {
        const player = ranking[rank - 1];
        if (player) {
          seats.push(toSeat(player, group, stage, rank, 'direct', {
            groupName: group.name,
            rank,
          }));
        }
      });

    const eligible = Array.from(breakoutRanks)
      .sort((a, b) => a - b)
      .map(rank => ({ rank, player: ranking[rank - 1] }))
      .filter((entry): entry is { rank: number; player: Player } => Boolean(entry.player));
    if (eligible.length === 0) return;
    const blockStart = groupIndex * blockSize;

    if (eligible.length >= 4) {
      // 4 人：3 对 6、4 对 5。
      const ordered = [eligible[0], eligible[3], eligible[1], eligible[2]];
      ordered.forEach((entry, offset) =>
        seats.push({
          ...toSeat(entry.player, group, stage, entry.rank, 'breakout', {
            groupName: group.name,
            rank: entry.rank,
          }),
          targetSlot: blockStart + offset,
        })
      );
      pairings.push({
        sourceGroupId: group.id,
        player1Id: ordered[0].player.id,
        player2Id: ordered[1].player.id,
      });
      pairings.push({
        sourceGroupId: group.id,
        player1Id: ordered[2].player.id,
        player2Id: ordered[3].player.id,
      });
      return;
    }

    if (eligible.length === 3) {
      // 3 人：名次最高者直接晋级，另外两人对阵。
      const [first, second, third] = eligible;
      seats.push({
        ...toSeat(second.player, group, stage, second.rank, 'breakout', {
          groupName: group.name,
          rank: second.rank,
        }),
        targetSlot: blockStart,
      });
      seats.push({
        ...toSeat(third.player, group, stage, third.rank, 'breakout', {
          groupName: group.name,
          rank: third.rank,
        }),
        targetSlot: blockStart + 1,
      });
      seats.push({
        ...toSeat(first.player, group, stage, first.rank, 'breakout_direct', {
          groupName: group.name,
          rank: first.rank,
        }),
        targetSlot: blockStart + 2,
      });
      pairings.push({
        sourceGroupId: group.id,
        player1Id: second.player.id,
        player2Id: third.player.id,
      });
      return;
    }

    // 2 人或 1 人：全部直接晋级。
    eligible.forEach((entry, index) => {
      seats.push({
        ...toSeat(entry.player, group, stage, entry.rank, 'breakout_direct', {
          groupName: group.name,
          rank: entry.rank,
        }),
        targetSlot: blockStart + index * 2,
      });
    });
  });

  const errors = rules.length === 0 ? ['该赛段没有配置晋级规则。'] : [];
  return { seats, pairings, errors };
}

/** 突围赛 → 淘汰赛：胜者与轮空者按来源小组补齐该组的第 3、4 名。 */
function collectBreakoutSeats(
  competition: TournamentCompetition,
  stage: TournamentStage
): SeatCollection & { errors: string[]; warnings: string[]; unresolved: string[] } {
  const originStageId = stage.sourceStageIds?.[0];
  const originStage = getOrderedStages(competition).find(item => item.id === originStageId);
  const originRecord = originStageId
    ? findAdvancementRecord(competition, originStageId)
    : undefined;
  const warnings: string[] = [];
  const unresolved: string[] = [];

  if (!originStage || !originRecord) {
    return {
      seats: [],
      pairings: [],
      warnings,
      unresolved,
      errors: ['缺少小组赛的晋级记录，请先确认小组赛晋级。'],
    };
  }

  const originByCode = new Map<string, StageAdvancementSeat>();
  originRecord.seats.forEach(seat => {
    if (seat.participantCode) originByCode.set(seat.participantCode, seat);
  });

  const advancers: StageAdvancementSeat[] = [];
  for (const group of getStageGroups(competition, stage)) {
    const matches = group.matches.filter(match => match.round === 1);
    if (matches.some(match => match.result === 'pending')) {
      warnings.push(`${group.name} 仍有突围对局未录入，晋级名单可能继续变化。`);
    }
    for (const player of group.players) {
      const involved = matches.filter(
        match => match.player1Id === player.id || match.player2Id === player.id
      );
      const won = involved.some(match =>
        (match.result === 'player1' && match.player1Id === player.id)
        || (match.result === 'player2' && match.player2Id === player.id)
      );
      if (involved.length > 0 && !won) continue;

      const origin = player.participantCode
        ? originByCode.get(player.participantCode)
        : undefined;
      if (!origin?.sourceGroupName || origin.finalRank === undefined) {
        unresolved.push(player.name);
        continue;
      }
      advancers.push({
        ...toSeat(player, group, stage, 0, 'direct'),
        originGroupName: origin.sourceGroupName,
        originRank: origin.finalRank,
      });
    }
  }

  const byOrigin = new Map<string, StageAdvancementSeat[]>();
  for (const seat of advancers) {
    const key = seat.originGroupName ?? '';
    byOrigin.set(key, [...(byOrigin.get(key) ?? []), seat]);
  }
  const seats: StageAdvancementSeat[] = [];
  byOrigin.forEach(groupSeats => {
    groupSeats.sort((a, b) => (a.originRank ?? 99) - (b.originRank ?? 99));
    groupSeats.slice(0, 2).forEach((seat, index) => {
      seats.push({ ...seat, finalRank: 3 + index });
    });
  });

  return { seats, pairings: [], warnings, unresolved, errors: [] };
}

/** 按固定签位把席位排成淘汰赛顺序。 */
function applySeedRules(
  stage: TournamentStage,
  seats: StageAdvancementSeat[]
): { seats: StageAdvancementSeat[]; unresolvedSlots: number } {
  const rules = stage.seedRules ?? [];
  if (rules.length === 0) return { seats, unresolvedSlots: 0 };

  const lookup = new Map<string, StageAdvancementSeat>();
  seats.forEach(seat => {
    if (seat.originGroupName && seat.originRank !== undefined) {
      lookup.set(`${seat.originGroupName}:${seat.originRank}`, seat);
    }
  });

  const ordered: StageAdvancementSeat[] = [];
  let unresolvedSlots = 0;
  for (const rule of [...rules].sort((a, b) => a.targetSlot - b.targetSlot)) {
    const seat = lookup.get(`${rule.sourceGroupName}:${rule.rank}`);
    if (!seat) {
      unresolvedSlots += 1;
      continue;
    }
    ordered.push({ ...seat, targetSlot: rule.targetSlot });
  }
  return { seats: ordered, unresolvedSlots };
}

export function computeStageAdvancement(
  competition: TournamentCompetition,
  sourceStageId: string
): StageAdvancementPreview {
  const stages = getOrderedStages(competition);
  const sourceStage = stages.find(stage => stage.id === sourceStageId);
  const targets = sourceStage ? getDownstreamStages(competition, sourceStage.id) : [];
  const preview: StageAdvancementPreview = {
    sourceStageId,
    targetStageIds: targets.map(stage => stage.id),
    seats: [],
    breakoutPairings: [],
    errors: [],
    warnings: [],
  };

  if (!sourceStage) return { ...preview, errors: ['来源赛段不存在。'] };
  if (targets.length === 0) return { ...preview, errors: ['该赛段没有下游赛段。'] };

  const sourceGroups = getStageGroups(competition, sourceStage);
  if (sourceGroups.length === 0) return { ...preview, errors: ['来源赛段没有小组。'] };
  if (!isStageComplete(competition, sourceStage)) {
    preview.warnings.push('来源赛段仍有小组未结束，晋级名单可能继续变化。');
  }

  if (sourceStage.breakout) {
    const collected = collectBreakoutSeats(competition, sourceStage);
    const playoffStage = targets.find(stage => (stage.seedRules?.length ?? 0) > 0);
    const seeded = playoffStage
      ? applySeedRules(playoffStage, collected.seats)
      : { seats: collected.seats, unresolvedSlots: 0 };
    return {
      ...preview,
      seats: seeded.seats.map(seat => ({
        ...seat,
        targetStageId: playoffStage?.id ?? targets[0].id,
      })),
      warnings: [...preview.warnings, ...collected.warnings],
      errors: collected.errors,
    };
  }

  const collected = collectGroupStageSeats(competition, sourceStage);
  const breakoutStage = targets.find(stage => stage.breakout);
  const playoffStage = targets.find(stage => (stage.seedRules?.length ?? 0) > 0);
  const fallbackTargetId = targets[0].id;
  const targetedSeats = collected.seats.map(seat => ({
    ...seat,
    targetStageId: seat.route === 'direct'
      ? (playoffStage?.id ?? fallbackTargetId)
      : (breakoutStage?.id ?? fallbackTargetId),
  }));
  const targetedPairings = collected.pairings.map(pairing => ({
    ...pairing,
    targetStageId: breakoutStage?.id ?? fallbackTargetId,
  }));
  if (!playoffStage) {
    return {
      ...preview,
      seats: targetedSeats,
      breakoutPairings: targetedPairings,
      errors: collected.errors,
    };
  }

  const directSeats = targetedSeats
    .filter(seat => seat.route === 'direct')
    .map(seat => ({
      ...seat,
      originGroupName: seat.sourceGroupName,
      originRank: seat.finalRank,
    }));
  const seeded = applySeedRules(playoffStage, directSeats);
  return {
    ...preview,
    seats: [...targetedSeats.filter(seat => seat.route !== 'direct'), ...seeded.seats],
    breakoutPairings: targetedPairings,
    errors: collected.errors,
    warnings: [
      ...preview.warnings,
      ...(seeded.unresolvedSlots > 0
        ? [`淘汰赛还有 ${seeded.unresolvedSlots} 个固定签位等待突围赛结果。`]
        : []),
    ],
  };
}

function clonePlayerInto(player: Player, code: string): Player {
  return {
    ...player,
    id: generateId(),
    participantCode: code,
    dropped: false,
    points: 0,
    wins: 0,
    losses: 0,
    totalGames: 0,
    wonGames: 0,
    winRate: 0,
    opponentWinRate: 0,
    opponentOpponentWinRate: 0,
    gameWinRate: 0,
    opponentGameWinRate: 0,
    playedAgainst: [],
    previousRank: undefined,
  };
}

function findSourcePlayer(
  competition: TournamentCompetition,
  seat: StageAdvancementSeat
): Player | undefined {
  for (const group of competition.groups) {
    const byId = group.players.find(player => player.id === seat.playerId);
    if (byId) return byId;
  }
  for (const group of competition.groups) {
    const byCode = group.players.find(
      player => !!seat.participantCode && player.participantCode === seat.participantCode
    );
    if (byCode) return byCode;
  }
  return undefined;
}

/**
 * 把晋级席位写进下游赛段：名单按固定签位排序，并按签位生成单败签表，
 * 空签位即轮空（不补位）。
 */
function materializeTargetStage(
  competition: TournamentCompetition,
  targetStage: TournamentStage
): TournamentCompetition {
  const seats = (competition.stageAdvancements ?? [])
    .flatMap(record => record.seats)
    .filter(seat => seat.targetStageId === targetStage.id)
    .sort((a, b) => (a.targetSlot ?? 999) - (b.targetSlot ?? 999));
  if (seats.length === 0) return competition;

  const players: Player[] = [];
  const slotIds = new Map<number, string>();
  seats.forEach((seat, index) => {
    const source = findSourcePlayer(competition, seat);
    if (!source) return;
    const cloned = clonePlayerInto(source, seat.participantCode ?? '');
    players.push(cloned);
    slotIds.set(seat.targetSlot ?? index, cloned.id);
  });

  const slotNumbers = Array.from(slotIds.keys());
  const highestSlot = slotNumbers.length > 0 ? Math.max(...slotNumbers) : -1;
  const bracketSize = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(players.length, highestSlot + 1))));
  const slots: Array<string | null> = new Array(bracketSize).fill(null);
  slotIds.forEach((playerId, slot) => {
    if (slot < bracketSize) slots[slot] = playerId;
  });

  const groups = [...competition.groups];
  for (const groupId of targetStage.groupIds) {
    const groupIndex = groups.findIndex(group => group.id === groupId);
    if (groupIndex < 0) continue;
    const group = groups[groupIndex];
    groups[groupIndex] = {
      ...group,
      players,
      matches: [],
      status: 'setup',
      currentRound: 0,
      eliminationBracket: {
        id: `elimination-${generateId()}`,
        size: bracketSize,
        slots,
        source: 'custom',
        lockedAt: new Date().toISOString(),
      },
    };
  }

  return { ...competition, groups };
}

export function confirmStageAdvancement(
  competition: TournamentCompetition,
  preview: StageAdvancementPreview
): TournamentCompetition {
  if (preview.errors.length > 0 || preview.seats.length === 0) return competition;

  const record: StageAdvancementRecord = {
    id: generateId(),
    sourceStageId: preview.sourceStageId,
    confirmedAt: new Date().toISOString(),
    seats: preview.seats.map(seat => ({ ...seat })),
    breakoutPairings: preview.breakoutPairings.map(pairing => ({ ...pairing })),
    reason: preview.reason,
  };
  const records = (competition.stageAdvancements ?? []).filter(
    item => item.sourceStageId !== preview.sourceStageId
  );
  let next: TournamentCompetition = {
    ...competition,
    stageAdvancements: [...records, record],
  };
  for (const targetStageId of preview.targetStageIds) {
    const targetStage = next.stages?.find(stage => stage.id === targetStageId);
    if (targetStage) next = materializeTargetStage(next, targetStage);
  }
  return next;
}

/** 回退晋级：清空下游赛段名单、对阵与签表，并删除对应的晋级记录。 */
export function revertStageAdvancement(
  competition: TournamentCompetition,
  sourceStageId: string
): TournamentCompetition {
  const stageIds = new Set(
    getDownstreamStages(competition, sourceStageId).map(stage => stage.id)
  );
  const records = (competition.stageAdvancements ?? []).filter(
    record => record.sourceStageId !== sourceStageId
  );
  if (stageIds.size === 0) return { ...competition, stageAdvancements: records };

  const groups = competition.groups.map(group =>
    group.stageId && stageIds.has(group.stageId)
      ? {
          ...group,
          players: [],
          matches: [],
          status: 'setup' as const,
          currentRound: 0,
          eliminationBracket: undefined,
        }
      : group
  );
  return { ...competition, groups, stageAdvancements: records };
}

export interface FinalStandingPlace {
  /** 名次区间，例如 "1"、"2"、"3-4"、"5-8"。 */
  place: string;
  players: Array<{ name: string; participantCode?: string; groupName: string }>;
}

/**
 * 淘汰赛最终名次：按最后一轮倒推，冠军、亚军、四强、八强……。
 * 单阶段赛事返回空数组（沿用原有的排名展示）。
 */
export function buildFinalStandings(
  competition: TournamentCompetition
): FinalStandingPlace[] {
  const stages = getOrderedStages(competition);
  if (stages.length === 0) return [];

  // 只认有固定签位的淘汰赛赛段，且必须已经打完签表最后一轮，避免小组赛阶段就报出"最终名次"。
  const playoffStage = [...stages].reverse().find(stage =>
    (stage.seedRules?.length ?? 0) > 0
    || getStageGroups(competition, stage).some(group => group.eliminationBracket)
  );
  if (!playoffStage) return [];

  const group = getStageGroups(competition, playoffStage).find(item => item.eliminationBracket);
  if (!group) return [];

  const decidedMatches = group.matches.filter(match => match.round > 0);
  const bracketRounds = (group.eliminationBracket?.size ?? 0) > 1
    ? Math.round(Math.log2(group.eliminationBracket?.size ?? 1))
    : 0;
  const lastRound = decidedMatches.length > 0
    ? Math.max(...decidedMatches.map(match => match.round))
    : 0;
  if (bracketRounds === 0 || lastRound < bracketRounds) return [];
  if (decidedMatches.some(match => match.round === lastRound && match.result === 'pending')) {
    return [];
  }

  const playerById = new Map(group.players.map(player => [player.id, player]));
  const standings: FinalStandingPlace[] = [];
  for (let round = lastRound; round >= 1; round -= 1) {
    const matches = decidedMatches.filter(match => match.round === round);
    const losers = matches
      .map(match => {
        if (match.result === 'player1') return playerById.get(match.player2Id);
        if (match.result === 'player2') return playerById.get(match.player1Id);
        return undefined;
      })
      .filter((player): player is NonNullable<typeof player> => Boolean(player));
    if (losers.length === 0) continue;
    const place = round === lastRound
      ? '2'
      : `${2 ** (lastRound - round) + 1}-${2 ** (lastRound - round + 1)}`;
    standings.push({
      place,
      players: losers.map(player => ({
        name: player.name,
        participantCode: player.participantCode,
        groupName: group.name,
      })),
    });
  }

  const finalMatch = decidedMatches.find(match => match.round === lastRound);
  const championId = finalMatch?.result === 'player1'
    ? finalMatch.player1Id
    : finalMatch?.result === 'player2'
      ? finalMatch.player2Id
      : undefined;
  const champion = championId ? playerById.get(championId) : undefined;
  if (champion) {
    standings.unshift({
      place: '1',
      players: [{
        name: champion.name,
        participantCode: champion.participantCode,
        groupName: group.name,
      }],
    });
  }
  return standings;
}
