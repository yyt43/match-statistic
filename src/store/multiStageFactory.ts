import type {
  CompetitionWorkflow,
  GameType,
  TournamentCompetition,
  TournamentGroup,
  TournamentStage,
} from '../types';
import { createNewGroup, generateId } from './tournamentFactory';
import { getDefaultPlayerFields, getParticipantCodePrefix } from '../utils/playerProfiles';
import {
  POETRY_CUP_S3_NAME,
  createPoetryCupS3DraftStages,
  type MultiStageDraftStage,
} from '../utils/multiStage';

export type { MultiStageDraftStage };

export function createDefaultStageDraft(stageNumber: number): MultiStageDraftStage {
  return {
    id: generateId(),
    name: `赛段${stageNumber}`,
    kind: 'swiss',
    groupCount: 1,
    playerCountPerGroup: 32,
    rounds: 5,
    gameType: 'bo3',
    roundGameTypes: ['bo3', 'bo3', 'bo3', 'bo3', 'bo3'],
    // 默认：本组前 2 名直接晋级，裁判可在设置页调整。
    advancementRules: [
      { id: `rule-${generateId()}`, fromRank: 1, toRank: 2, destination: 'main' },
    ],
  };
}

function fitRoundGameTypes(
  values: GameType[] | undefined,
  length: number,
  fallback: GameType
): GameType[] {
  const next = (values ?? []).slice(0, length);
  while (next.length < length) next.push(fallback);
  return next;
}

function resolveGroupName(
  stage: MultiStageDraftStage,
  groupIndex: number,
  groupCount: number
): string {
  const explicit = stage.groupNames?.[groupIndex]?.trim();
  if (explicit) return explicit;
  if (groupCount <= 1) return stage.name;
  return `${stage.name}${String.fromCharCode(65 + groupIndex)}组`;
}

/**
 * 按赛段草稿创建多阶段赛事：每个赛段的小组都进入同一个 groups 数组，
 * 由 stageId 关联，单阶段流程照旧按 currentGroupIndex 操作。
 */
export function createMultiStageCompetition(
  name: string,
  stages: MultiStageDraftStage[],
  options: { workflow?: CompetitionWorkflow; locked?: boolean } = {}
): TournamentCompetition {
  const groups: TournamentGroup[] = [];
  const stageRecords: TournamentStage[] = [];
  let playerIndex = 1;

  stages.forEach((stage, stageIndex) => {
    const stageId = stage.id?.trim() || generateId();
    const groupCount = Math.max(1, Math.floor(stage.groupCount));
    const playerCount = Math.max(2, Math.floor(stage.playerCountPerGroup));
    const rounds = Math.max(1, Math.floor(stage.rounds));
    const groupIds: string[] = [];

    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const groupName = resolveGroupName(stage, groupIndex, groupCount);
      const group = createNewGroup(
        groupName,
        playerCount,
        rounds,
        stage.gameType,
        stage.kind,
        playerIndex,
        getParticipantCodePrefix(groupName, groups.length)
      );
      groups.push({
        ...group,
        stageId,
        // 名单来自上游赛段时先留空，等晋级确认或裁判手动导入后再填充。
        players: stage.sourceStageIds?.length ? [] : group.players,
        plannedPlayerCount: playerCount,
        totalRounds: stage.fixedRounds ?? group.totalRounds,
        roundsLocked: stage.fixedRounds !== undefined,
        roundGameTypes: fitRoundGameTypes(
          stage.roundGameTypes,
          stage.fixedRounds ?? group.totalRounds,
          stage.gameType
        ),
      });
      groupIds.push(group.id);
      playerIndex += playerCount;
    }

    stageRecords.push({
      id: stageId,
      name: stage.name.trim() || `赛段${stageIndex + 1}`,
      order: stageIndex + 1,
      kind: stage.kind,
      groupIds,
      sourceStageIds: stage.sourceStageIds?.length ? [...stage.sourceStageIds] : undefined,
      locked: options.locked,
      advancementRules: stage.advancementRules?.map(rule => ({ ...rule })),
      breakout: stage.breakout
        ? { pairings: stage.breakout.pairings.map(pair => [...pair] as [number, number]) }
        : undefined,
      seedRules: stage.seedRules?.map(rule => ({ ...rule })),
    });
  });

  return {
    id: generateId(),
    name: name.trim() || '多阶段赛事',
    groups,
    currentGroupIndex: 0,
    createdAt: new Date().toISOString(),
    playerSchemaId: 'generic',
    playerFields: getDefaultPlayerFields('generic'),
    format: 'multi_stage',
    workflow: options.workflow ?? 'standard',
    stages: stageRecords,
  };
}

/** 诗意杯 S3：锁定的小组赛 → 突围赛 → 淘汰赛三赛段模板。 */
export function createPoetryCupS3Competition(
  name: string = POETRY_CUP_S3_NAME
): TournamentCompetition {
  return createMultiStageCompetition(name, createPoetryCupS3DraftStages(), {
    workflow: 'poetry_cup_s3',
    locked: true,
  });
}
