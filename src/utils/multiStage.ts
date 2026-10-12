import type {
  GameType,
  PairingType,
  StageAdvancementRule,
  StageBreakoutConfig,
  StageSeedRule,
  TournamentCompetition,
  TournamentGroup,
  TournamentStage,
} from '../types';

export type CompetitionKind = 'single_stage' | 'multi_stage' | 'poetry_cup_s3';

/** 设置向导里单个赛段的草稿配置。 */
export interface MultiStageDraftStage {
  id: string;
  name: string;
  kind: PairingType;
  groupCount: number;
  groupNames?: string[];
  playerCountPerGroup: number;
  rounds: number;
  /** 模板固定的轮数（例如突围赛只打一轮），设置后不再按人数自动计算。 */
  fixedRounds?: number;
  gameType: GameType;
  roundGameTypes: GameType[];
  /** 名单来自哪些上游赛段；缺省表示手动导入。 */
  sourceStageIds?: string[];
  /** 该赛段的晋级规则，用于生成下游名单。 */
  advancementRules?: StageAdvancementRule[];
  /** 本赛段为突围赛时的配对规则。 */
  breakout?: StageBreakoutConfig;
  /** 淘汰赛固定签位。 */
  seedRules?: StageSeedRule[];
}

export const POETRY_CUP_S3_NAME = '诗意杯S3';

/** S3 淘汰赛固定签位：来源小组名 + 组内名次 → 淘汰赛位置。 */
export const S3_SEED_RULES: StageSeedRule[] = [
  { sourceGroupName: 'A组', rank: 1, targetSlot: 0 },
  { sourceGroupName: 'D组', rank: 4, targetSlot: 1 },
  { sourceGroupName: 'B组', rank: 2, targetSlot: 2 },
  { sourceGroupName: 'C组', rank: 3, targetSlot: 3 },
  { sourceGroupName: 'C组', rank: 1, targetSlot: 4 },
  { sourceGroupName: 'B组', rank: 4, targetSlot: 5 },
  { sourceGroupName: 'D组', rank: 2, targetSlot: 6 },
  { sourceGroupName: 'A组', rank: 3, targetSlot: 7 },
  { sourceGroupName: 'B组', rank: 1, targetSlot: 8 },
  { sourceGroupName: 'C组', rank: 4, targetSlot: 9 },
  { sourceGroupName: 'A组', rank: 2, targetSlot: 10 },
  { sourceGroupName: 'D组', rank: 3, targetSlot: 11 },
  { sourceGroupName: 'D组', rank: 1, targetSlot: 12 },
  { sourceGroupName: 'A组', rank: 4, targetSlot: 13 },
  { sourceGroupName: 'C组', rank: 2, targetSlot: 14 },
  { sourceGroupName: 'B组', rank: 3, targetSlot: 15 },
];

export function getCompetitionKind(competition: TournamentCompetition): CompetitionKind {
  if (competition.format !== 'multi_stage') return 'single_stage';
  return competition.workflow === 'poetry_cup_s3' ? 'poetry_cup_s3' : 'multi_stage';
}

export function isMultiStageCompetition(competition: TournamentCompetition): boolean {
  return getCompetitionKind(competition) !== 'single_stage';
}

export function getOrderedStages(competition: TournamentCompetition): TournamentStage[] {
  return [...(competition.stages ?? [])].sort((a, b) => a.order - b.order);
}

export function getStageGroups(
  competition: TournamentCompetition,
  stage: TournamentStage
): TournamentGroup[] {
  return stage.groupIds
    .map(groupId => competition.groups.find(group => group.id === groupId))
    .filter((group): group is TournamentGroup => Boolean(group));
}

/** 导出与列表里统一显示「赛段 · 小组」；单阶段赛事保持原样。 */
export function getGroupDisplayName(
  competition: TournamentCompetition,
  group: TournamentGroup
): string {
  const stage = getOrderedStages(competition).find(item => item.groupIds.includes(group.id));
  return stage ? `${stage.name} · ${group.name}` : group.name;
}

/**
 * 当前小组所属赛段在 competition.groups 里的下标；单阶段赛事返回 undefined。
 * 开赛、轮次推进都只作用于这些小组。
 */
export function getCurrentStageGroupIndices(
  competition: TournamentCompetition
): number[] | undefined {
  const stages = getOrderedStages(competition);
  if (stages.length === 0) return undefined;

  const currentGroup = competition.groups[competition.currentGroupIndex];
  const stage = stages.find(item => item.groupIds.includes(currentGroup?.id ?? '')) ?? stages[0];
  const indices = stage.groupIds
    .map(groupId => competition.groups.findIndex(group => group.id === groupId))
    .filter(index => index >= 0);
  return indices.length > 0 ? indices : undefined;
}

export function formatGameType(gameType: GameType | undefined): string {
  return gameType ? gameType.toUpperCase() : '';
}

export function describeGroupGameTypes(group: TournamentGroup): string {
  const rounds = group.roundGameTypes ?? [];
  if (rounds.length === 0) return formatGameType(group.gameType);
  const unique = Array.from(new Set(rounds));
  if (unique.length === 1) return formatGameType(unique[0]);
  return rounds.map(formatGameType).join(' / ');
}

export function describeGroupConfig(group: TournamentGroup, isEnglish: boolean): string {
  const playerLabel = group.players.length > 0
    ? (isEnglish ? `${group.players.length} players` : `${group.players.length} 人`)
    : group.plannedPlayerCount
      ? (isEnglish
          ? `${group.plannedPlayerCount} slots pending`
          : `${group.plannedPlayerCount} 个位置待定`)
      : (isEnglish ? 'No roster' : '暂无名单');
  const roundLabel = isEnglish ? `${group.totalRounds} rounds` : `${group.totalRounds} 轮`;
  return `${playerLabel} · ${roundLabel} · ${describeGroupGameTypes(group)}`;
}

export function describeStageKind(kind: PairingType, isEnglish: boolean): string {
  if (kind === 'single_elimination') return isEnglish ? 'Single elimination' : '单败淘汰';
  return isEnglish ? 'Swiss' : '瑞士轮';
}

export function describeStageSource(
  competition: TournamentCompetition,
  stage: TournamentStage,
  isEnglish: boolean
): string {
  const sourceIds = stage.sourceStageIds ?? [];
  if (sourceIds.length === 0) return isEnglish ? 'Manual roster' : '手动导入名单';
  const names = sourceIds
    .map(id => competition.stages?.find(item => item.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return isEnglish ? 'Manual roster' : '手动导入名单';
  return isEnglish ? `From ${names.join(', ')}` : `来自${names.join('、')}`;
}

const POETRY_CUP_S3_RULE_TEXT = {
  zh: [
    '小组赛：A-D 四组，每组 32 人，5 轮瑞士轮，每轮 BO3。',
    '小组赛每组前 2 名直接进入淘汰赛，共 8 人。',
    '小组赛第 3-6 名中取得 4-1 的选手进入突围赛，不顺延给 3-2。',
    '突围赛只设一个小组，最多 16 人（每个来源小组最多 4 人），只打一轮；配对仍按来源小组进行：4 人时 3 对 6、4 对 5；3 人时第 3 名直接晋级、4 对 5；2 人或 1 人时全部直接晋级。',
    '淘汰赛共 16 人：小组赛直进 8 人 + 突围赛晋级 8 人。',
    '淘汰赛固定签位：A1-D4、B2-C3、C1-B4、D2-A3、B1-C4、A2-D3、D1-A4、C2-B3，人数不足时按实际人数轮空。',
    '淘汰赛逐轮赛制：BO3、BO5、BO5、BO7。',
  ],
  en: [
    'Group stage: groups A-D, 32 players each, 5 Swiss rounds, BO3 every round.',
    'The top 2 of every group advance directly to the playoffs, 8 players in total.',
    'Players at 4-1 among ranks 3-6 of every group enter the breakout stage, with no extension to 3-2.',
    'The breakout stage is a single group holding at most 16 entrants (at most 4 per source group) and plays a single round; pairings still follow the source group: with 4 entrants it pairs 3 vs 6 and 4 vs 5; with 3 entrants rank 3 advances directly and 4 meets 5; with 2 or 1 entrants everyone advances.',
    'The playoffs hold 16 players: 8 direct qualifiers from the group stage plus 8 breakout winners.',
    'Playoff seeds: A1-D4, B2-C3, C1-B4, D2-A3, B1-C4, A2-D3, D1-A4, C2-B3, with byes by actual player count.',
    'Playoff series by round: BO3, BO5, BO5, BO7.',
  ],
} as const;

export function getPoetryCupS3Rules(isEnglish: boolean): string[] {
  return [...(isEnglish ? POETRY_CUP_S3_RULE_TEXT.en : POETRY_CUP_S3_RULE_TEXT.zh)];
}

/** 诗意杯 S3 锁定的三个阶段模板。 */
export function createPoetryCupS3DraftStages(): MultiStageDraftStage[] {
  return [
    {
      id: 's3-group',
      name: '小组赛',
      kind: 'swiss',
      groupCount: 4,
      groupNames: ['A组', 'B组', 'C组', 'D组'],
      playerCountPerGroup: 32,
      rounds: 5,
      gameType: 'bo3',
      roundGameTypes: ['bo3', 'bo3', 'bo3', 'bo3', 'bo3'],
      advancementRules: [
        { id: 's3-top-two', fromRank: 1, toRank: 2, destination: 'main' },
        {
          id: 's3-breakout-4-1',
          fromRank: 3,
          toRank: 6,
          minWins: 4,
          maxWins: 4,
          destination: 'breakout',
        },
      ],
    },
    {
      id: 's3-breakout',
      name: '突围赛',
      kind: 'single_elimination',
      groupCount: 1,
      playerCountPerGroup: 16,
      rounds: 1,
      fixedRounds: 1,
      gameType: 'bo3',
      roundGameTypes: ['bo3'],
      sourceStageIds: ['s3-group'],
      breakout: { pairings: [[3, 6], [4, 5]] },
    },
    {
      id: 's3-playoff',
      name: '淘汰赛',
      kind: 'single_elimination',
      groupCount: 1,
      playerCountPerGroup: 16,
      rounds: 4,
      gameType: 'bo5',
      roundGameTypes: ['bo3', 'bo5', 'bo5', 'bo7'],
      sourceStageIds: ['s3-group', 's3-breakout'],
      seedRules: S3_SEED_RULES,
    },
  ];
}
