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
  requireNumber(competition, 'currentGroupIndex', 'root.currentGroupIndex', errors);
  requireString(competition, 'createdAt', 'root.createdAt', errors);

  if (!Array.isArray(competition.groups) || competition.groups.length === 0) {
    errors.push('root.groups: expected a non-empty array');
  } else {
    competition.groups.forEach((group, index) => validateGroup(group, `groups.${index}`, errors));
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
  requireNumber(group, 'currentRound', `${path}.currentRound`, errors);
  requireNumber(group, 'totalRounds', `${path}.totalRounds`, errors);
  requireString(group, 'createdAt', `${path}.createdAt`, errors);
  requireEnum(group, 'status', STATUSES, `${path}.status`, errors);
  requireEnum(group, 'pairingType', PAIRING_TYPES, `${path}.pairingType`, errors);
  requireEnum(group, 'gameType', GAME_TYPES, `${path}.gameType`, errors);

  validateArray(group, 'players', `${path}.players`, errors, validatePlayer);
  validateArray(group, 'matches', `${path}.matches`, errors, validateMatch);

  if (group.roundGameTypes !== undefined) {
    if (!Array.isArray(group.roundGameTypes)
      || !group.roundGameTypes.every(value => typeof value === 'string' && GAME_TYPES.has(value))) {
      errors.push(`${path}.roundGameTypes: expected an array of valid game types`);
    }
  }

  if (group.playoffBrackets !== undefined) {
    validateArray(group, 'playoffBrackets', `${path}.playoffBrackets`, errors, validatePlayoffBracket);
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
  }

  for (const field of ['previousRank', 'downMatchCount', 'upMatchCount', 'playoffWins', 'playoffRank']) {
    optionalNumber(player, field, `${path}.${field}`, errors);
  }
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
  requireNumber(match, 'round', `${path}.round`, errors);
  requireString(match, 'player1Id', `${path}.player1Id`, errors);
  requireString(match, 'player2Id', `${path}.player2Id`, errors);
  requireEnum(match, 'result', RESULTS, `${path}.result`, errors);
  optionalNumber(match, 'player1Games', `${path}.player1Games`, errors);
  optionalNumber(match, 'player2Games', `${path}.player2Games`, errors);
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
  requireNumber(bracket, 'startRank', `${path}.startRank`, errors);
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

function optionalNumber(object: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (object[key] !== undefined && (typeof object[key] !== 'number' || !Number.isFinite(object[key]))) {
    errors.push(`${path}: expected number`);
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

function failure(message: string): CompetitionSchemaResult {
  return { success: false, message };
}
