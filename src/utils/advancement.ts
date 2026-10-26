import type {
  Player,
  StageAdvancementPairing,
  StageAdvancementPreview,
  StageAdvancementRecord,
  StageAdvancementRule,
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

/**
 * 规则的默认去向：只有一个候选下游时自动指向它。
 * 界面（设置页的下拉框）与引擎共用同一套判断，避免「界面上看着选了、引擎里没算」。
 */
export function resolveDefaultTargetStage(
  competition: TournamentCompetition,
  stageId: string
): TournamentStage | undefined {
  const stages = getOrderedStages(competition);
  const index = stages.findIndex(stage => stage.id === stageId);
  if (index < 0) return undefined;
  const later = stages.slice(index + 1);
  const declared = later.filter(target => target.sourceStageIds?.includes(stageId));
  if (declared.length === 1) return declared[0];
  if (declared.length === 0 && later.length === 1) return later[0];
  return undefined;
}

export function getDownstreamStages(
  competition: TournamentCompetition,
  stageId: string
): TournamentStage[] {
  const stages = getOrderedStages(competition);
  const stage = stages.find(item => item.id === stageId);
  if (!stage) return [];
  const ruleTargets = new Set(
    (stage.advancementRules ?? [])
      .map(rule => rule.targetStageId)
      .filter((id): id is string => Boolean(id))
  );
  const targets = stages.filter(
    target =>
      target.id !== stageId
      && (target.sourceStageIds?.includes(stageId) || ruleTargets.has(target.id))
  );
  if ((stage.advancementRules ?? []).some(rule => !rule.targetStageId)) {
    const fallback = resolveDefaultTargetStage(competition, stageId);
    if (fallback && !targets.includes(fallback)) targets.push(fallback);
  }
  return targets;
}

/** 上游赛段：声明了名单来源的赛段，加上有晋级条件指向本赛段的赛段。 */
export function getUpstreamStageIds(
  competition: TournamentCompetition,
  stageId: string
): string[] {
  const stages = getOrderedStages(competition);
  const stage = stages.find(item => item.id === stageId);
  if (!stage) return [];
  const ids = new Set(stage?.sourceStageIds ?? []);
  stages.forEach(source => {
    if (source.id === stageId) return;
    if (getDownstreamStages(competition, source.id).some(target => target.id === stageId)) {
      ids.add(source.id);
    }
  });
  ids.delete(stageId);
  return Array.from(ids);
}

/** 赛段是否已经打完：所有小组都已完成。 */
export function isStageComplete(
  competition: TournamentCompetition,
  stage: TournamentStage
): boolean {
  const groups = getStageGroups(competition, stage);
  if (groups.length === 0) return false;
  return groups.every(group => {
    if (group.status === 'completed') return true;
    // 兜底：最后一轮全部录完即视为完成，避免状态未及时翻转导致无法晋级。
    if (group.totalRounds <= 0 || group.currentRound < group.totalRounds) return false;
    const lastRoundMatches = group.matches.filter(match => match.round === group.currentRound);
    return lastRoundMatches.length > 0
      && lastRoundMatches.every(match => match.result !== 'pending');
  });
}

/** 上级赛段是否还没确认晋级，用于阻止下游提前开赛。 */
export function getUnconfirmedUpstreamStageIds(
  competition: TournamentCompetition,
  stageId: string
): string[] {
  return getUpstreamStageIds(competition, stageId).filter(
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

/**
 * 小组赛 → 下游：按名次区间与胜场条件选出晋级席位。
 * 每条规则自己去向的赛段由 `targetStageId` 决定；指向「跨组配对赛段」的名次
 * 会按该赛段的配对规则（例如 3 对 6、4 对 5）排位。
 */
function collectGroupStageSeats(
  competition: TournamentCompetition,
  stage: TournamentStage
): SeatCollection & { errors: string[] } {
  const seats: StageAdvancementSeat[] = [];
  const pairings: StageAdvancementPairing[] = [];
  const rules = stage.advancementRules ?? [];
  const allStages = getOrderedStages(competition);
  const downstream = getDownstreamStages(competition, stage.id);
  const breakoutStage = downstream.find(item => item.breakout);
  const errors: string[] = [];
  let nextBlockStart = 0;

  /** 规则的目标赛段：显式选择优先；老数据只有一个下游赛段时自动指向它。 */
  const resolveTarget = (rule: StageAdvancementRule): TournamentStage | undefined => {
    const explicitId = rule.targetStageId?.trim();
    if (explicitId) return allStages.find(item => item.id === explicitId);
    const legacy = (rule as StageAdvancementRule & { destination?: string }).destination;
    if (legacy === 'breakout' && breakoutStage) return breakoutStage;
    if (legacy === 'main') {
      return downstream.find(item => item.id !== breakoutStage?.id) ?? downstream[0];
    }
    return downstream.length === 1 ? downstream[0] : undefined;
  };

  getStageGroups(competition, stage).forEach(group => {
    const ranking = getRankedPlayers(group);
    const directRanks = new Map<number, string>();
    const breakoutRanks = new Set<number>();
    // 同一名次只归属第一条命中的规则：否则同一名选手会同时直进与参加突围，
    // 之后可能在同一个下游签表里出现两次（自己打自己）。
    const assignedRanks = new Set<number>();

    for (const rule of rules) {
      const target = resolveTarget(rule);
      if (!target) {
        if (!errors.includes('有晋级条件未选择目标赛段，无法计算晋级。')) {
          errors.push('有晋级条件未选择目标赛段，无法计算晋级。');
        }
        continue;
      }
      for (let rank = rule.fromRank; rank <= rule.toRank; rank += 1) {
        const player = ranking[rank - 1];
        if (!player) continue;
        if (rule.minWins !== undefined && player.wins < rule.minWins) continue;
        if (rule.maxWins !== undefined && player.wins > rule.maxWins) continue;
        if (assignedRanks.has(rank)) continue;
        assignedRanks.add(rank);
        if (breakoutStage && target.id === breakoutStage.id) breakoutRanks.add(rank);
        else directRanks.set(rank, target.id);
      }
    }

    Array.from(directRanks.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([rank, targetStageId]) => {
        const player = ranking[rank - 1];
        if (player) {
          seats.push({
            ...toSeat(player, group, stage, rank, 'direct', {
              groupName: group.name,
              rank,
            }),
            targetStageId,
          });
        }
      });

    const eligible = Array.from(breakoutRanks)
      .sort((a, b) => a - b)
      .map(rank => ({ rank, player: ranking[rank - 1] }))
      .filter((entry): entry is { rank: number; player: Player } => Boolean(entry.player));
    if (eligible.length === 0) return;
    const breakoutTargetId = breakoutStage?.id;
    const configuredPairs = breakoutStage?.breakout?.pairings?.length
      ? breakoutStage.breakout.pairings
      : [[3, 6], [4, 5]];

    // 跨组配对：按赛段配置的名次配对。两边都到齐就打一场；只有一边时该选手直接晋级。
    const byRank = new Map(eligible.map(entry => [entry.rank, entry]));
    const matched: Array<{ first: (typeof eligible)[number]; second: (typeof eligible)[number] }> = [];
    const singles: Array<(typeof eligible)[number]> = [];
    const placed = new Set<number>();
    configuredPairs.forEach(([firstRank, secondRank]) => {
      const first = byRank.get(firstRank);
      const second = byRank.get(secondRank);
      if (first && second) {
        matched.push({ first, second });
        placed.add(first.rank);
        placed.add(second.rank);
        return;
      }
      if (first) {
        singles.push(first);
        placed.add(first.rank);
      }
      if (second) {
        singles.push(second);
        placed.add(second.rank);
      }
    });
    eligible.forEach(entry => {
      if (!placed.has(entry.rank)) singles.push(entry);
    });
    singles.sort((a, b) => a.rank - b.rank);

    // 对局占两个相邻签位，直接晋级者占一个签位并留空对面（即轮空）。
    let cursor = nextBlockStart;
    matched.forEach(({ first, second }) => {
      seats.push({
        ...toSeat(first.player, group, stage, first.rank, 'breakout', {
          groupName: group.name,
          rank: first.rank,
        }),
        targetStageId: breakoutTargetId,
        targetSlot: cursor,
      });
      seats.push({
        ...toSeat(second.player, group, stage, second.rank, 'breakout', {
          groupName: group.name,
          rank: second.rank,
        }),
        targetStageId: breakoutTargetId,
        targetSlot: cursor + 1,
      });
      pairings.push({
        sourceGroupId: group.id,
        player1Id: first.player.id,
        player2Id: second.player.id,
        targetStageId: breakoutTargetId,
      });
      cursor += 2;
    });
    singles.forEach(entry => {
      seats.push({
        ...toSeat(entry.player, group, stage, entry.rank, 'breakout_direct', {
          groupName: group.name,
          rank: entry.rank,
        }),
        targetStageId: breakoutTargetId,
        targetSlot: cursor,
      });
      cursor += 2;
    });
    nextBlockStart = cursor;
  });

  if (rules.length === 0) errors.push('该赛段没有配置晋级规则。');
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
      // 突围后按结果重新排定该组的第 3、4 名：签位映射要用这个名次，
      // 否则出现低名次翻盘时会匹配不到固定签位而漏掉晋级者。
      seats.push({ ...seat, finalRank: 3 + index, originRank: 3 + index });
    });
  });

  return { seats, pairings: [], warnings, unresolved, errors: [] };
}

/**
 * 按签表对位把席位排成淘汰赛顺序。对位表里没有列到的晋级选手，
 * 按顺序补进剩余空位，避免设置不完整时静默丢人。
 */
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
  const usedSlots = new Set<number>();
  const reservedSlots = new Set<number>();
  const consumed = new Set<StageAdvancementSeat>();
  let unresolvedSlots = 0;
  for (const rule of [...rules].sort((a, b) => a.targetSlot - b.targetSlot)) {
    const seat = lookup.get(`${rule.sourceGroupName}:${rule.rank}`);
    if (!seat) {
      unresolvedSlots += 1;
      reservedSlots.add(rule.targetSlot);
      continue;
    }
    if (usedSlots.has(rule.targetSlot)) continue;
    usedSlots.add(rule.targetSlot);
    consumed.add(seat);
    ordered.push({ ...seat, targetSlot: rule.targetSlot });
  }

  const leftovers = seats.filter(seat => !consumed.has(seat));
  if (leftovers.length > 0) {
    const knownSlots = [...usedSlots, ...reservedSlots];
    const size = Math.max(rules.length, ...knownSlots.map(slot => slot + 1), 0);
    const freeSlots: number[] = [];
    for (let slot = 0; slot < size && freeSlots.length < leftovers.length; slot += 1) {
      if (!usedSlots.has(slot) && !reservedSlots.has(slot)) freeSlots.push(slot);
    }
    leftovers.forEach((seat, index) => {
      ordered.push({ ...seat, targetSlot: freeSlots[index] ?? size + index });
    });
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
    targetStageId: seat.targetStageId ?? fallbackTargetId,
  }));
  const targetedPairings = collected.pairings.map(pairing => ({
    ...pairing,
    targetStageId: pairing.targetStageId ?? breakoutStage?.id ?? fallbackTargetId,
  }));
  if (!playoffStage) {
    return {
      ...preview,
      seats: targetedSeats,
      breakoutPairings: targetedPairings,
      errors: collected.errors,
    };
  }

  // 只有名次直进淘汰赛的席位参与固定签位映射；突围赛产生的 3、4 名在该赛段确认时补齐。
  const seedableSeats = targetedSeats.filter(
    seat => seat.route === 'direct' && seat.targetStageId === playoffStage.id
  );
  const seeded = applySeedRules(
    playoffStage,
    seedableSeats.map(seat => ({
      ...seat,
      originGroupName: seat.sourceGroupName,
      originRank: seat.finalRank,
    }))
  );
  return {
    ...preview,
    seats: [
      ...targetedSeats.filter(
        seat => !(seat.route === 'direct' && seat.targetStageId === playoffStage.id)
      ),
      ...seeded.seats,
    ],
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

function clonePlayerInto(player: Player, code: string, origin?: string): Player {
  return {
    ...player,
    id: generateId(),
    participantCode: code,
    profile: origin ? { ...(player.profile ?? {}), origin } : player.profile,
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
  const seenIdentities = new Set<string>();
  seats.forEach((seat, index) => {
    // 防御历史数据：同一个参赛身份在同一目标赛段只能出现一次。
    const identities = [
      seat.participantCode?.trim() ? `code:${seat.participantCode.trim()}` : '',
      seat.uid?.trim() ? `uid:${seat.uid.trim()}` : '',
      seat.name?.trim() ? `name:${seat.name.trim()}#${seat.qq?.trim() ?? ''}` : '',
    ].filter(Boolean);
    if (identities.some(identity => seenIdentities.has(identity))) return;
    const slot = seat.targetSlot ?? index;
    if (slotIds.has(slot)) return;
    const source = findSourcePlayer(competition, seat);
    if (!source) return;
    identities.forEach(identity => seenIdentities.add(identity));
    const originLabel = seat.originGroupName && seat.originRank !== undefined
      ? `${seat.originGroupName} #${seat.originRank}`
      : undefined;
    const cloned = clonePlayerInto(source, seat.participantCode ?? '', originLabel);
    players.push(cloned);
    slotIds.set(slot, cloned.id);
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
