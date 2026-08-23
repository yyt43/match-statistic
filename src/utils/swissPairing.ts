import type { Player, Match, GameType, PairingType, TournamentGroup } from '../types';

/** 配对结果：包含本轮对阵与更新后的选手状态（上下匹配标记/次数） */
export interface PairingResult {
  matches: Match[];
  updatedPlayers: Player[];
}

/** 获取某一轮的赛制，优先使用 roundGameTypes，否则回退到 gameType */
export function getRoundGameType(group: TournamentGroup, round: number): GameType {
  return group.roundGameTypes?.[round - 1] ?? group.gameType;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/** Fisher-Yates 洗牌算法，保证无偏随机 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortPlayersByRank(players: Player[], gameType: GameType = 'bo1'): Player[] {
  return [...players].sort((a, b) => {
    // 活跃 > 被淘汰 > 弃赛
    const aActive = a.dropped ? 0 : a.eliminated ? 1 : 2;
    const bActive = b.dropped ? 0 : b.eliminated ? 1 : 2;
    if (aActive !== bActive) return bActive - aActive;

    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.opponentWinRate !== a.opponentWinRate) return b.opponentWinRate - a.opponentWinRate;

    if (gameType === 'bo1') {
      if (b.opponentOpponentWinRate !== a.opponentOpponentWinRate) return b.opponentOpponentWinRate - a.opponentOpponentWinRate;
    } else {
      if (b.gameWinRate !== a.gameWinRate) return b.gameWinRate - a.gameWinRate;
      if (b.opponentGameWinRate !== a.opponentGameWinRate) return b.opponentGameWinRate - a.opponentGameWinRate;
    }

    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
  });
}

/** 单败淘汰排序：活跃 > 淘汰 > 弃赛；同状态按胜场降序，败场升序，姓名字典序 */
function sortPlayersByEliminationRank(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const aActive = a.dropped ? 0 : a.eliminated ? 1 : 2;
    const bActive = b.dropped ? 0 : b.eliminated ? 1 : 2;
    if (aActive !== bActive) return bActive - aActive;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 统一的选手排序入口（瑞士轮 + 单败淘汰）。
 * 供 store / excelExport / imageExport 共用，避免重复实现导致排名不一致。
 */
export function sortPlayers(players: Player[], gameType: GameType, pairingType: PairingType): Player[] {
  if (pairingType === 'single_elimination') {
    return sortPlayersByEliminationRank(players);
  }
  return sortPlayersByRank(players, gameType);
}

/**
 * 获取选手的战绩分组键：仅需胜场相同即归为同一战绩组。
 * 注意：这与 sortPlayersByRank 的排序指标不同——排序仍按完整排名链
 * （胜率 → 对手胜率 → 局胜率 → ...），但分组只看胜场数。
 */
function getSortKey(player: Player): string {
  const activeRank = player.dropped ? 0 : player.eliminated ? 1 : 2;
  return `${activeRank}|${player.wins}`;
}

// ===== 配对过程中的可变选手状态 =====

interface PlayerState {
  player: Player;
  playedAgainst: Set<string>;
  downMatchCount: number;
  upMatchCount: number;
  hasDownPriority: boolean;
  hasUpPriority: boolean;
  rank: number; // 本轮排序中的位置（0 = 最高排名）
}

/**
 * 规则6：如相同战绩的选手均已向上或向下匹配过，若需再次向上或向下匹配，
 * 则再赋予该组排名第一或最末的人第二次向上/向下匹配次数（重置标记与次数计数）。
 * - 向下场景：给「排名最靠后」的人重置 hasDownPriority=true + downMatchCount=0
 * - 向上场景：给「排名最靠前」的人重置 hasUpPriority=true + upMatchCount=0
 *
 * 判定"全员均已上下匹配过"：组内每人 downMatchCount+upMatchCount >= 1。
 * 通过规则6二次赋予后，该组整体状态变为「存在至少一个人是新赋予的权限」，不再满足全员条件，
 * 因此每次只会赋予一次，不会无限循环。
 */
function applyRule6Grant(group: PlayerState[], direction: 'down' | 'up'): void {
  if (group.length === 0) return;
  const allExperienced = group.every(
    s => (s.downMatchCount ?? 0) + (s.upMatchCount ?? 0) > 0,
  );
  if (!allExperienced) return;
  if (direction === 'down') {
    // 排名最靠后（rank 最大）
    const last = [...group].sort((a, b) => b.rank - a.rank)[0];
    last.hasDownPriority = true;
    last.downMatchCount = 0;
    last.hasUpPriority = false;
  } else {
    // 排名最靠前（rank 最小）
    const first = [...group].sort((a, b) => a.rank - b.rank)[0];
    first.hasUpPriority = true;
    first.upMatchCount = 0;
    first.hasDownPriority = false;
  }
}

/** 规则3：选择进入下移组的人（优先级从高到低）
 * a. 有向下标记(hasDownPriority) 优先
 * b. 向下匹配次数(downMatchCount) 最少
 * c. 排名最靠后（rank 最大）
 *
 * 前置：按规则6检测并赋予第二次向下机会。
 */
function selectDownPlayer(group: PlayerState[]): PlayerState {
  applyRule6Grant(group, 'down');
  return [...group].sort((a, b) => {
    if (a.hasDownPriority !== b.hasDownPriority) return a.hasDownPriority ? -1 : 1;
    if (a.downMatchCount !== b.downMatchCount) return a.downMatchCount - b.downMatchCount;
    return b.rank - a.rank;
  })[0];
}

/** 规则4：下移组选手与下一组1V1匹配时，选择向上匹配选手（优先级从高到低）
 * a. 有向上标记(hasUpPriority) 优先
 * b. 向上匹配次数(upMatchCount) 最少
 * c. 排名最靠前（rank 最小）
 *
 * 前置：按规则6检测并赋予第二次向上机会。
 */
function selectUpOpponent(downPlayer: PlayerState, candidates: PlayerState[]): PlayerState | null {
  applyRule6Grant(candidates, 'up');
  const available = candidates.filter(s => !downPlayer.playedAgainst.has(s.player.id));
  if (available.length === 0) return null;
  return available.sort((a, b) => {
    if (a.hasUpPriority !== b.hasUpPriority) return a.hasUpPriority ? -1 : 1;
    if (a.upMatchCount !== b.upMatchCount) return a.upMatchCount - b.upMatchCount;
    return a.rank - b.rank;
  })[0];
}

/**
 * 规则9a：对折匹配——将排序后的组对折，前半与后半一一配对。
 * 尝试多种对折方式（正常、反序、错位），只要有一种成功就使用，避免立即进入穷举。
 * 返回配对列表（成功）或 null（失败）。
 */
function tryFoldMatch(group: PlayerState[]): [PlayerState, PlayerState][] | null {
  const n = group.length;
  if (n % 2 !== 0 || n < 2) return null;
  const half = n / 2;

  // 方式1：正常对折 [0↔half, 1↔half+1, ...]
  {
    let ok = true;
    for (let i = 0; i < half; i++) {
      if (group[i].playedAgainst.has(group[i + half].player.id)) { ok = false; break; }
    }
    if (ok) {
      const pairs: [PlayerState, PlayerState][] = [];
      for (let i = 0; i < half; i++) pairs.push([group[i], group[i + half]]);
      return pairs;
    }
  }

  // 方式2：反序对折 [0↔n-1, 1↔n-2, ...]
  {
    let ok = true;
    for (let i = 0; i < half; i++) {
      if (group[i].playedAgainst.has(group[n - 1 - i].player.id)) { ok = false; break; }
    }
    if (ok) {
      const pairs: [PlayerState, PlayerState][] = [];
      for (let i = 0; i < half; i++) pairs.push([group[i], group[n - 1 - i]]);
      return pairs;
    }
  }

  // 方式3：错位对折（secondHalf 整体左移一位）[0↔half+1, 1↔half+2, ..., half-1↔half]
  if (half >= 2) {
    let ok = true;
    for (let i = 0; i < half; i++) {
      const j = half + (i + 1) % half;
      if (group[i].playedAgainst.has(group[j].player.id)) { ok = false; break; }
    }
    if (ok) {
      const pairs: [PlayerState, PlayerState][] = [];
      for (let i = 0; i < half; i++) {
        const j = half + (i + 1) % half;
        pairs.push([group[i], group[j]]);
      }
      return pairs;
    }
  }

  return null;
}

/** 规则9b：组内穷举匹配——回溯法寻找无重复对阵的两两配对方案 */
function findValidPairingStates(group: PlayerState[]): PlayerState[] | null {
  const n = group.length;
  if (n % 2 !== 0 || n < 2) return null;

  function backtrack(remaining: PlayerState[], depth: number): PlayerState[] | null {
    if (depth > 200) return null;
    if (remaining.length === 0) return [];
    if (remaining.length < 2) return null;

    const p1 = remaining[0];
    for (let i = 1; i < remaining.length; i++) {
      const p2 = remaining[i];
      if (p1.playedAgainst.has(p2.player.id)) continue;

      const rest: PlayerState[] = [];
      for (let j = 0; j < remaining.length; j++) {
        if (j !== 0 && j !== i) rest.push(remaining[j]);
      }
      const result = backtrack(rest, depth + 1);
      if (result) return [p1, p2, ...result];
    }
    return null;
  }

  return backtrack(group, 0);
}

/** 规则9+10：组内匹配——对折优先（多对折方式），失败则穷举，奇数/穷举失败则选人下移并递归 */
function matchWithinGroup(group: PlayerState[]): { pairs: [PlayerState, PlayerState][]; toDown: PlayerState[] } {
  if (group.length <= 1) {
    return { pairs: [], toDown: group };
  }

  if (group.length % 2 === 0) {
    // 对折匹配（尝试多种对折方式）
    const foldPairs = tryFoldMatch(group);
    if (foldPairs) {
      return { pairs: foldPairs, toDown: [] };
    }
    // 组内穷举
    const pairing = findValidPairingStates(group);
    if (pairing) {
      const pairs: [PlayerState, PlayerState][] = [];
      for (let i = 0; i < pairing.length; i += 2) {
        pairs.push([pairing[i], pairing[i + 1]]);
      }
      return { pairs, toDown: [] };
    }
  }

  // 奇数或穷举失败：选一人下移，剩余递归
  const downPlayer = selectDownPlayer(group);
  const rest = group.filter(s => s !== downPlayer);
  const result = matchWithinGroup(rest);
  return { pairs: result.pairs, toDown: [...result.toDown, downPlayer] };
}

/**
 * 规则10a：下移组内部优先互相匹配（不改变上下匹配标记/次数）。
 * 改用穷举回溯（复用 findValidPairingStates），最大化配对成功率，减少不必要的外溢。
 */
function matchDownPoolInternal(pool: PlayerState[]): { pairs: [PlayerState, PlayerState][]; remaining: PlayerState[] } {
  if (pool.length < 2) {
    return { pairs: [], remaining: [...pool] };
  }

  // 按排名排序，保证配对顺序稳定
  const sorted = [...pool].sort((a, b) => a.rank - b.rank);

  // 先尝试对折（最快）
  const foldPairs = tryFoldMatch(sorted);
  if (foldPairs) {
    const matchedIds = new Set<string>();
    for (const [p1, p2] of foldPairs) {
      matchedIds.add(p1.player.id);
      matchedIds.add(p2.player.id);
    }
    const remaining = sorted.filter(s => !matchedIds.has(s.player.id));
    return { pairs: foldPairs, remaining };
  }

  // 对折失败则穷举回溯
  const pairing = findValidPairingStates(sorted);
  if (pairing) {
    const pairs: [PlayerState, PlayerState][] = [];
    for (let i = 0; i < pairing.length; i += 2) {
      pairs.push([pairing[i], pairing[i + 1]]);
    }
    const matchedIds = new Set<string>();
    for (const [p1, p2] of pairs) {
      matchedIds.add(p1.player.id);
      matchedIds.add(p2.player.id);
    }
    const remaining = sorted.filter(s => !matchedIds.has(s.player.id));
    return { pairs, remaining };
  }

  // 穷举也失败：返回全部为剩余（流入下一战绩组）
  return { pairs: [], remaining: sorted };
}

function createMatch(p1: PlayerState, p2: PlayerState, round: number): Match {
  return {
    id: generateId(),
    round,
    player1Id: p1.player.id,
    player2Id: p2.player.id,
    result: 'pending',
  };
}

function getByeWins(gameType: GameType): number {
  return gameType === 'bo7' ? 4 : gameType === 'bo5' ? 3 : gameType === 'bo3' ? 2 : 1;
}

// ===== 瑞士轮主配对函数 =====

export function generateSwissPairings(
  players: Player[],
  round: number,
  gameType: GameType = 'bo1'
): PairingResult {
  const byeWins = getByeWins(gameType);
  const matches: Match[] = [];

  // 规则1：第一轮随机配对
  if (round === 1) {
    const activePool = players.filter(p => !p.dropped && !p.eliminated);
    const shuffled = shuffle(activePool);

    let byePlayer: Player | null = null;
    let pairPlayers = shuffled;
    if (shuffled.length % 2 !== 0) {
      byePlayer = shuffled[shuffled.length - 1];
      pairPlayers = shuffled.slice(0, -1);
    }

    for (let i = 0; i < pairPlayers.length; i += 2) {
      matches.push({
        id: generateId(),
        round,
        player1Id: pairPlayers[i].id,
        player2Id: pairPlayers[i + 1].id,
        result: 'pending',
      });
    }

    if (byePlayer) {
      matches.push({
        id: generateId(),
        round,
        player1Id: byePlayer.id,
        player2Id: 'bye',
        result: 'player1',
        isBye: true,
        player1Games: byeWins,
        player2Games: 0,
      });
    }

    return { matches, updatedPlayers: players };
  }

  // ===== 第2轮及以后：标准瑞士轮配对 =====
  const activePool = players.filter(p => !p.dropped && !p.eliminated);
  const sorted = sortPlayersByRank(activePool, gameType);

  // 构建可变状态
  const stateMap = new Map<string, PlayerState>();
  sorted.forEach((p, idx) => {
    stateMap.set(p.id, {
      player: p,
      playedAgainst: new Set(p.playedAgainst),
      downMatchCount: p.downMatchCount ?? 0,
      upMatchCount: p.upMatchCount ?? 0,
      hasDownPriority: p.hasDownPriority ?? false,
      hasUpPriority: p.hasUpPriority ?? false,
      rank: idx,
    });
  });

  // 按战绩分组（胜场相同的为一组）
  const scoreGroups: PlayerState[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    const key = getSortKey(sorted[i]);
    while (j + 1 < sorted.length && getSortKey(sorted[j + 1]) === key) {
      j++;
    }
    scoreGroups.push(sorted.slice(i, j + 1).map(p => stateMap.get(p.id)!));
    i = j + 1;
  }

  const allMatchedIds = new Set<string>();
  let downPool: PlayerState[] = [];

  // 从最高战绩组开始处理
  for (let gi = 0; gi < scoreGroups.length; gi++) {
    let currentGroup = scoreGroups[gi].filter(s => !allMatchedIds.has(s.player.id));

    // ===== 步骤A：处理上一组留下来的下移组 =====

    // A1. 下移组内部优先互相匹配（规则10a）
    const internalResult = matchDownPoolInternal(downPool);
    for (const [p1, p2] of internalResult.pairs) {
      matches.push(createMatch(p1, p2, round));
      allMatchedIds.add(p1.player.id);
      allMatchedIds.add(p2.player.id);
    }
    downPool = internalResult.remaining;

    // A2. 下移组与当前组1V1匹配（规则10a/10b）
    downPool.sort((a, b) => a.rank - b.rank); // 排名靠前先匹配
    const stillDown: PlayerState[] = [];
    for (const downPlayer of downPool) {
      const opponent = selectUpOpponent(downPlayer, currentGroup);
      if (opponent) {
        matches.push(createMatch(downPlayer, opponent, round));
        allMatchedIds.add(downPlayer.player.id);
        allMatchedIds.add(opponent.player.id);

        // 规则5：向下匹配→获得优先向上权利，向上匹配→获得优先向下权利，使用后清零
        downPlayer.downMatchCount += 1;
        downPlayer.hasUpPriority = true;
        downPlayer.hasDownPriority = false;

        opponent.upMatchCount += 1;
        opponent.hasDownPriority = true;
        opponent.hasUpPriority = false;

        // 从当前组移除被选中的选手
        currentGroup = currentGroup.filter(s => s !== opponent);
      } else {
        // 规则10c：下移组与当前组均无法匹配→进入下一个战绩组的下移组
        stillDown.push(downPlayer);
      }
    }
    downPool = stillDown;

    // ===== 步骤B：当前组组内匹配 =====
    currentGroup.sort((a, b) => a.rank - b.rank);
    const groupResult = matchWithinGroup(currentGroup);

    for (const [p1, p2] of groupResult.pairs) {
      matches.push(createMatch(p1, p2, round));
      allMatchedIds.add(p1.player.id);
      allMatchedIds.add(p2.player.id);
    }

    // 组内匹配剩余的进入下移组
    downPool.push(...groupResult.toDown);
  }

  // ===== 步骤C：所有组处理完，对最终下移组优先做内部互相匹配（规则10a），剩余的轮空（规则7） =====
  {
    const finalInternal = matchDownPoolInternal(downPool);
    for (const [p1, p2] of finalInternal.pairs) {
      matches.push(createMatch(p1, p2, round));
    }
    downPool = finalInternal.remaining;
  }
  for (const p of downPool) {
    matches.push({
      id: generateId(),
      round,
      player1Id: p.player.id,
      player2Id: 'bye',
      result: 'player1',
      isBye: true,
      player1Games: byeWins,
      player2Games: 0,
    });
  }

  // 构建更新后的选手列表（带回更新后的标记/次数）
  const updatedPlayers = players.map(p => {
    const st = stateMap.get(p.id);
    if (!st) return p;
    return {
      ...p,
      downMatchCount: st.downMatchCount,
      upMatchCount: st.upMatchCount,
      hasDownPriority: st.hasDownPriority,
      hasUpPriority: st.hasUpPriority,
    };
  });

  return { matches, updatedPlayers };
}

// 通用配对函数，根据 pairingType 选择配对算法
export function generatePairings(
  players: Player[],
  round: number,
  gameType: GameType,
  pairingType: PairingType,
  allMatches: Match[]
): PairingResult {
  if (pairingType === 'single_elimination') {
    const matches = generateSingleEliminationPairings(players, round, gameType, allMatches);
    return { matches, updatedPlayers: players };
  }
  return generateSwissPairings(players, round, gameType);
}

// ===== 胜率计算 =====

function calculateWinRate(player: Player): number {
  const total = player.wins + player.losses;
  if (total === 0) return 0;
  return player.wins / total;
}

function calculateGameWinRate(player: Player): number {
  if (player.totalGames === 0) return 0;
  return player.wonGames / player.totalGames;
}

export function calculateAllWinRates(
  players: Player[],
  matches: Match[],
  gameType: GameType = 'bo1'
): Player[] {
  const playerMap = new Map(players.map(p => [p.id, { ...p }]));
  const BYE_ID = '__bye_virtual__';
  // 规则8：轮空视为一场有效比赛，需要计入对手胜率、本人局胜率等小分统计。
  // 'bye' 被当作一个虚拟对手：其胜场=0、场次=1、胜局=0、总局=该轮次BYE比分总和（如 BO3=2-0 → 总局=2）
  // 赛前弃赛（preDrop）：与轮空相反——胜方计入个人胜场，但该场次从对手胜率网络中整体剔除。

  // ---- 0. 计算每位选手的"有效战绩"（仅非赛前弃赛的场次计入对手SOS/SOSOS/对手局胜率网络）----
  const effWins = new Map<string, number>();
  const effLosses = new Map<string, number>();
  const effWonGames = new Map<string, number>();
  const effTotalGames = new Map<string, number>();
  for (const pid of playerMap.keys()) {
    effWins.set(pid, 0);
    effLosses.set(pid, 0);
    effWonGames.set(pid, 0);
    effTotalGames.set(pid, 0);
  }
  for (const match of matches) {
    if (match.result === 'pending') continue;
    if (match.preDrop) continue; // 赛前弃赛：该场整体不计入对手胜率网络
    if (match.isBye) {
      // BYE：胜方真实个人的有效场次仍计入（BYE是虚拟对手，规则8）
      const w = effWins.get(match.player1Id);
      const l = effLosses.get(match.player1Id);
      if (match.result === 'player1') {
        if (w !== undefined) effWins.set(match.player1Id, w + 1);
      } else {
        if (l !== undefined) effLosses.set(match.player1Id, l + 1);
      }
      if (match.player1Games !== undefined && match.player2Games !== undefined) {
        const wg = effWonGames.get(match.player1Id)!;
        const tg = effTotalGames.get(match.player1Id)!;
        effWonGames.set(match.player1Id, wg + match.player1Games);
        effTotalGames.set(match.player1Id, tg + match.player1Games + match.player2Games);
      }
    } else {
      const w1 = effWins.get(match.player1Id);
      const w2 = effWins.get(match.player2Id);
      const l1 = effLosses.get(match.player1Id);
      const l2 = effLosses.get(match.player2Id);
      if (match.result === 'player1') {
        if (w1 !== undefined) effWins.set(match.player1Id, w1 + 1);
        if (l2 !== undefined) effLosses.set(match.player2Id, l2 + 1);
      } else if (match.result === 'player2') {
        if (w2 !== undefined) effWins.set(match.player2Id, w2 + 1);
        if (l1 !== undefined) effLosses.set(match.player1Id, l1 + 1);
      } else if (match.result === 'draw') {
        if (l1 !== undefined) effLosses.set(match.player1Id, l1 + 1);
        if (l2 !== undefined) effLosses.set(match.player2Id, l2 + 1);
      }
      if (match.player1Games !== undefined && match.player2Games !== undefined) {
        const wg1 = effWonGames.get(match.player1Id)!;
        const tg1 = effTotalGames.get(match.player1Id)!;
        const wg2 = effWonGames.get(match.player2Id)!;
        const tg2 = effTotalGames.get(match.player2Id)!;
        effWonGames.set(match.player1Id, wg1 + match.player1Games);
        effTotalGames.set(match.player1Id, tg1 + match.player1Games + match.player2Games);
        effWonGames.set(match.player2Id, wg2 + match.player2Games);
        effTotalGames.set(match.player2Id, tg2 + match.player1Games + match.player2Games);
      }
    }
  }

  // ---- 1. 个人胜率 / 个人局胜率 ----
  for (const player of playerMap.values()) {
    player.winRate = calculateWinRate(player);
    player.gameWinRate = calculateGameWinRate(player);
  }

  // ---- 2. 构建对手索引：playerId → Set<对手Id> ----
  // 轮空对阵加入虚拟对手 BYE_ID（规则8）；赛前弃赛对阵不加（视为未有效交手，不入对手网络）；其余正常加。
  const opponentIdsByPlayer = new Map<string, Set<string>>();
  for (const player of playerMap.values()) {
    opponentIdsByPlayer.set(player.id, new Set());
  }
  for (const match of matches) {
    if (match.result === 'pending') continue;
    if (match.preDrop) continue; // 赛前弃赛：不入对手索引
    if (match.isBye) {
      opponentIdsByPlayer.get(match.player1Id)?.add(BYE_ID);
    } else {
      opponentIdsByPlayer.get(match.player1Id)?.add(match.player2Id);
      opponentIdsByPlayer.get(match.player2Id)?.add(match.player1Id);
    }
  }

  // ---- 3. 对手胜率 SOS（聚合公式：Σ对手有效胜场 / Σ对手有效总场次）----
  // 使用有效战绩（扣掉赛前弃赛场次），弃赛选手自然因场次少而降权。
  for (const player of playerMap.values()) {
    const opponentIds = opponentIdsByPlayer.get(player.id);
    if (!opponentIds || opponentIds.size === 0) {
      player.opponentWinRate = 0;
      continue;
    }
    let sumWins = 0;
    let sumGames = 0;
    for (const oid of opponentIds) {
      if (oid === BYE_ID) {
        // 轮空虚拟对手：0 胜，1 场
        sumWins += 0;
        sumGames += 1;
      } else {
        const ow = effWins.get(oid);
        const ol = effLosses.get(oid);
        if (ow === undefined || ol === undefined) continue;
        sumWins += ow;
        sumGames += ow + ol;
      }
    }
    player.opponentWinRate = sumGames === 0 ? 0 : sumWins / sumGames;
  }

  // ---- 4. 对手对手胜率 SOSOS（聚合公式：Σ对手的对手有效胜场 / Σ对手的对手有效总场次）----
  for (const player of playerMap.values()) {
    const opponentIds = opponentIdsByPlayer.get(player.id);
    if (!opponentIds || opponentIds.size === 0) {
      player.opponentOpponentWinRate = 0;
      continue;
    }
    let sumWins = 0;
    let sumGames = 0;
    for (const oid of opponentIds) {
      if (oid === BYE_ID) {
        // BYE 的"对手们"贡献一场 0 胜 1 负
        sumWins += 0;
        sumGames += 1;
      } else {
        const ooIds = opponentIdsByPlayer.get(oid);
        if (!ooIds) continue;
        for (const ooid of ooIds) {
          if (ooid === BYE_ID) {
            sumWins += 0;
            sumGames += 1;
          } else {
            const ow = effWins.get(ooid);
            const ol = effLosses.get(ooid);
            if (ow === undefined || ol === undefined) continue;
            sumWins += ow;
            sumGames += ow + ol;
          }
        }
      }
    }
    player.opponentOpponentWinRate = sumGames === 0 ? 0 : sumWins / sumGames;
  }

  // ---- 5. 对手局胜率（仅非 BO1 赛制，聚合公式：Σ对手有效胜局 / Σ对手有效总局）----
  // BYE 虚拟对手的局贡献直接取自该 BYE 场；赛前弃赛 match 跳过。
  if (gameType !== 'bo1') {
    const accWon = new Map<string, number>();
    const accTotal = new Map<string, number>();
    for (const pid of playerMap.keys()) {
      accWon.set(pid, 0);
      accTotal.set(pid, 0);
    }
    for (const match of matches) {
      if (match.result === 'pending') continue;
      if (match.preDrop) continue; // 赛前弃赛：实际对局未发生，不参与对手局胜率累加
      if (match.isBye) {
        // BYE = player2，用本场比分决定 BYE 的"局战绩"
        const byeWon = match.player2Games || 0;
        const byeTotal = (match.player1Games || 0) + (match.player2Games || 0);
        const w1 = accWon.get(match.player1Id);
        const t1 = accTotal.get(match.player1Id);
        if (w1 !== undefined) accWon.set(match.player1Id, w1 + byeWon);
        if (t1 !== undefined) accTotal.set(match.player1Id, t1 + byeTotal);
      } else {
        // 真实对战：双方互相把对手的【有效】局战绩计入自己的"对手局胜率"累加器
        const wg1 = effWonGames.get(match.player1Id);
        const tg1 = effTotalGames.get(match.player1Id);
        const wg2 = effWonGames.get(match.player2Id);
        const tg2 = effTotalGames.get(match.player2Id);
        if (wg1 !== undefined && tg1 !== undefined && wg2 !== undefined && tg2 !== undefined) {
          // p1 的对手是 p2 → 用 p2 的有效局战绩
          const w1 = accWon.get(match.player1Id)!;
          const t1 = accTotal.get(match.player1Id)!;
          accWon.set(match.player1Id, w1 + wg2);
          accTotal.set(match.player1Id, t1 + tg2);
          // p2 的对手是 p1 → 用 p1 的有效局战绩
          const w2 = accWon.get(match.player2Id)!;
          const t2 = accTotal.get(match.player2Id)!;
          accWon.set(match.player2Id, w2 + wg1);
          accTotal.set(match.player2Id, t2 + tg1);
        }
      }
    }
    for (const [pid, player] of playerMap) {
      const t = accTotal.get(pid) || 0;
      player.opponentGameWinRate = t === 0 ? 0 : (accWon.get(pid) || 0) / t;
    }
  }

  return Array.from(playerMap.values());
}

export function getRankedPlayers(players: Player[], gameType: GameType = 'bo1', pairingType: PairingType = 'swiss'): Player[] {
  return sortPlayers(players, gameType, pairingType);
}

// ===== 单败淘汰制 =====

export function getSingleEliminationRounds(playerCount: number): number {
  return Math.ceil(Math.log2(playerCount));
}

export function generateSingleEliminationPairings(
  players: Player[],
  round: number,
  gameType: GameType,
  allMatches: Match[]
): Match[] {
  const matches: Match[] = [];
  const byeWins = getByeWins(gameType);

  if (round === 1) {
    const activePlayers = players.filter(p => !p.dropped && !p.eliminated);
    const shuffled = shuffle(activePlayers);

    let byePlayer: Player | null = null;
    let pairPlayers = shuffled;

    if (shuffled.length % 2 !== 0) {
      byePlayer = shuffled[shuffled.length - 1];
      pairPlayers = shuffled.slice(0, -1);
    }

    for (let i = 0; i < pairPlayers.length; i += 2) {
      matches.push({
        id: generateId(),
        round,
        player1Id: pairPlayers[i].id,
        player2Id: pairPlayers[i + 1].id,
        result: 'pending',
      });
    }

    if (byePlayer) {
      matches.push({
        id: generateId(),
        round,
        player1Id: byePlayer.id,
        player2Id: 'bye',
        result: 'player1',
        isBye: true,
        player1Games: byeWins,
        player2Games: 0,
      });
    }
  } else {
    const prevRoundMatches = allMatches.filter(m => m.round === round - 1);
    const winners: string[] = [];

    for (const match of prevRoundMatches) {
      if (match.result === 'pending') continue;
      if (match.isBye) {
        winners.push(match.player1Id);
      } else if (match.result === 'player1') {
        winners.push(match.player1Id);
      } else if (match.result === 'player2') {
        winners.push(match.player2Id);
      }
    }

    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 >= winners.length) {
        matches.push({
          id: generateId(),
          round,
          player1Id: winners[i],
          player2Id: 'bye',
          result: 'player1',
          isBye: true,
          player1Games: byeWins,
          player2Games: 0,
        });
      } else {
        matches.push({
          id: generateId(),
          round,
          player1Id: winners[i],
          player2Id: winners[i + 1],
          result: 'pending',
        });
      }
    }
  }

  return matches;
}

export function getWinRate(player: Player): number {
  return player.winRate;
}

export function createPlayersFromNames(playerNames: string[]): Player[] {
  return playerNames.map((name, index) => ({
    id: generateId(),
    name: name.trim(),
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
    previousRank: index + 1,
    dropped: false,
    eliminated: false,
    downMatchCount: 0,
    upMatchCount: 0,
    hasDownPriority: false,
    hasUpPriority: false,
  }));
}
