export type MatchResult = 'player1' | 'player2' | 'draw' | 'pending';

export type TournamentStatus = 'setup' | 'in_progress' | 'completed';

export type PairingType = 'swiss' | 'single_elimination';

export type GameType = 'bo1' | 'bo3' | 'bo5' | 'bo7';

export interface Player {
  id: string;
  name: string;
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
   */
  preDrop?: boolean;
  player1Games?: number;
  player2Games?: number;
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
  /** 单败淘汰每轮独立赛制，下标为 round-1；未设置则回退到 gameType */
  roundGameTypes?: GameType[];
}

export interface TournamentCompetition {
  id: string;
  name: string;
  groups: TournamentGroup[];
  currentGroupIndex: number;
  createdAt: string;
}
