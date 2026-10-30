import type {
  GameType,
  PairingType,
  Player,
  TournamentCompetition,
  TournamentGroup,
} from '../../types';
import {
  getDefaultTiebreakTemplate,
  normalizeTiebreakRules,
} from '../tiebreak';
import {
  getDefaultPlayerFields,
  getPlayerSchemaId,
} from '../playerProfiles';

export const CURRENT_STORAGE_VERSION = 8;

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

  4: competition => ({
    ...competition,
    groups: competition.groups.map(group => ({
      ...group,
      tiebreakTemplate: group.tiebreakTemplate ?? getDefaultTiebreakTemplate(group.gameType),
      tiebreakRules: normalizeTiebreakRules(group.tiebreakRules, group.gameType),
    })),
  }),

  5: competition => {
    const playerSchemaId = getPlayerSchemaId(competition);
    return {
      ...competition,
      playerSchemaId,
      playerFields: competition.playerFields?.length
        ? competition.playerFields
        : getDefaultPlayerFields(playerSchemaId),
      rosterLockedAt: competition.rosterLockedAt
        ?? (competition.groups.some(group => group.status !== 'setup' || group.currentRound > 0)
          ? competition.createdAt
          : undefined),
      groups: competition.groups.map(migrateGroup),
    };
  },

  // Version 7 introduced the fixed single-elimination bracket. Existing
  // tournaments intentionally keep no bracket and continue on the legacy path.
  6: competition => competition,

  // Version 8 changes double losses from the series maximum (2-2 in BO3)
  // to 0-0. Rankings are recalculated from matches after loading.
  7: competition => ({
    ...competition,
    groups: competition.groups.map(group => ({
      ...group,
      matches: group.matches.map(match =>
        match.result === 'draw'
          ? { ...match, player1Games: 0, player2Games: 0 }
          : match
      ),
    })),
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
    const migration = getMigration(version);
    if (migration) {
      migrated = migration(migrated);
    }
  }
  return migrated;
}

/**
 * 显式列出可用的迁移步骤，避免用 `migrations[userControlledVersion](...)` 的动态派发写法
 * （fromVersion 来自存档元数据，虽然上面已校验范围，动态下标调用仍会被 CodeQL 标记为
 * "unvalidated dynamic method call"，而且可读性差）。
 */
function getMigration(version: number): Migration | undefined {
  switch (version) {
    case 1:
      return migrations[1];
    case 2:
      return migrations[2];
    case 3:
      return migrations[3];
    case 4:
      return migrations[4];
    case 5:
      return migrations[5];
    case 6:
      return migrations[6];
    case 7:
      return migrations[7];
    default:
      return undefined;
  }
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
    profile: player.profile && typeof player.profile === 'object' ? player.profile : {},
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
    tiebreakTemplate: group.tiebreakTemplate ?? getDefaultTiebreakTemplate(gameType),
    tiebreakRules: normalizeTiebreakRules(group.tiebreakRules, gameType),
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
