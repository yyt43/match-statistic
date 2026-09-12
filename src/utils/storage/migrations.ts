import type {
  GameType,
  PairingType,
  Player,
  TournamentCompetition,
  TournamentGroup,
} from '../../types';

export const CURRENT_STORAGE_VERSION = 4;

type Migration = (competition: TournamentCompetition) => TournamentCompetition;

const GAME_TYPES: GameType[] = ['bo1', 'bo3', 'bo5', 'bo7'];

const migrations: Record<number, Migration> = {
  1: competition => ({
    ...competition,
    currentGroupIndex: Number.isInteger(competition.currentGroupIndex)
      ? competition.currentGroupIndex
      : 0,
    createdAt: competition.createdAt || new Date().toISOString(),
  }),

  2: competition => ({
    ...competition,
    groups: competition.groups.map(migrateGroup),
  }),

  3: competition => ({
    ...competition,
    groups: competition.groups.map(group => {
      const roundGameTypes = normalizeRoundGameTypes(group);
      return {
        ...group,
        gameType: GAME_TYPES.includes(group.gameType) ? group.gameType : 'bo1',
        roundGameTypes,
      };
    }),
  }),
};

export function migrateCompetitionData(
  competition: TournamentCompetition,
  fromVersion: number
): TournamentCompetition {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new Error(`Invalid storage version: ${fromVersion}`);
  }
  if (fromVersion > CURRENT_STORAGE_VERSION) {
    throw new Error(
      `Storage version ${fromVersion} is newer than supported version ${CURRENT_STORAGE_VERSION}.`
    );
  }

  let migrated = competition;
  for (let version = fromVersion; version < CURRENT_STORAGE_VERSION; version++) {
    migrated = migrations[version]?.(migrated) ?? migrated;
  }
  return migrated;
}

function migrateGroup(group: TournamentGroup): TournamentGroup {
  let pairingType: PairingType = group.pairingType ?? 'swiss';
  let gameType: GameType = group.gameType ?? 'bo1';

  if ((group.gameType as string) === 'single_elimination' && !group.pairingType) {
    pairingType = 'single_elimination';
    gameType = 'bo1';
  }
  if (!GAME_TYPES.includes(gameType)) gameType = 'bo1';

  const players: Player[] = (group.players ?? []).map(player => ({
    ...player,
    downMatchCount: player.downMatchCount ?? 0,
    upMatchCount: player.upMatchCount ?? 0,
    hasDownPriority: player.hasDownPriority ?? false,
    hasUpPriority: player.hasUpPriority ?? false,
    playedAgainst: Array.isArray(player.playedAgainst) ? player.playedAgainst : [],
  }));

  return {
    ...group,
    pairingType,
    gameType,
    players,
    matches: Array.isArray(group.matches) ? group.matches : [],
    roundGameTypes: normalizeRoundGameTypes({ ...group, gameType }),
  };
}

function normalizeRoundGameTypes(group: TournamentGroup): GameType[] {
  const totalRounds = Math.max(1, Number(group.totalRounds) || 1);
  const existing = Array.isArray(group.roundGameTypes) ? group.roundGameTypes : [];
  const normalized = existing
    .filter((gameType): gameType is GameType => GAME_TYPES.includes(gameType))
    .slice(0, totalRounds);

  while (normalized.length < totalRounds) {
    normalized.push(GAME_TYPES.includes(group.gameType) ? group.gameType : 'bo1');
  }
  return normalized;
}
