import type {
  EliminationBracket,
  EliminationBracketViewNode,
  GameType,
  Match,
  Player,
  TournamentGroup,
} from '../types';
import { getPlayerDisplayName } from './playerProfiles';
import type { AppLanguage } from '../i18n/data';

export interface EliminationBracketRoundView {
  round: number;
  nodes: EliminationBracketViewNode[];
}

export interface EliminationBracketView {
  rounds: EliminationBracketRoundView[];
  championId?: string;
}

const generateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 11);

export function getEliminationBracketSize(playerCount: number): number {
  if (playerCount <= 1) return 0;
  return 2 ** Math.ceil(Math.log2(playerCount));
}

export function getEliminationBracketRounds(size: number): number {
  return size <= 1 ? 0 : Math.log2(size);
}

export function getEliminationByeWins(gameType: GameType): number {
  if (gameType === 'bo7') return 4;
  if (gameType === 'bo5') return 3;
  if (gameType === 'bo3') return 2;
  return 1;
}

function shuffle<T>(values: T[]): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function getPairCount(size: number): number {
  return Math.floor(size / 2);
}

/** 同一参赛身份（id / 编号 / UID / 昵称+QQ 任一相同）只保留一次，避免签位重复。 */
function dedupePlayers(players: Player[]): Player[] {
  const seen = new Set<string>();
  const unique: Player[] = [];
  for (const player of players) {
    const keys = [
      player.id ? `id:${player.id}` : '',
      player.participantCode?.trim() ? `code:${player.participantCode.trim()}` : '',
      player.profile?.uid?.trim() ? `uid:${player.profile.uid.trim()}` : '',
      player.name?.trim() ? `name:${player.name.trim()}#${player.profile?.qq?.trim() ?? ''}` : '',
    ].filter(Boolean);
    if (keys.some(key => seen.has(key))) continue;
    keys.forEach(key => seen.add(key));
    unique.push(player);
  }
  return unique;
}

function fillSlotLayout(
  size: number,
  byePairIndices: Set<number>,
  players: Player[]
): Array<string | null> {
  const slots: Array<string | null> = [];
  let playerIndex = 0;

  for (let matchIndex = 0; matchIndex < getPairCount(size); matchIndex += 1) {
    if (byePairIndices.has(matchIndex)) {
      slots.push(players[playerIndex]?.id ?? null, null);
      playerIndex += 1;
    } else {
      slots.push(players[playerIndex]?.id ?? null, players[playerIndex + 1]?.id ?? null);
      playerIndex += 2;
    }
  }

  return slots;
}

function chooseRandomByePairIndices(size: number, byeCount: number): Set<number> {
  const pairIndices = shuffle(Array.from({ length: getPairCount(size) }, (_, index) => index));
  return new Set(pairIndices.slice(0, byeCount));
}

export function createOrderedEliminationBracket(players: Player[]): EliminationBracket {
  const uniquePlayers = dedupePlayers(players);
  const size = getEliminationBracketSize(uniquePlayers.length);
  const byeCount = Math.max(0, size - uniquePlayers.length);
  const byePairIndices = new Set(Array.from({ length: byeCount }, (_, index) => index));

  return {
    id: `elimination-${generateId()}`,
    size,
    slots: size > 0 ? fillSlotLayout(size, byePairIndices, uniquePlayers) : [],
    source: 'roster_order',
  };
}

export function createRandomEliminationBracket(players: Player[]): EliminationBracket {
  const uniquePlayers = dedupePlayers(players);
  const size = getEliminationBracketSize(uniquePlayers.length);
  if (size === 0) {
    return { id: `elimination-${generateId()}`, size: 0, slots: [], source: 'random' };
  }

  const byeCount = Math.max(0, size - uniquePlayers.length);
  return {
    id: `elimination-${generateId()}`,
    size,
    slots: fillSlotLayout(size, chooseRandomByePairIndices(size, byeCount), shuffle(uniquePlayers)),
    source: 'random',
  };
}

export function createCustomEliminationBracket(
  bracket: EliminationBracket,
  slots: Array<string | null>
): EliminationBracket {
  return { ...bracket, slots: [...slots], source: 'custom' };
}

export function setEliminationBracketSlots(
  bracket: EliminationBracket,
  slots: Array<string | null>
): EliminationBracket {
  return createCustomEliminationBracket(bracket, slots);
}

export function validateEliminationBracket(
  bracket: EliminationBracket,
  players: Player[]
): string | null {
  const expectedSize = getEliminationBracketSize(players.length);
  if (expectedSize < 2) return 'At least two players are required.';
  if (
    !Number.isInteger(bracket.size)
    || bracket.size < 2
    || (bracket.size & (bracket.size - 1)) !== 0
  ) {
    return 'Bracket size must be a power of two.';
  }
  if (bracket.size !== expectedSize) return 'Bracket size does not match the player count.';
  if (bracket.slots.length !== bracket.size) return 'Bracket slot count is invalid.';

  const playerIds = new Set(players.map(player => player.id));
  const seen = new Set<string>();
  let playerCount = 0;

  for (const playerId of bracket.slots) {
    if (playerId === null) continue;
    if (!playerIds.has(playerId)) return 'Bracket contains an unknown player.';
    if (seen.has(playerId)) return 'A player cannot appear more than once in the bracket.';
    seen.add(playerId);
    playerCount += 1;
  }

  if (playerCount !== players.length) return 'Every player must appear exactly once in the bracket.';
  for (let index = 0; index < bracket.slots.length; index += 2) {
    if (bracket.slots[index] === null && bracket.slots[index + 1] === null) {
      return 'A bye cannot face another bye.';
    }
  }
  return null;
}

export function swapEliminationBracketSlots(
  bracket: EliminationBracket,
  firstIndex: number,
  secondIndex: number
): EliminationBracket {
  if (
    firstIndex < 0
    || secondIndex < 0
    || firstIndex >= bracket.slots.length
    || secondIndex >= bracket.slots.length
    || firstIndex === secondIndex
  ) {
    return bracket;
  }

  const slots = [...bracket.slots];
  [slots[firstIndex], slots[secondIndex]] = [slots[secondIndex], slots[firstIndex]];
  return createCustomEliminationBracket(bracket, slots);
}

export function assignEliminationBracketSlot(
  bracket: EliminationBracket,
  slotIndex: number,
  playerId: string | null
): EliminationBracket {
  if (slotIndex < 0 || slotIndex >= bracket.slots.length) return bracket;
  const slots = [...bracket.slots];
  const existingIndex = playerId ? slots.indexOf(playerId) : -1;

  if (playerId && existingIndex >= 0 && existingIndex !== slotIndex) {
    [slots[slotIndex], slots[existingIndex]] = [slots[existingIndex], slots[slotIndex]];
  } else {
    slots[slotIndex] = playerId;
  }
  return createCustomEliminationBracket(bracket, slots);
}

/**
 * Assigns a player to a slot while preserving the original slot order for
 * the displaced player. When that player's old slot is occupied, the occupant
 * moves into the old slot instead of being silently dropped.
 */
export function assignEliminationBracketPlayer(
  bracket: EliminationBracket,
  slotIndex: number,
  playerId: string
): EliminationBracket {
  if (slotIndex < 0 || slotIndex >= bracket.slots.length) return bracket;
  const targetIndex = bracket.slots.indexOf(playerId);
  if (targetIndex === slotIndex) return bracket;

  const slots = [...bracket.slots];
  if (targetIndex >= 0) {
    [slots[slotIndex], slots[targetIndex]] = [slots[targetIndex], slots[slotIndex]];
    return createCustomEliminationBracket(bracket, slots);
  }

  const displaced = slots[slotIndex];
  slots[slotIndex] = playerId;
  if (displaced) {
    const emptyIndex = slots.findIndex((slot, index) => index !== slotIndex && slot === null);
    if (emptyIndex >= 0) slots[emptyIndex] = displaced;
  }
  return createCustomEliminationBracket(bracket, slots);
}

export function setEliminationBracketSlotToBye(
  bracket: EliminationBracket,
  slotIndex: number
): EliminationBracket {
  if (
    slotIndex < 0
    || slotIndex >= bracket.slots.length
    || bracket.slots[slotIndex] === null
  ) {
    return bracket;
  }
  const slots = [...bracket.slots];
  slots[slotIndex] = null;
  return createCustomEliminationBracket(bracket, slots);
}

export function getBracketNodeId(round: number, matchIndex: number): string {
  return `r${round}-m${matchIndex}`;
}

function getBracketNodeMatchIndex(match: Match): number {
  const matchIndex = match.bracketNodeId?.split('-m')[1];
  const parsed = Number(matchIndex);
  return Number.isInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function sortBracketMatches(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return getBracketNodeMatchIndex(a) - getBracketNodeMatchIndex(b);
  });
}

export function getEliminationWinner(match: Match): string | null {
  if (match.isBye) return match.player1Id !== 'bye' ? match.player1Id : null;
  if (match.result === 'player1') return match.player1Id;
  if (match.result === 'player2') return match.player2Id;
  return null;
}

function getMatchForNode(group: TournamentGroup, nodeId: string): Match | undefined {
  return group.matches.find(match => match.bracketNodeId === nodeId);
}

function getRoundNodeCount(size: number, round: number): number {
  return size / (2 ** round);
}

function getPreviousRoundWinner(
  group: TournamentGroup,
  round: number,
  matchIndex: number
): string | null {
  if (round <= 1) return null;
  const previousNode = getMatchForNode(group, getBracketNodeId(round - 1, matchIndex));
  return previousNode ? getEliminationWinner(previousNode) : null;
}

export function getEliminationBracketView(group: TournamentGroup): EliminationBracketView {
  const bracket = group.eliminationBracket;
  if (!bracket || bracket.size < 2) return { rounds: [] };
  const rounds: EliminationBracketRoundView[] = [];

  for (let round = 1; round <= getEliminationBracketRounds(bracket.size); round += 1) {
    const nodes: EliminationBracketViewNode[] = [];
    for (let matchIndex = 0; matchIndex < getRoundNodeCount(bracket.size, round); matchIndex += 1) {
      const nodeId = getBracketNodeId(round, matchIndex);
      const match = getMatchForNode(group, nodeId);
      if (round === 1) {
        const first = bracket.slots[matchIndex * 2] ?? null;
        const secondSlot = bracket.slots[matchIndex * 2 + 1] ?? null;
        nodes.push({
          id: nodeId,
          round,
          matchIndex,
          player1Id: first,
          // 历史数据里同一签位重复时按轮空显示，绝不显示自己打自己。
          player2Id: secondSlot === first ? null : secondSlot,
          match,
          winnerId: match ? getEliminationWinner(match) : null,
        });
      } else {
        const first = getPreviousRoundWinner(group, round, matchIndex * 2);
        const second = getPreviousRoundWinner(group, round, matchIndex * 2 + 1);
        nodes.push({
          id: nodeId,
          round,
          matchIndex,
          player1Id: first,
          player2Id: second === first ? null : second,
          match,
          winnerId: match ? getEliminationWinner(match) : null,
        });
      }
    }
    rounds.push({ round, nodes });
  }

  const finalRound = rounds[rounds.length - 1];
  return {
    rounds,
    championId: finalRound?.nodes[0]?.winnerId ?? undefined,
  };
}

export interface EliminationBracketExportRow {
  round: number;
  matchIndex: number;
  player1Name: string;
  player1Code: string;
  player1Uid: string;
  player2Name: string;
  player2Code: string;
  player2Uid: string;
  score: string;
  winnerName: string;
  status: string;
}

function getExportPlayerMeta(
  player: Player | undefined,
  language: AppLanguage
): { name: string; code: string; uid: string } {
  if (!player) {
    return {
      name: language === 'en' ? 'TBD' : '待定',
      code: '',
      uid: '',
    };
  }
  return {
    name: getPlayerDisplayName(player),
    code: player.participantCode?.trim() ?? '',
    uid: player.profile?.uid?.trim() ?? '',
  };
}

export function buildEliminationBracketExportRows(
  group: TournamentGroup,
  language: AppLanguage = 'zh'
): EliminationBracketExportRow[] {
  const fullView = getEliminationBracketView(group);
  const view = { rounds: getVisibleBracketRounds(group, fullView.rounds) };
  const playerMap = new Map(group.players.map(player => [player.id, player]));
  const rows: EliminationBracketExportRow[] = [];

  for (const round of view.rounds) {
    for (const node of round.nodes) {
      const first = node.player1Id ? getExportPlayerMeta(playerMap.get(node.player1Id), language) : null;
      const second = node.player2Id ? getExportPlayerMeta(playerMap.get(node.player2Id), language) : null;
      const match = node.match;
      const isBye = !!match?.isBye;
      const score = !match || match.result === 'pending'
        ? (language === 'en' ? 'VS' : 'VS')
        : match.player1Games !== undefined && match.player2Games !== undefined
          ? `${match.player1Games}-${match.player2Games}`
          : '';
      const winner = node.winnerId ? getExportPlayerMeta(playerMap.get(node.winnerId), language).name : '';
      const status = isBye
        ? (language === 'en' ? 'Bye' : '轮空')
        : !match
          ? (language === 'en' ? 'Not generated' : '未生成')
          : match.result === 'pending'
            ? (language === 'en' ? 'Pending' : '待进行')
            : match.preDrop
              ? (language === 'en' ? 'Forfeit' : '弃权')
              : (language === 'en' ? 'Completed' : '已完成');

      rows.push({
        round: round.round,
        matchIndex: node.matchIndex,
        player1Name: first?.name ?? (language === 'en' ? 'TBD' : '待定'),
        player1Code: first?.code ?? '',
        player1Uid: first?.uid ?? '',
        player2Name: second?.name ?? (isBye ? (language === 'en' ? 'Bye' : '轮空') : (language === 'en' ? 'TBD' : '待定')),
        player2Code: second?.code ?? '',
        player2Uid: second?.uid ?? '',
        score,
        winnerName: winner,
        status,
      });
    }
  }

  return rows;
}

/**
 * 界面与导出共用的可见轮次：按赛段设置的轮数显示，且不超过已经生成的轮次。
 */
export function getVisibleBracketRounds<T>(group: TournamentGroup, rounds: T[]): T[] {
  if (rounds.length === 0) return rounds;
  const configured = group.totalRounds > 0 ? group.totalRounds : rounds.length;
  return rounds.slice(0, Math.max(1, Math.min(rounds.length, configured)));
}

export function createEliminationFirstRoundMatches(
  group: TournamentGroup,
  bracket: EliminationBracket
): Match[] {
  const byeWins = getEliminationByeWins(group.roundGameTypes?.[0] ?? group.gameType);
  const matches: Match[] = [];

  for (let matchIndex = 0; matchIndex < bracket.size / 2; matchIndex += 1) {
    const first = bracket.slots[matchIndex * 2];
    const second = bracket.slots[matchIndex * 2 + 1];
    if (!first && !second) continue;

    const nodeId = getBracketNodeId(1, matchIndex);
    if (first && second && first !== second) {
      matches.push({
        id: `elimination-${generateId()}`,
        round: 1,
        player1Id: first,
        player2Id: second,
        result: 'pending',
        bracketNodeId: nodeId,
      });
    } else {
      // 同一选手重复占位时按轮空处理，避免生成自己打自己的场次。
      const playerId = first ?? second!;
      matches.push({
        id: `elimination-${generateId()}`,
        round: 1,
        player1Id: playerId,
        player2Id: 'bye',
        result: 'player1',
        isBye: true,
        player1Games: byeWins,
        player2Games: 0,
        bracketNodeId: nodeId,
      });
    }
  }
  return matches;
}

export function createEliminationNextRoundMatches(
  group: TournamentGroup,
  round: number
): Match[] {
  const bracket = group.eliminationBracket;
  if (!bracket || round <= 1 || round > getEliminationBracketRounds(bracket.size)) return [];

  const previousRoundMatches = sortBracketMatches(
    group.matches.filter(match => match.round === round - 1)
  );
  if (
    previousRoundMatches.length === 0
    || previousRoundMatches.some(match => match.result === 'pending')
  ) {
    return [];
  }

  const matches: Match[] = [];
  for (let matchIndex = 0; matchIndex < previousRoundMatches.length / 2; matchIndex += 1) {
    const first = getEliminationWinner(previousRoundMatches[matchIndex * 2]);
    const second = getEliminationWinner(previousRoundMatches[matchIndex * 2 + 1]);
    if (!first || !second) continue;
    if (first === second) {
      // 防御重复签位导致的首轮自战：同一选手只能拿到一个轮空晋级位。
      matches.push({
        id: `elimination-${generateId()}`,
        round,
        player1Id: first,
        player2Id: 'bye',
        result: 'player1',
        isBye: true,
        player1Games: getEliminationByeWins(group.roundGameTypes?.[round - 1] ?? group.gameType),
        player2Games: 0,
        bracketNodeId: getBracketNodeId(round, matchIndex),
      });
      continue;
    }

    matches.push({
      id: `elimination-${generateId()}`,
      round,
      player1Id: first,
      player2Id: second,
      result: 'pending',
      bracketNodeId: getBracketNodeId(round, matchIndex),
    });
  }
  return matches;
}

export function getDownstreamBracketMatches(group: TournamentGroup, round: number): Match[] {
  return sortBracketMatches(
    group.matches.filter(match => !!match.bracketNodeId && match.round > round)
  );
}

export function hasPlayedDownstreamBracketMatches(
  group: TournamentGroup,
  round: number
): boolean {
  return getDownstreamBracketMatches(group, round).some(match => match.result !== 'pending');
}

export function hasFutureBracketMatches(
  group: TournamentGroup,
  round: number
): boolean {
  return getDownstreamBracketMatches(group, round).length > 0;
}

export function rebuildEliminationMatchesAfterResult(
  group: TournamentGroup,
  round: number
): Match[] {
  const bracket = group.eliminationBracket;
  if (!bracket) return group.matches;

  const keptMatches = group.matches.filter(match =>
    !match.bracketNodeId || match.round <= round
  );
  const rebuiltMatches = [...keptMatches];
  const totalRounds = getEliminationBracketRounds(bracket.size);

  for (let nextRound = round + 1; nextRound <= totalRounds; nextRound += 1) {
    const nextMatches = createEliminationNextRoundMatches(
      { ...group, matches: rebuiltMatches },
      nextRound
    );
    if (nextMatches.length === 0) break;
    rebuiltMatches.push(...nextMatches);
  }

  return rebuiltMatches;
}
