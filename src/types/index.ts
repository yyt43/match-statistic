export type MatchResult = 'player1' | 'player2' | 'draw' | 'pending';

export type TournamentStatus = 'setup' | 'in_progress' | 'completed';

export type PairingType = 'swiss' | 'single_elimination';

export type GameType = 'bo1' | 'bo3' | 'bo5' | 'bo7';

export type TiebreakRule =
  | 'opponentWinRate'
  | 'opponentOpponentWinRate'
  | 'gameWinRate'
  | 'opponentGameWinRate'
  | 'points'
  | 'playoffWins';

export type TiebreakTemplate = 'standard_bo1' | 'standard_multi' | 'custom';

export type PlayerSchemaId = 'generic' | 'poetryCupS2';

export type PlayerFieldType = 'text' | 'gameUid' | 'qq' | 'select';

export interface PlayerFieldDefinition {
  key: string;
  label: string;
  type: PlayerFieldType;
  required: boolean;
  unique: boolean;
  immutableAfter?: 'never' | 'rosterLock';
  visibility: 'public' | 'admin';
  searchable: boolean;
  showInPairings: boolean;
  importAliases?: string[];
  pattern?: string;
}

export type EvidenceVerificationStatus =
  | 'not_required'
  | 'pending'
  | 'verified'
  | 'mismatch'
  | 'unreadable'
  | 'missing';

export type PublicResultStatus =
  | 'not_announced'
  | 'announced'
  | 'default_confirmed'
  | 'disputed';

export interface MatchResultOverride {
  previousResult: MatchResult;
  previousPlayer1Games?: number;
  previousPlayer2Games?: number;
  newResult: MatchResult;
  newPlayer1Games?: number;
  newPlayer2Games?: number;
  reason: string;
  evidenceRefs: string[];
  changedBy?: string;
  changedAt: string;
  snapshotId?: string;
}

export interface Player {
  id: string;
  name: string;
  participantCode?: string;
  profile?: Record<string, string>;
  points: number;
  wins: number;
  losses: number;
  totalGames: number;
  wonGames: number;
  winRate: number;
  opponentWinRate: number;
  opponentOpponentWinRate: number;
  gameWinRate: number;
  opponentGameWinRate: number;
  playedAgainst: string[];
  previousRank?: number;
  dropped?: boolean;
  eliminated?: boolean;
  /** 累计向下匹配次数（与下一战绩组选手配对） */
  downMatchCount?: number;
  /** 累计向上匹配次数（与上一战绩组选手配对） */
  upMatchCount?: number;
  /** 优先向下匹配标记（向上匹配后获得，使用后清零） */
  hasDownPriority?: boolean;
  /** 加赛胜场数（仅用于区分名次，不计入常规胜场/对手胜率等小分） */
  playoffWins?: number;
  /** 新版加赛的所属同分组；名次由完整赛程决定，不按累计胜场推断。 */
  playoffBracketId?: string;
  playoffRank?: number;
  /** 优先向上匹配标记（向下匹配后获得，使用后清零） */
  hasUpPriority?: boolean;
}

export interface Match {
  id: string;
  round: number;
  player1Id: string;
  player2Id: string;
  result: MatchResult;
  isBye?: boolean;
  /**
   * 赛前弃赛：该场比赛在实际对局开始前，其中一方选手已宣布弃赛。
   * 胜方直接获得胜场（计入个人胜率），但该场次不计入对手胜率 / 对手的对手胜率网络。
   * （与轮空不同：轮空计入对手胜率，赛前弃赛不计入）
   * - 赛前弃赛的局数据 (player1Games / player2Games) 视为未实际发生，不计局胜率。
   * - true 时 result 必须为 'player1' 或 'player2'，对应弃赛者=另一方。
   * - 弃赛者本人（败方）不记个人 losses，保持弃赛前的个人战绩不变。
   * - 与赛后弃赛等效：弃赛者本人会被自动标记 dropped=true，后续轮次不再安排任何对阵。
   *   （赛前弃赛 vs 赛后弃赛的区别仅在于入口与胜负归属：赛前弃赛有明确对阵，给对方一个胜场；
   *    赛后弃赛为选手个人手动标记，不产生新的胜负给他人。两者后续都会让选手退赛。）
   */
  preDrop?: boolean;
  player1Games?: number;
  player2Games?: number;
  /** 加赛标记：true 表示该场为加赛（用于区分常规轮次与加赛） */
  isPlayoff?: boolean;
  playoffBracketId?: string;
  playoffStage?: 1 | 2;
  playoffRole?: 'opening' | 'final' | 'placement';
  resultSource?: 'manual' | 'import' | 'referee_override';
  sourceSubmissionId?: string;
  sourceSubmittedAt?: string;
  evidenceRefs?: string[];
  evidenceHash?: string;
  evidenceVerificationStatus?: EvidenceVerificationStatus;
  evidenceVerifiedBy?: string;
  evidenceVerifiedAt?: string;
  publicResultStatus?: PublicResultStatus;
  announcedAt?: string;
  confirmationDeadlineAt?: string;
  disputedAt?: string;
  resultOverrides?: MatchResultOverride[];
  /** 固定单败签表中的首轮节点编号，用于逐轮填充胜者。 */
  bracketNodeId?: string;
}

export type PlayoffFormat = 'two' | 'three_one' | 'three_two' | 'four';
export interface PlayoffBracket {
  id: string;
  playerIds: string[];
  startRank: number;
  format: PlayoffFormat;
  waitingPlayerId?: string;
}

export type EliminationBracketSource = 'roster_order' | 'random' | 'custom';

/**
 * 固定单败签表。slots 仅保存首轮签位，后续轮次由 bracketNodeId 按固定路径晋级。
 * slots 长度为 2 的幂，null 表示轮空签位。
 */
export interface EliminationBracket {
  id: string;
  size: number;
  slots: Array<string | null>;
  source: EliminationBracketSource;
  lockedAt?: string;
}

export interface EliminationBracketViewNode {
  id: string;
  round: number;
  matchIndex: number;
  player1Id: string | null;
  player2Id: string | null;
  match?: Match;
  winnerId: string | null;
}

export interface TournamentGroup {
  id: string;
  name: string;
  currentRound: number;
  totalRounds: number;
  status: TournamentStatus;
  players: Player[];
  matches: Match[];
  createdAt: string;
  pairingType: PairingType;
  gameType: GameType;
  tiebreakTemplate?: TiebreakTemplate;
  tiebreakRules?: TiebreakRule[];
  /** 单败淘汰每轮独立赛制，下标为 round-1；未设置则回退到 gameType */
  roundGameTypes?: GameType[];
  playoffBrackets?: PlayoffBracket[];
  /** 新版固定单败签表；旧赛事没有该字段时继续使用旧流程。 */
  eliminationBracket?: EliminationBracket;
  /** 所属赛段 id；单阶段赛事没有该字段。 */
  stageId?: string;
  /** 轮数由模板固定（如突围赛只打一轮），开赛时不再按人数重算。 */
  roundsLocked?: boolean;
  /** 模板预设的选手位置数，名单由上游晋级生成且尚未落库时用于展示。 */
  plannedPlayerCount?: number;
}

/** 赛事类型：旧赛事和新建单阶段赛事都是 legacy。 */
export type CompetitionFormat = 'legacy' | 'multi_stage';

/** 专用流程标识，用于锁定模板（例如诗意杯 S3）。 */
export type CompetitionWorkflow = 'standard' | 'poetry_cup_s3';

export type AdvancementRoute = 'direct' | 'breakout' | 'breakout_direct';

/** 结构化的晋级规则：来源赛段第 fromRank-toRank 名中满足胜场条件的选手晋级。 */
export interface StageAdvancementRule {
  id: string;
  fromRank: number;
  toRank: number;
  minWins?: number;
  maxWins?: number;
  /** 晋级去向：目标赛段的 id（裁判在设置页按赛段名称选择）。 */
  targetStageId: string;
}

/** 固定签位：来源小组的第 rank 名进入目标赛段的第 targetSlot 个位置。 */
export interface StageSeedRule {
  sourceGroupName: string;
  rank: number;
  targetSlot: number;
}

/** 突围配对：来源小组内的名次两两对阵。 */
export interface StageBreakoutConfig {
  pairings: Array<[number, number]>;
}

export interface StageAdvancementSeat {
  playerId: string;
  name: string;
  participantCode?: string;
  uid?: string;
  qq?: string;
  sourceStageId: string;
  sourceGroupId: string;
  sourceGroupName: string;
  /** 在来源赛段内该小组的最终名次。 */
  finalRank: number;
  route: AdvancementRoute;
  /** 该席位写入哪个下游赛段。 */
  targetStageId?: string;
  /** 目标赛段的固定签位下标。 */
  targetSlot?: number;
  /** 小组赛阶段的名次，用于固定签位映射（跨突围赛仍保留）。 */
  originGroupName?: string;
  originRank?: number;
}

export interface StageAdvancementPairing {
  sourceGroupId: string;
  player1Id: string;
  player2Id: string;
  targetStageId?: string;
}

export interface StageAdvancementPreview {
  sourceStageId: string;
  targetStageIds: string[];
  seats: StageAdvancementSeat[];
  breakoutPairings: StageAdvancementPairing[];
  errors: string[];
  warnings: string[];
  /** 裁判改签理由，确认时写入记录。 */
  reason?: string;
}

export interface StageAdvancementRecord {
  id: string;
  sourceStageId: string;
  confirmedAt: string;
  seats: StageAdvancementSeat[];
  breakoutPairings: StageAdvancementPairing[];
  /** 裁判调整晋级时的理由。 */
  reason?: string;
}

/** 多阶段赛事中的赛段定义；单阶段赛事没有该字段。 */
export interface TournamentStage {
  id: string;
  name: string;
  order: number;
  kind: PairingType;
  groupIds: string[];
  /** 上游赛段 id，仅用于展示赛段依赖。 */
  sourceStageIds?: string[];
  /** 锁定模板赛段，界面不提供结构编辑。 */
  locked?: boolean;
  /** 该赛段的晋级规则：满足条件的结果写入下游赛段。 */
  advancementRules?: StageAdvancementRule[];
  /** 本赛段为突围赛时的配对规则。 */
  breakout?: StageBreakoutConfig;
  /** 固定签位映射，用于淘汰赛。 */
  seedRules?: StageSeedRule[];
}

export interface TournamentCompetition {
  id: string;
  name: string;
  groups: TournamentGroup[];
  currentGroupIndex: number;
  createdAt: string;
  playerSchemaId?: PlayerSchemaId;
  playerFields?: PlayerFieldDefinition[];
  rosterLockedAt?: string;
  /** 缺省视为单阶段赛事。 */
  format?: CompetitionFormat;
  /** 缺省视为通用流程。 */
  workflow?: CompetitionWorkflow;
  /** 多阶段赛事的赛段序列；单阶段赛事没有该字段。 */
  stages?: TournamentStage[];
  /** 晋级确认记录，用于复核、回退。 */
  stageAdvancements?: StageAdvancementRecord[];
}
