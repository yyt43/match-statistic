import type {
  GameType,
  Player,
  StageAdvancementPairing,
  StageAdvancementPreview,
  StageAdvancementRecord,
  StageAdvancementRule,
  StageAdvancementSeat,
  StageAdvancementSelectionStat,
  TournamentCompetition,
  TournamentGroup,
  TournamentStage,
} from '../types';
import type { AppLanguage } from '../i18n/data';
import { buildRankedGroup } from '../store/competitionState';
import { generateId } from '../store/tournamentFactory';
import { getOrderedStages, getStageGroups } from './multiStage';
import { getSameGroupMode, normalizeAdvancementPlan, normalizeSeatingPlan } from './advancementPlan';
import { getEliminationBracketRounds } from './elimination';

/**
 * 单败淘汰的轮数跟着实际签表大小走：晋级人数少于计划人数时（例如预计 11 人、实际只有 7 人），
 * 签表按 8 人生成，轮数也必须是 3，否则界面上会多出一轮永远打不了的比赛。
 */
function fitRoundGameTypes(list: GameType[] | undefined, count: number, fallback: GameType): GameType[] {
  const source = list && list.length > 0 ? list : [fallback];
  return Array.from({ length: count }, (_, index) => source[index] ?? source[source.length - 1]);
}

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
  const planSlots = normalizeAdvancementPlan(stage)?.slots ?? [];
  const ruleTargets = new Set(
    planSlots
      .map(slot => slot.targetStageId)
      .filter((id): id is string => Boolean(id))
  );
  const targets = stages.filter(
    target =>
      target.id !== stageId
      && (target.sourceStageIds?.includes(stageId) || ruleTargets.has(target.id))
  );
  if (planSlots.some(slot => !slot.targetStageId)) {
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

/**
 * 下游赛段是否已经开赛或录入赛果（只有名单不算）。
 * `status` 也纳入判断：已有对阵但尚未录结果的小组同样视为已开赛，
 * 避免「重新确认晋级」把已经开打的赛程静默清空。
 */
export function hasDownstreamResults(
  competition: TournamentCompetition,
  stage: TournamentStage
): boolean {
  return getDownstreamStages(competition, stage.id).some(target =>
    getStageGroups(competition, target).some(
      group =>
        group.currentRound > 0
        || group.status !== 'setup'
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

/** 赛果锁定提示（中英双语，供 store 与界面复用）。 */
export interface StageLockMessage {
  zh: string;
  en: string;
}

/**
 * 赛段赛果是否因下游已开赛而锁定；锁定返回可展示的双语提示。
 * 与 isStageResultLocked 共用同一判定，避免各入口各写一套锁检查。
 */
export function getStageResultLockMessage(
  competition: TournamentCompetition,
  stageId: string | undefined
): StageLockMessage | null {
  if (!stageId) return null;
  if (!isStageResultLocked(competition, stageId)) return null;
  return {
    zh: '下游赛段已开赛或已录入结果，本赛段赛果已锁定；请先清空下游数据并回退晋级。',
    en: 'The downstream stage has started or already has results, so this stage is locked. Clear the downstream data and revert the advancement first.',
  };
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

/** 双语提示：与界面语言保持一致，缺省中文。 */
function message(language: AppLanguage, zh: string, en: string): string {
  return language === 'en' ? en : zh;
}

function describeSeat(seat: StageAdvancementSeat): string {
  const participant = seat.participantCode?.trim() || seat.name;
  return `${seat.sourceGroupName} #${seat.finalRank} ${participant}`;
}

/**
 * 目标赛段里已经不能覆盖的小组：有对阵、轮次已推进或已开赛。
 * 只有名单（setup 且无对阵）的小组仍允许重写，这样「小组赛 → 突围赛 → 淘汰赛」
 * 逐段确认时不会互相误伤。
 */
function getBlockedTargetGroups(
  competition: TournamentCompetition,
  targetStage: TournamentStage
): TournamentGroup[] {
  const seen = new Set<string>();
  const blocked: TournamentGroup[] = [];
  for (const groupId of targetStage.groupIds) {
    if (seen.has(groupId)) continue;
    seen.add(groupId);
    const group = competition.groups.find(item => item.id === groupId);
    if (!group) continue;
    if (group.matches.length > 0 || group.currentRound > 0 || group.status !== 'setup') {
      blocked.push(group);
    }
  }
  return blocked;
}

/**
 * 确认前的席位校验：把「会丢人 / 会撞签位」的席位变成可见错误。
 * 身份只按参赛编号 / UID 判定——同名且都没编号的选手是合法参赛者，
 * 不能按昵称去重（旧实现按 name#qq 去重会静默丢人）。
 */
function validateAdvancementSeats(
  competition: TournamentCompetition,
  seats: StageAdvancementSeat[],
  language: AppLanguage
): string[] {
  const errors: string[] = [];
  const identities = new Map<string, StageAdvancementSeat>();
  const slots = new Map<string, StageAdvancementSeat>();
  for (const seat of seats) {
    const label = describeSeat(seat);
    const targetStageId = seat.targetStageId ?? '';
    const identityKeys = [
      seat.participantCode?.trim() ? `code:${seat.participantCode.trim()}` : '',
      seat.uid?.trim() ? `uid:${seat.uid.trim()}` : '',
    ].filter(Boolean);
    for (const identityKey of identityKeys) {
      const key = `${targetStageId}|${identityKey}`;
      const duplicate = identities.get(key);
      if (duplicate) {
        errors.push(
          message(
            language,
            `晋级席位重复：${describeSeat(duplicate)} 与 ${label} 是同一参赛身份，已阻止确认。`,
            `Duplicate advancement seat: ${describeSeat(duplicate)} and ${label} refer to the same participant; confirmation is blocked.`
          )
        );
      } else {
        identities.set(key, seat);
      }
    }
    if (seat.targetSlot !== undefined) {
      const key = `${targetStageId}|${seat.targetSlot}`;
      const conflict = slots.get(key);
      if (conflict) {
        errors.push(
          message(
            language,
            `晋级席位冲突：${describeSeat(conflict)} 与 ${label} 争用同一签位 #${seat.targetSlot}，已阻止确认。`,
            `Advancement slot conflict: ${describeSeat(conflict)} and ${label} target slot #${seat.targetSlot}; confirmation is blocked.`
          )
        );
      } else {
        slots.set(key, seat);
      }
    }
    if (!findSourcePlayer(competition, seat)) {
      errors.push(
        message(
          language,
          `晋级席位 ${label} 在赛事名单中找不到对应选手，已阻止确认。`,
          `Advancement seat ${label} has no matching player in this competition; confirmation is blocked.`
        )
      );
    }
  }
  return errors;
}

/** 目标赛段是否包含「单败淘汰赛」以外的分组：这类分组不该自动生成签表。 */
function getNonEliminationTargetGroups(
  competition: TournamentCompetition,
  targetStage: TournamentStage
): TournamentGroup[] {
  return targetStage.groupIds
    .map(groupId => competition.groups.find(group => group.id === groupId))
    .filter((group): group is TournamentGroup => Boolean(group))
    .filter(group => group.pairingType !== 'single_elimination');
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

/**
 * 通用晋级模型（新字段 `advancementPlan` / `seating`）的落位计算。
 *
 * 与旧实现的关系：旧字段（advancementRules / breakout / seedRules）先经
 * `normalizeAdvancementPlan` / `normalizeSeatingPlan` 归一化，语义保持不变；
 * 这里额外支持「跨组取前 N」「蛇形排位」「自定义名次配对」等更一般的规则。
 */
interface PendingSeat {
  seat: StageAdvancementSeat;
  targetStageId: string;
}

interface CandidateSeat {
  player: Player;
  group: TournamentGroup;
  rank: number;
}

/** 跨组取前 N 时的排序：积分 → 胜场 → 胜率 → 对手胜率 → 对手的对手胜率 → 姓名。 */
function compareCandidates(a: CandidateSeat, b: CandidateSeat): number {
  const first = a.player;
  const second = b.player;
  return (
    second.points - first.points
    || second.wins - first.wins
    || (second.winRate ?? 0) - (first.winRate ?? 0)
    || (second.opponentWinRate ?? 0) - (first.opponentWinRate ?? 0)
    || (second.opponentOpponentWinRate ?? 0) - (first.opponentOpponentWinRate ?? 0)
    || first.name.localeCompare(second.name)
  );
}

/** 一条去向的目标赛段：显式选择优先，没选时退回默认下游（只有一个候选时自动指向它）。 */
function resolveSlotTarget(
  targetStageId: string,
  sourceStage: TournamentStage,
  competition: TournamentCompetition,
  targets: TournamentStage[]
): TournamentStage | undefined {
  const explicit = targetStageId.trim();
  if (explicit) return targets.find(stage => stage.id === explicit);
  const fallback = resolveDefaultTargetStage(competition, sourceStage.id);
  if (fallback) return fallback;
  return targets.length === 1 ? targets[0] : undefined;
}

/** 按晋级计划的选人条件收集席位；同一名选手在一个赛段内只会被送到一个去向。 */
function collectPlanSeats(
  competition: TournamentCompetition,
  sourceStage: TournamentStage,
  targets: TournamentStage[],
  language: AppLanguage
): { pending: PendingSeat[]; errors: string[]; stats: StageAdvancementSelectionStat[] } {
  const plan = normalizeAdvancementPlan(sourceStage);
  const groups = getStageGroups(competition, sourceStage);
  const pending: PendingSeat[] = [];
  const errors: string[] = [];
  const stats: StageAdvancementSelectionStat[] = [];
  const claimed = new Set<string>();

  if (!plan || plan.slots.length === 0) {
    return { pending, errors: ['该赛段没有配置晋级规则。'], stats };
  }

  for (const slot of plan.slots) {
    const target = resolveSlotTarget(slot.targetStageId, sourceStage, competition, targets);
    if (!target) {
      const messageZh = '有晋级条件未选择目标赛段，无法计算晋级。';
      if (!errors.includes(messageZh)) errors.push(messageZh);
      continue;
    }
    for (const selector of slot.selectors) {
      const winsMode = selector.mode === 'wins';
      const from = Math.max(1, Math.floor(selector.fromRank));
      const to = Math.max(from, Math.floor(selector.toRank));
      const candidates: CandidateSeat[] = [];
      for (const group of groups) {
        const ranking = getRankedPlayers(group);
        const rankSpan: number[] = [];
        if (winsMode) {
          // 按胜场选人：覆盖全组，名次区间只作为占位被忽略。
          for (let rank = 1; rank <= ranking.length; rank += 1) rankSpan.push(rank);
        } else {
          for (let rank = from; rank <= to; rank += 1) rankSpan.push(rank);
        }
        for (const rank of rankSpan) {
          const player = ranking[rank - 1];
          if (!player || claimed.has(player.id)) continue;
          if (selector.minWins !== undefined && player.wins < selector.minWins) continue;
          if (selector.maxWins !== undefined && player.wins > selector.maxWins) continue;
          candidates.push({ player, group, rank });
        }
      }
      // 按胜场选人时，候选顺序也要按胜场排（名次在单败淘汰里可能并列）。
      if (winsMode) candidates.sort(compareCandidates);
      const take = selector.take === undefined ? undefined : Math.max(0, Math.floor(selector.take));
      const chosen = take === undefined
        ? candidates
        : [...candidates].sort(compareCandidates).slice(0, take);
      const chosenIds = new Set(chosen.map(candidate => candidate.player.id));
      const droppedCandidates = candidates.filter(candidate => !chosenIds.has(candidate.player.id));
      const boundaryWins = chosen.length > 0 ? chosen[chosen.length - 1].player.wins : undefined;
      stats.push({
        slotId: slot.id,
        selectorIndex: slot.selectors.indexOf(selector) + 1,
        targetStageId: target.id,
        targetStageName: target.name,
        mode: winsMode ? 'wins' : 'rank',
        matched: candidates.length,
        taken: chosen.length,
        dropped: droppedCandidates.length,
        tieDropped: winsMode && boundaryWins !== undefined
          ? droppedCandidates.filter(candidate => candidate.player.wins === boundaryWins).length
          : 0,
      });
      for (const candidate of chosen) {
        claimed.add(candidate.player.id);
        pending.push({
          targetStageId: target.id,
          seat: {
            ...toSeat(candidate.player, candidate.group, sourceStage, candidate.rank, 'direct', {
              groupName: candidate.group.name,
              rank: candidate.rank,
            }),
            targetStageId: target.id,
          },
        });
      }
    }
  }

  if (pending.length === 0 && errors.length === 0) {
    errors.push(
      message(language, '没有选手满足当前的晋级条件。', 'No player matches the current advancement conditions.')
    );
  }
  return { pending, errors, stats };
}

/** 由名次配对赛段（旧称突围赛）继续晋级时，取首轮胜者/轮空者并重排名次。 */
function collectRankPairsSurvivors(
  competition: TournamentCompetition,
  stage: TournamentStage,
  language: AppLanguage
): { seats: StageAdvancementSeat[]; warnings: string[]; errors: string[] } {
  const seating = normalizeSeatingPlan(stage);
  const pairs: Array<[number, number]> = getSameGroupMode(seating) === 'rankPairs' && seating.pairs
    ? seating.pairs
    : [[3, 6], [4, 5]];
  const base = Math.min(...pairs.flat());
  const originStageId = stage.sourceStageIds?.[0];
  const originStage = getOrderedStages(competition).find(item => item.id === originStageId);
  const originRecord = originStageId ? findAdvancementRecord(competition, originStageId) : undefined;
  const warnings: string[] = [];
  const unresolved: string[] = [];

  if (!originStage || !originRecord) {
    return {
      seats: [],
      warnings,
      errors: [
        message(
          language,
          '缺少上游赛段的晋级记录，请先确认上游赛段晋级。',
          'The upstream advancement record is missing; confirm the upstream stage first.'
        ),
      ],
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
      warnings.push(`${group.name} 仍有对局未录入，晋级名单可能继续变化。`);
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
  // 每个来源小组能继续晋级的席位数：一条名次配对产生一个胜者。
  // 没有录入首轮对阵时（例如刚确认完上游、还没开打），按名次取前 N 名作为暂定晋级者，
  // 这也是旧实现 `.slice(0, 2)` 的等价行为。
  const survivorsPerGroup = Math.max(1, pairs.length);
  byOrigin.forEach(groupSeats => {
    groupSeats.sort((a, b) => (a.originRank ?? 99) - (b.originRank ?? 99));
    groupSeats.slice(0, survivorsPerGroup).forEach((seat, index) => {
      seats.push({ ...seat, finalRank: base + index, originRank: base + index });
    });
  });

  if (unresolved.length > 0) {
    warnings.push(
      message(
        language,
        `有 ${unresolved.length} 名选手找不到来源名次：${unresolved.join('、')}。`,
        `${unresolved.length} player(s) have no source rank: ${unresolved.join(', ')}.`
      )
    );
  }
  return { seats, warnings, errors: [] };
}

/** 生成蛇形排位的「种子序号 → 槽位」顺序，例如 8 人：1,8,5,4,3,6,7,2。 */
function buildSeedSlotOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const nextSize = order.length * 2;
    const expanded: number[] = [];
    for (const seed of order) {
      expanded.push(seed, nextSize + 1 - seed);
    }
    order = expanded;
  }
  return order;
}

/**
 * 首轮回避同组：整体分布不变，只交换少量席位，
 * 让首轮对阵里尽量避免「同一个来源小组」的两个人相遇。
 */
function reduceSameGroupFirstRound(seats: StageAdvancementSeat[]): void {
  if (seats.length < 2) return;
  const groupOf = (seat: StageAdvancementSeat) => seat.sourceGroupId;
  const conflictCount = (order: StageAdvancementSeat[]) => {
    let count = 0;
    for (let index = 0; index + 1 < order.length; index += 2) {
      if (groupOf(order[index]) === groupOf(order[index + 1])) count += 1;
    }
    return count;
  };
  const order = [...seats].sort((a, b) => (a.targetSlot ?? 0) - (b.targetSlot ?? 0));
  let current = conflictCount(order);
  for (let attempt = 0; attempt < order.length && current > 0; attempt += 1) {
    let improved = false;
    for (let first = 0; first + 1 < order.length; first += 2) {
      if (groupOf(order[first]) !== groupOf(order[first + 1])) continue;
      for (let other = 0; other < order.length; other += 1) {
        if (other === first || other === first + 1) continue;
        [order[first + 1], order[other]] = [order[other], order[first + 1]];
        const next = conflictCount(order);
        if (next < current) {
          current = next;
          improved = true;
          break;
        }
        [order[first + 1], order[other]] = [order[other], order[first + 1]];
      }
      if (improved) break;
    }
    if (!improved) break;
  }
  order.forEach((seat, index) => {
    seat.targetSlot = index;
  });
}

/** 把一个目标赛段收到的席位按它的落位方式排好（顺序 / 种子分散 / 组内配对 / 固定签位）。 */
function applySeatingForTarget(
  targetStage: TournamentStage,
  pending: PendingSeat[]
): {
  seats: StageAdvancementSeat[];
  pairings: StageAdvancementPairing[];
  unresolvedSlots: number;
} {
  const seating = normalizeSeatingPlan(targetStage);
  const sameGroup = getSameGroupMode(seating);
  const seats: StageAdvancementSeat[] = [];
  const pairings: StageAdvancementPairing[] = [];
  let unresolvedSlots = 0;

  if (pending.length === 0) return { seats, pairings, unresolvedSlots };

  const keyOf = (seat: StageAdvancementSeat) => seat.originGroupName ?? seat.sourceGroupName;
  const rankOf = (seat: StageAdvancementSeat) => seat.originRank ?? seat.finalRank;

  if (seating.mode === 'fixedSlots') {
    const rules = [...(seating.slots ?? [])].sort((a, b) => a.slot - b.slot);
    const lookup = new Map<string, StageAdvancementSeat>();
    pending.forEach(entry => lookup.set(`${keyOf(entry.seat)}:${rankOf(entry.seat)}`, entry.seat));
    const usedSlots = new Set<number>();
    const reservedSlots = new Set<number>();
    const consumed = new Set<StageAdvancementSeat>();
    for (const rule of rules) {
      const seat = lookup.get(`${rule.sourceGroupName}:${rule.rank}`);
      if (!seat) {
        unresolvedSlots += 1;
        reservedSlots.add(rule.slot);
        continue;
      }
      if (usedSlots.has(rule.slot)) continue;
      usedSlots.add(rule.slot);
      consumed.add(seat);
      seats.push({ ...seat, targetStageId: targetStage.id, targetSlot: rule.slot, route: 'direct' });
    }
    const leftovers = pending.map(entry => entry.seat).filter(seat => !consumed.has(seat));
    if (leftovers.length > 0) {
      const knownSlots = [...usedSlots, ...reservedSlots];
      const size = Math.max(rules.length, ...knownSlots.map(slot => slot + 1), 0);
      const freeSlots: number[] = [];
      for (let slot = 0; slot < size && freeSlots.length < leftovers.length; slot += 1) {
        if (!usedSlots.has(slot) && !reservedSlots.has(slot)) freeSlots.push(slot);
      }
      leftovers.forEach((seat, index) => {
        seats.push({
          ...seat,
          targetStageId: targetStage.id,
          targetSlot: freeSlots[index] ?? size + index,
          route: 'direct',
        });
      });
    }
    return { seats, pairings, unresolvedSlots };
  }

  if (sameGroup === 'rankPairs') {
    const pairs: Array<[number, number]> = seating.pairs && seating.pairs.length > 0
      ? seating.pairs
      : [[3, 6], [4, 5]];
    const blocks = new Map<string, StageAdvancementSeat[]>();
    pending.forEach(entry => {
      const key = keyOf(entry.seat);
      blocks.set(key, [...(blocks.get(key) ?? []), entry.seat]);
    });
    let cursor = 0;
    blocks.forEach(groupSeats => {
      const byRank = new Map<number, StageAdvancementSeat>();
      groupSeats.forEach(seat => byRank.set(rankOf(seat), seat));
      const placed = new Set<number>();
      const matched: Array<[StageAdvancementSeat, StageAdvancementSeat]> = [];
      const singles: StageAdvancementSeat[] = [];
      pairs.forEach(([firstRank, secondRank]) => {
        const first = byRank.get(firstRank);
        const second = byRank.get(secondRank);
        if (first && second) {
          matched.push([first, second]);
          placed.add(rankOf(first));
          placed.add(rankOf(second));
          return;
        }
        if (first) {
          singles.push(first);
          placed.add(rankOf(first));
        }
        if (second) {
          singles.push(second);
          placed.add(rankOf(second));
        }
      });
      groupSeats.forEach(seat => {
        if (!placed.has(rankOf(seat))) singles.push(seat);
      });
      singles.sort((a, b) => rankOf(a) - rankOf(b));
      matched.forEach(([first, second]) => {
        seats.push({ ...first, targetStageId: targetStage.id, targetSlot: cursor, route: 'breakout' });
        seats.push({ ...second, targetStageId: targetStage.id, targetSlot: cursor + 1, route: 'breakout' });
        pairings.push({
          sourceGroupId: first.sourceGroupId,
          player1Id: first.playerId,
          player2Id: second.playerId,
          targetStageId: targetStage.id,
        });
        cursor += 2;
      });
      singles.forEach(seat => {
        seats.push({ ...seat, targetStageId: targetStage.id, targetSlot: cursor, route: 'breakout_direct' });
        cursor += 2;
      });
    });
    return { seats, pairings, unresolvedSlots };
  }

  // ordered / snake：按「来源小组顺序 → 名次」排成名单。
  const groupOrder = new Map<string, number>();
  pending.forEach(entry => {
    const key = entry.seat.sourceGroupId;
    if (!groupOrder.has(key)) groupOrder.set(key, groupOrder.size);
  });
  const ordered = pending
    .map(entry => entry.seat)
    .sort((a, b) => {
      const groupDiff = (groupOrder.get(a.sourceGroupId) ?? 0) - (groupOrder.get(b.sourceGroupId) ?? 0);
      return groupDiff !== 0 ? groupDiff : rankOf(a) - rankOf(b);
    });

  if (seating.mode === 'snake') {
    const size = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, ordered.length))));
    const slotOrder = buildSeedSlotOrder(size);
    ordered.forEach((seat, index) => {
      const slot = slotOrder.indexOf(index + 1);
      seats.push({ ...seat, targetStageId: targetStage.id, targetSlot: slot, route: 'direct' });
    });
    if (sameGroup === 'avoid') reduceSameGroupFirstRound(seats);
    return { seats, pairings, unresolvedSlots };
  }

  ordered.forEach((seat, index) => {
    seats.push({ ...seat, targetStageId: targetStage.id, targetSlot: index, route: 'direct' });
  });
  if (sameGroup === 'avoid') reduceSameGroupFirstRound(seats);
  return { seats, pairings, unresolvedSlots };
}

/** 新模型的完整计算：按晋级计划选人，再按目标赛段的落位方式排位。 */
function computePlanBasedAdvancement(
  competition: TournamentCompetition,
  sourceStage: TournamentStage,
  targets: TournamentStage[],
  preview: StageAdvancementPreview,
  language: AppLanguage
): StageAdvancementPreview {
  const seating = normalizeSeatingPlan(sourceStage);
  const warnings: string[] = [];
  const errors: string[] = [];
  let pending: PendingSeat[] = [];
  let selectionStats: StageAdvancementSelectionStat[] = [];

  if (getSameGroupMode(seating) === 'rankPairs') {
    const survivors = collectRankPairsSurvivors(competition, sourceStage, language);
    errors.push(...survivors.errors);
    warnings.push(...survivors.warnings);
    const plan = normalizeAdvancementPlan(sourceStage);
    const targetIds = plan && plan.slots.length > 0
      ? [...new Set(plan.slots.map(slot => slot.targetStageId))]
      : targets.map(stage => stage.id);
    survivors.seats.forEach(seat => {
      targetIds.forEach(targetStageId => {
        pending.push({ targetStageId, seat: { ...seat, targetStageId } });
      });
    });
  } else {
    const collected = collectPlanSeats(competition, sourceStage, targets, language);
    pending = collected.pending;
    errors.push(...collected.errors);
    selectionStats = collected.stats;
  }

  const byTarget = new Map<string, PendingSeat[]>();
  pending.forEach(entry => {
    byTarget.set(entry.targetStageId, [...(byTarget.get(entry.targetStageId) ?? []), entry]);
  });

  const seats: StageAdvancementSeat[] = [];
  const pairings: StageAdvancementPairing[] = [];
  targets.forEach(target => {
    const group = byTarget.get(target.id) ?? [];
    const seated = applySeatingForTarget(target, group);
    seats.push(...seated.seats);
    pairings.push(...seated.pairings);
    if (seated.unresolvedSlots > 0) {
      warnings.push(
        message(
          language,
          `赛段「${target.name}」还有 ${seated.unresolvedSlots} 个固定签位等待上游结果。`,
          `Stage "${target.name}" still has ${seated.unresolvedSlots} fixed slot(s) waiting for upstream results.`
        )
      );
    }
  });

  return {
    ...preview,
    seats,
    breakoutPairings: pairings,
    selectionStats,
    errors: [...errors, ...validateAdvancementSeats(competition, seats, language)],
    warnings: [...preview.warnings, ...warnings],
  };
}

export function computeStageAdvancement(
  competition: TournamentCompetition,
  sourceStageId: string,
  language: AppLanguage = 'zh'
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

  // 该赛段已确认晋级且下游已开赛/已录结果：禁止重新计算并覆盖下游数据。
  if (isStageResultLocked(competition, sourceStage.id)) {
    return {
      ...preview,
      errors: [
        ...preview.errors,
        message(
          language,
          '下游赛段已开赛或已录入结果，晋级结果已锁定；如需重新确认，请先清空下游数据并回退晋级。',
          'The downstream stage already started or has results, so the advancement is locked. Clear the downstream stage and revert the advancement before confirming again.'
        ),
      ],
    };
  }

  // 一个下游赛段对应多个小组时，晋级名单写不进确定的签表。
  const multiGroupTargets = targets.filter(stage => stage.groupIds.length > 1);
  if (multiGroupTargets.length > 0) {
    return {
      ...preview,
      errors: [
        ...preview.errors,
        ...multiGroupTargets.map(stage =>
          message(
            language,
            `下游赛段「${stage.name}」包含多个小组，无法确定晋级名单写入哪个小组，请先调整赛段设置。`,
            `Downstream stage "${stage.name}" contains multiple groups; the advancement roster cannot be written into a specific group. Adjust the stage settings first.`
          )
        ),
      ],
    };
  }

  // 非单败淘汰赛的下游只写名单，不自动生成签表。
  const nonEliminationTargets = targets.filter(
    stage => getNonEliminationTargetGroups(competition, stage).length > 0
  );
  if (nonEliminationTargets.length > 0) {
    preview.warnings.push(
      ...nonEliminationTargets.map(stage =>
        message(
          language,
          `下游赛段「${stage.name}」不是单败淘汰赛，晋级后只写入名单，不生成签表。`,
          `Downstream stage "${stage.name}" is not a single-elimination stage; advancement only writes the roster and does not create a bracket.`
        )
      )
    );
  }

  // 新模型：赛段带 advancementPlan / seating 时走通用管线；旧数据继续走旧实现。
  const usesPlanModel = Boolean(sourceStage.advancementPlan?.slots.length)
    || Boolean(sourceStage.seating)
    || targets.some(target => Boolean(target.seating));
  if (usesPlanModel) {
    return computePlanBasedAdvancement(competition, sourceStage, targets, preview, language);
  }

  if (sourceStage.breakout) {
    const collected = collectBreakoutSeats(competition, sourceStage);
    const playoffStage = targets.find(stage => (stage.seedRules?.length ?? 0) > 0);
    const seeded = playoffStage
      ? applySeedRules(playoffStage, collected.seats)
      : { seats: collected.seats, unresolvedSlots: 0 };
    const seats = seeded.seats.map(seat => ({
      ...seat,
      targetStageId: playoffStage?.id ?? targets[0].id,
    }));
    return {
      ...preview,
      seats,
      warnings: [...preview.warnings, ...collected.warnings],
      errors: [
        ...collected.errors,
        ...validateAdvancementSeats(competition, seats, language),
      ],
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
      errors: [
        ...collected.errors,
        ...validateAdvancementSeats(competition, targetedSeats, language),
      ],
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
  const finalSeats = [
    ...targetedSeats.filter(
      seat => !(seat.route === 'direct' && seat.targetStageId === playoffStage.id)
    ),
    ...seeded.seats,
  ];
  return {
    ...preview,
    seats: finalSeats,
    breakoutPairings: targetedPairings,
    errors: [
      ...collected.errors,
      ...validateAdvancementSeats(competition, finalSeats, language),
    ],
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

interface MaterializeResult {
  competition: TournamentCompetition;
  errors: string[];
}

/**
 * 把晋级席位写进下游赛段：名单按固定签位排序，
 * 单败淘汰赛的分组同时生成签表（空签位即轮空，不补位）。
 *
 * 目标小组已有对阵/已开赛时返回错误而不是静默清空——重复确认晋级不能抹掉下游赛果。
 * 每个目标小组拿到互相独立的对象，避免多个小组共享同一份 players 引用。
 */
function materializeTargetStage(
  competition: TournamentCompetition,
  targetStage: TournamentStage,
  language: AppLanguage = 'zh'
): MaterializeResult {
  const seats = (competition.stageAdvancements ?? [])
    .flatMap(record => record.seats)
    .filter(seat => seat.targetStageId === targetStage.id)
    .sort((a, b) => (a.targetSlot ?? 999) - (b.targetSlot ?? 999));
  if (seats.length === 0) return { competition, errors: [] };

  const blockedGroups = getBlockedTargetGroups(competition, targetStage);
  if (blockedGroups.length > 0) {
    return {
      competition,
      errors: blockedGroups.map(group =>
        message(
          language,
          `下游小组「${group.name}」已有对阵或已开赛，不能覆盖晋级名单；请先清空下游数据并回退晋级。`,
          `Group "${group.name}" already has matches or has started; the advancement roster cannot be overwritten. Clear the downstream stage and revert the advancement first.`
        )
      ),
    };
  }

  const players: Player[] = [];
  const slotIds = new Map<number, string>();
  const seenIdentities = new Set<string>();
  seats.forEach((seat, index) => {
    // 防御历史数据：同一个参赛身份在同一目标赛段只能出现一次。
    // 身份只按编号 / UID，同名无编号的选手是不同的人。
    const identities = [
      seat.participantCode?.trim() ? `code:${seat.participantCode.trim()}` : '',
      seat.uid?.trim() ? `uid:${seat.uid.trim()}` : '',
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
    // 每个小组独立克隆名单与签位，避免多个小组共享同一数组引用。
    const groupPlayers = players.map(player => ({
      ...player,
      profile: player.profile ? { ...player.profile } : player.profile,
      playedAgainst: [...player.playedAgainst],
    }));
    const groupSlots = [...slots];
    const isElimination = group.pairingType === 'single_elimination';
    // 淘汰赛轮数：用户显式设置（roundsLocked / fixedRounds）时以设置为准，
    // 例如 16 人签表只打 1 轮取前 8 晋级；但实际到达人数撑不满时以签表上限为准，
    // 避免出现「8 人签表却安排 4 轮」这种打不出来的赛程。
    const capacityRounds = getEliminationBracketRounds(bracketSize);
    const bracketRounds = isElimination
      ? Math.min(group.roundsLocked ? group.totalRounds : capacityRounds, capacityRounds)
      : group.totalRounds;
    groups[groupIndex] = {
      ...group,
      players: groupPlayers,
      matches: [],
      status: 'setup',
      currentRound: 0,
      totalRounds: bracketRounds,
      roundGameTypes: isElimination
        ? fitRoundGameTypes(group.roundGameTypes, bracketRounds, group.gameType)
        : group.roundGameTypes,
      // 只有单败淘汰赛的分组才生成签表；其它赛制只接收名单。
      eliminationBracket: isElimination
        ? {
            id: `elimination-${generateId()}`,
            size: bracketSize,
            slots: groupSlots,
            source: 'custom',
          }
        : undefined,
    };
  }

  return { competition: { ...competition, groups }, errors: [] };
}

export function confirmStageAdvancement(
  competition: TournamentCompetition,
  preview: StageAdvancementPreview,
  language: AppLanguage = 'zh'
): TournamentCompetition {
  if (preview.errors.length > 0 || preview.seats.length === 0) return competition;

  // 该赛段已确认晋级且下游已有赛果：重复确认会覆盖下游数据，直接拒绝。
  if (isStageResultLocked(competition, preview.sourceStageId)) return competition;

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
    if (!targetStage) continue;
    const materialized = materializeTargetStage(next, targetStage, language);
    // 有小组无法安全覆盖时整次确认作废，保持原赛事不变。
    if (materialized.errors.length > 0) return competition;
    next = materialized.competition;
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
