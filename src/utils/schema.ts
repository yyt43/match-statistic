import type { TournamentCompetition } from '../types';

const GAME_TYPES = new Set(['bo1', 'bo3', 'bo5', 'bo7']);
const PAIRING_TYPES = new Set(['swiss', 'single_elimination']);
const STATUSES = new Set(['setup', 'in_progress', 'completed']);
const RESULTS = new Set(['player1', 'player2', 'draw', 'pending']);
const PLAYOFF_FORMATS = new Set(['two', 'three_one', 'three_two', 'four']);
const PLAYOFF_ROLES = new Set(['opening', 'final', 'placement']);

export type CompetitionSchemaResult =
  | { success: true; data: TournamentCompetition }
  | { success: false; message: string };

export function validateCompetitionData(value: unknown): CompetitionSchemaResult {
  const errors: string[] = [];
  const competition = asRecord(value);
  if (!competition) return failure('root: expected object');

  requireString(competition, 'id', 'root.id', errors);
  requireString(competition, 'name', 'root.name', errors);
  requireString(competition, 'createdAt', 'root.createdAt', errors);

  if (!Array.isArray(competition.groups) || competition.groups.length === 0) {
    errors.push('root.groups: expected a non-empty array');
  } else {
    competition.groups.forEach((group, index) => validateGroup(group, `groups.${index}`, errors));
    requireIntegerRange(
      competition,
      'currentGroupIndex',
      'root.currentGroupIndex',
      0,
      competition.groups.length - 1,
      errors
    );
    validateUniqueIds(competition.groups, 'root.groups', errors);
  }

  return errors.length > 0 ? failure(errors.slice(0, 8).join('; ')) : {
    success: true,
    data: competition as unknown as TournamentCompetition,
  };
}

function validateGroup(value: unknown, path: string, errors: string[]): void {
  const group = asRecord(value);
  if (!group) {
    errors.push(`${path}: expected object`);
    return;
  }

  requireString(group, 'id', `${path}.id`, errors);
  requireString(group, 'name', `${path}.name`, errors);
  requireIntegerRange(group, 'totalRounds', `${path}.totalRounds`, 1, 20, errors);
  const totalRounds = typeof group.totalRounds === 'number' && Number.isInteger(group.totalRounds)
    ? group.totalRounds
    : 0;
  requireIntegerRange(group, 'currentRound', `${path}.currentRound`, 0, totalRounds, errors);
  requireString(group, 'createdAt', `${path}.createdAt`, errors);
  requireEnum(group, 'status', STATUSES, `${path}.status`, errors);
  requireEnum(group, 'pairingType', PAIRING_TYPES, `${path}.pairingType`, errors);
  requireEnum(group, 'gameType', GAME_TYPES, `${path}.gameType`, errors);

  validateArray(group, 'players', `${path}.players`, errors, validatePlayer);
  validateArray(group, 'matches', `${path}.matches`, errors, validateMatch);

  if (group.roundGameTypes !== undefined) {
    if (!Array.isArray(group.roundGameTypes)
      || !group.roundGameTypes.every(value => typeof value === 'string' && GAME_TYPES.has(value))
      || (totalRounds > 0 && group.roundGameTypes.length !== totalRounds)) {
      errors.push(`${path}.roundGameTypes: expected ${totalRounds} valid game types`);
    }
  }

  if (group.playoffBrackets !== undefined) {
    validateArray(group, 'playoffBrackets', `${path}.playoffBrackets`, errors, validatePlayoffBracket);
  }

  const playerRecords = asObjectArray(group.players);
  const playerIds = validateUniqueIds(playerRecords, `${path}.players`, errors);
  const matchRecords = asObjectArray(group.matches);
  validateUniqueIds(matchRecords, `${path}.matches`, errors);
  const bracketRecords = asObjectArray(group.playoffBrackets);
  const bracketIds = validateUniqueIds(bracketRecords, `${path}.playoffBrackets`, errors);

  for (const player of playerRecords) {
    validatePlayerStats(player, path, errors);
    if (typeof player.playoffBracketId === 'string' && !bracketIds.has(player.playoffBracketId)) {
      errors.push(`${path}.players.${String(player.id)}.playoffBracketId: unknown bracket reference`);
    }
    const playedAgainst = player.playedAgainst;
    if (Array.isArray(playedAgainst)) {
      for (let index = 0; index < playedAgainst.length; index++) {
        const opponentId = playedAgainst[index];
        if (typeof opponentId !== 'string' || (opponentId !== 'bye' && !playerIds.has(opponentId))) {
          errors.push(`${path}.players.${String(player.id)}.playedAgainst.${index}: unknown player reference`);
        }
      }
    }
  }

  for (const bracket of bracketRecords) {
    if (!Array.isArray(bracket.playerIds)) continue;
    for (const playerId of bracket.playerIds) {
      if (typeof playerId !== 'string' || !playerIds.has(playerId)) {
        errors.push(`${path}.playoffBrackets.${String(bracket.id)}.playerIds: unknown player reference`);
      }
    }
    if (typeof bracket.waitingPlayerId === 'string' && !bracket.playerIds.includes(bracket.waitingPlayerId)) {
      errors.push(`${path}.playoffBrackets.${String(bracket.id)}.waitingPlayerId: unknown player reference`);
    }
  }

  for (const match of matchRecords) {
    const matchPath = `${path}.matches.${String(match.id)}`;
    const round = match.round;
    if (typeof round === 'number' && Number.isInteger(round) && (round < 0 || round > totalRounds)) {
      errors.push(`${matchPath}.round: expected an integer from 0 to ${totalRounds}`);
    }

    const player1Id = match.player1Id;
    const player2Id = match.player2Id;
    const isBye = match.isBye === true;
    if (typeof player1Id === 'string' && player1Id !== 'bye' && !playerIds.has(player1Id)) {
      errors.push(`${matchPath}.player1Id: unknown player reference`);
    }
    if (typeof player2Id === 'string' && player2Id !== 'bye' && !playerIds.has(player2Id)) {
      errors.push(`${matchPath}.player2Id: unknown player reference`);
    }
    if (typeof player1Id === 'string' && typeof player2Id === 'string' && player1Id === player2Id && !isBye) {
      errors.push(`${matchPath}: both sides reference the same player`);
    }
    if (isBye && (player1Id === 'bye' || player2Id !== 'bye' || match.result !== 'player1')) {
      errors.push(`${matchPath}: invalid bye match`);
    }
    if (!isBye && (player1Id === 'bye' || player2Id === 'bye')) {
      errors.push(`${matchPath}: bye player requires isBye`);
    }
    if (match.preDrop === true && match.result !== 'player1' && match.result !== 'player2') {
      errors.push(`${matchPath}.preDrop: requires a winning player result`);
    }
    if (match.playoffBracketId !== undefined
      && (typeof match.playoffBracketId !== 'string' || !bracketIds.has(match.playoffBracketId))) {
      errors.push(`${matchPath}.playoffBracketId: unknown bracket reference`);
    }
  }
}

function validatePlayer(value: unknown, path: string, errors: string[]): void {
  const player = asRecord(value);
  if (!player) {
    errors.push(`${path}: expected object`);
    return;
  }

  requireString(player, 'id', `${path}.id`, errors);
  requireString(player, 'name', `${path}.name`, errors);
  for (const field of [
    'points', 'wins', 'losses', 'totalGames', 'wonGames', 'winRate',
    'opponentWinRate', 'opponentOpponentWinRate', 'gameWinRate', 'opponentGameWinRate',
  ]) {
    requireNumber(player, field, `${path}.${field}`, errors);
  }
  if (!Array.isArray(player.playedAgainst)) {
    errors.push(`${path}.playedAgainst: expected array`);
  } else if (player.playedAgainst.length > 1000) {
    errors.push(`${path}.playedAgainst: too many entries`);
  }

  optionalIntegerRange(player, 'previousRank', `${path}.previousRank`, 1, Number.MAX_SAFE_INTEGER, errors);
  optionalIntegerRange(player, 'downMatchCount', `${path}.downMatchCount`, 0, Number.MAX_SAFE_INTEGER, errors);
  optionalIntegerRange(player, 'upMatchCount', `${path}.upMatchCount`, 0, Number.MAX_SAFE_INTEGER, errors);
  optionalIntegerRange(player, 'playoffWins', `${path}.playoffWins`, 0, Number.MAX_SAFE_INTEGER, errors);
  optionalIntegerRange(player, 'playoffRank', `${path}.playoffRank`, 1, Number.MAX_SAFE_INTEGER, errors);
  for (const field of ['dropped', 'eliminated', 'hasDownPriority', 'hasUpPriority']) {
    optionalBoolean(player, field, `${path}.${field}`, errors);
  }
  for (const field of ['playoffBracketId']) {
    optionalString(player, field, `${path}.${field}`, errors);
  }
}

function validateMatch(value: unknown, path: string, errors: string[]): void {
  const match = asRecord(value);
  if (!match) {
    errors.push(`${path}: expected object`);
    return;
  }

  requireString(match, 'id', `${path}.id`, errors);
  requireIntegerRange(match, 'round', `${path}.round`, 0, Number.MAX_SAFE_INTEGER, errors);
  requireString(match, 'player1Id', `${path}.player1Id`, errors);
  requireString(match, 'player2Id', `${path}.player2Id`, errors);
  requireEnum(match, 'result', RESULTS, `${path}.result`, errors);
  optionalIntegerRange(match, 'player1Games', `${path}.player1Games`, 0, Number.MAX_SAFE_INTEGER, errors);
  optionalIntegerRange(match, 'player2Games', `${path}.player2Games`, 0, Number.MAX_SAFE_INTEGER, errors);
  optionalBoolean(match, 'isBye', `${path}.isBye`, errors);
  optionalBoolean(match, 'preDrop', `${path}.preDrop`, errors);
  optionalBoolean(match, 'isPlayoff', `${path}.isPlayoff`, errors);
  optionalString(match, 'playoffBracketId', `${path}.playoffBracketId`, errors);
  if (match.playoffStage !== undefined && match.playoffStage !== 1 && match.playoffStage !== 2) {
    errors.push(`${path}.playoffStage: expected 1 or 2`);
  }
  if (match.playoffRole !== undefined
    && (typeof match.playoffRole !== 'string' || !PLAYOFF_ROLES.has(match.playoffRole))) {
    errors.push(`${path}.playoffRole: invalid value`);
  }
}

function validatePlayoffBracket(value: unknown, path: string, errors: string[]): void {
  const bracket = asRecord(value);
  if (!bracket) {
    errors.push(`${path}: expected object`);
    return;
  }
  requireString(bracket, 'id', `${path}.id`, errors);
  requireIntegerRange(bracket, 'startRank', `${path}.startRank`, 1, Number.MAX_SAFE_INTEGER, errors);
  requireEnum(bracket, 'format', PLAYOFF_FORMATS, `${path}.format`, errors);
  if (!Array.isArray(bracket.playerIds) || !bracket.playerIds.every(id => typeof id === 'string')) {
    errors.push(`${path}.playerIds: expected string array`);
  }
  optionalString(bracket, 'waitingPlayerId', `${path}.waitingPlayerId`, errors);
}

function validateArray(
  object: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  validator: (value: unknown, path: string, errors: string[]) => void
): void {
  const value = object[key];
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`);
    return;
  }
  value.forEach((entry, index) => validator(entry, `${path}.${index}`, errors));
}

function requireString(object: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (typeof object[key] !== 'string') errors.push(`${path}: expected string`);
}

function optionalString(object: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (object[key] !== undefined && typeof object[key] !== 'string') errors.push(`${path}: expected string`);
}

function requireNumber(object: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (typeof object[key] !== 'number' || !Number.isFinite(object[key])) errors.push(`${path}: expected number`);
}

function requireIntegerRange(
  object: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  errors: string[]
): void {
  const value = object[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${path}: expected an integer from ${min} to ${max}`);
  }
}

function optionalIntegerRange(
  object: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  errors: string[]
): void {
  if (
    object[key] !== undefined
    && (typeof object[key] !== 'number'
      || !Number.isInteger(object[key])
      || object[key] < min
      || object[key] > max)
  ) {
    errors.push(`${path}: expected an integer from ${min} to ${max}`);
  }
}

function optionalBoolean(object: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (object[key] !== undefined && typeof object[key] !== 'boolean') errors.push(`${path}: expected boolean`);
}

function requireEnum(
  object: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
  path: string,
  errors: string[]
): void {
  if (typeof object[key] !== 'string' || !allowed.has(object[key])) {
    errors.push(`${path}: invalid value`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function validateUniqueIds(values: unknown[], path: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    const record = asRecord(value);
    const id = record?.id;
    if (typeof id !== 'string') continue;
    if (ids.has(id)) {
      errors.push(`${path}: duplicate id "${id}"`);
    } else {
      ids.add(id);
    }
  }
  return ids;
}

function validatePlayerStats(player: Record<string, unknown>, path: string, errors: string[]): void {
  const integerFields = ['points', 'wins', 'losses', 'totalGames', 'wonGames'];
  for (const field of integerFields) {
    const value = player[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      errors.push(`${path}.${String(player.id)}.${field}: expected a non-negative integer`);
    }
  }

  const rateFields = [
    'winRate',
    'opponentWinRate',
    'opponentOpponentWinRate',
    'gameWinRate',
    'opponentGameWinRate',
  ];
  for (const field of rateFields) {
    const value = player[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      errors.push(`${path}.${String(player.id)}.${field}: expected a rate from 0 to 1`);
    }
  }

  const wonGames = player.wonGames;
  const totalGames = player.totalGames;
  if (
    typeof wonGames === 'number'
    && typeof totalGames === 'number'
    && Number.isFinite(wonGames)
    && Number.isFinite(totalGames)
    && wonGames > totalGames
  ) {
    errors.push(`${path}.${String(player.id)}.wonGames: cannot exceed totalGames`);
  }
}

function failure(message: string): CompetitionSchemaResult {
  return { success: false, message };
}
