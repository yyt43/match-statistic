import type { CompetitionState } from '../useTournamentStore';
import type { Player } from '../../types';
import type { StoreGet, StoreSet } from './actionTypes';
import { updateCurrentGroup } from '../competitionMutators';
import { getSingleEliminationRounds } from '../../utils/swissPairing';
import { generateId } from '../tournamentFactory';
import { logAudit } from '../../utils/auditLog';
import {
  getDefaultPlayerFields,
  getPlayerFields,
  isRosterLocked,
  normalizeUid,
  validateRoster,
} from '../../utils/playerProfiles';
import type {
  PlayerSchemaId,
  TournamentGroup,
  TournamentCompetition,
} from '../../types';

type PlayerActionKey =
  | 'addPlayer'
  | 'addPlayers'
  | 'replacePlayers'
  | 'removePlayer'
  | 'updatePlayerName'
  | 'updatePlayerProfile'
  | 'importPlayerProfiles'
  | 'setPlayerSchema'
  | 'lockRoster'
  | 'togglePlayerDropped'
  | 'setPlayerCount';

function createPlayer(name: string): Player {
  return {
    id: generateId(),
    name: name.trim(),
    profile: {},
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
    dropped: false,
  };
}

export function createPlayerActions(
  set: StoreSet,
  get: StoreGet
): Pick<CompetitionState, PlayerActionKey> {
  const persist = (competition: CompetitionState['competition'], label: string) => {
    set({ competition }, { label });
  };

  return {
    addPlayer: (name: string) => {
      const { competition } = get();
      const group = competition.groups[competition.currentGroupIndex];
      if (group.status !== 'setup' || !name.trim()) return;
      persist(updateCurrentGroup(competition, current => ({
        ...current,
        players: [...current.players, createPlayer(name)],
      })), '添加选手');
    },

    addPlayers: (names: string[]) => {
      const { competition } = get();
      const group = competition.groups[competition.currentGroupIndex];
      if (group.status !== 'setup') return;
      const players = names.filter(name => name.trim()).map(createPlayer);
      persist(updateCurrentGroup(competition, current => ({
        ...current,
        players: [...current.players, ...players],
      })), '批量添加选手');
    },

    replacePlayers: (names: string[]) => {
      const { competition } = get();
      const group = competition.groups[competition.currentGroupIndex];
      if (group.status !== 'setup') return;
      const existingByName = new Map<string, Player[]>();
      for (const player of group.players) {
        const key = player.name.trim().toLowerCase();
        const queue = existingByName.get(key) ?? [];
        queue.push(player);
        existingByName.set(key, queue);
      }
      const players = names
        .map(name => name.trim())
        .filter(Boolean)
        .map(name => {
          const key = name.toLowerCase();
          const queue = existingByName.get(key);
          const preserved = queue?.shift();
          return preserved ? { ...preserved, name } : createPlayer(name);
        });
      persist(updateCurrentGroup(competition, current => ({
        ...current,
        players,
      })), '替换选手名单');
    },

    removePlayer: (playerId: string) => {
      const { competition } = get();
      const group = competition.groups[competition.currentGroupIndex];
      if (group.status !== 'setup') return;
      persist(updateCurrentGroup(competition, current => ({
        ...current,
        players: current.players.filter(player => player.id !== playerId),
      })), '删除选手');
    },

    updatePlayerName: (playerId: string, name: string) => {
      const { competition } = get();
      persist(updateCurrentGroup(competition, group => ({
        ...group,
        players: group.players.map(player =>
          player.id === playerId ? { ...player, name: name.trim() } : player
        ),
      })), '修改选手名称');
    },

    updatePlayerProfile: (playerId: string, changes) => {
      const { competition } = get();
      if (isRosterLocked(competition)) return false;
      const fields = getPlayerFields(competition);
      const allowedKeys = new Set(fields.map(field => field.key));

      persist(updateCurrentGroup(competition, group => ({
        ...group,
        players: group.players.map(player => {
          if (player.id !== playerId) return player;
          const next: Player = {
            ...player,
            profile: { ...(player.profile ?? {}) },
          };
          for (const [key, rawValue] of Object.entries(changes)) {
            if (!allowedKeys.has(key)) continue;
            const value = key === 'uid' ? normalizeUid(rawValue ?? '') : (rawValue ?? '').trim();
            if (key === 'name') next.name = value;
            else if (key === 'participantCode') next.participantCode = value;
            else next.profile![key] = value;
          }
          return next;
        }),
      })), '修改选手档案');
      return true;
    },

    importPlayerProfiles: (players, distributeAcrossGroups) => {
      const { competition } = get();
      if (isRosterLocked(competition)) return validateRoster(competition);
      const shouldDistribute = distributeAcrossGroups
        ?? players.length >= competition.groups.length * 2;
      const fields = getPlayerFields(competition);
      const groupNameByPlayerId = new Map<string, string>();
      const nextPlayers = players.map(entry => {
        const basePlayer = createPlayer(entry.name ?? '');
        const playerId = entry.id ?? basePlayer.id;
        if (entry.groupName?.trim()) {
          groupNameByPlayerId.set(playerId, entry.groupName.trim());
        }
        const next: Player = {
          ...basePlayer,
          id: playerId,
          name: entry.name?.trim() ?? '',
          participantCode: entry.participantCode?.trim() ?? '',
          profile: {},
        };
        for (const field of fields) {
          if (field.key === 'name' || field.key === 'participantCode') continue;
          const value = entry.profile?.[field.key] ?? '';
          next.profile![field.key] = field.key === 'uid' ? normalizeUid(value) : value.trim();
        }
        return next;
      });

      const orderedGroupNames = Array.from(new Set(
        players
          .map(player => player.groupName?.trim())
          .filter((name): name is string => !!name)
      ));
      if (orderedGroupNames.length > 0) {
        const template = competition.groups[0];
        const groups: TournamentGroup[] = orderedGroupNames.map((groupName, index) => {
          const existing = competition.groups.find(group => group.name.trim() === groupName)
            ?? competition.groups[index];
          const base: TournamentGroup = existing ?? {
            id: generateId(),
            name: groupName,
            currentRound: 0,
            totalRounds: template?.totalRounds ?? 5,
            status: 'setup',
            players: [],
            matches: [],
            createdAt: new Date().toISOString(),
            pairingType: template?.pairingType ?? 'swiss',
            gameType: template?.gameType ?? 'bo1',
            tiebreakTemplate: template?.tiebreakTemplate,
            tiebreakRules: template?.tiebreakRules,
            roundGameTypes: template?.roundGameTypes
              ? [...template.roundGameTypes]
              : new Array(template?.totalRounds ?? 5).fill('bo1'),
          };
          return {
            ...base,
            id: base.id || generateId(),
            name: groupName,
            currentRound: 0,
            status: 'setup',
            players: nextPlayers.filter(player =>
              groupNameByPlayerId.get(player.id) === groupName
            ),
            matches: [],
            createdAt: base.createdAt || new Date().toISOString(),
            playoffBrackets: undefined,
          };
        });
        const updated = {
          ...competition,
          groups,
          currentGroupIndex: 0,
        };
        set({ competition: updated }, { label: '按工作表导入选手档案' });
        return validateRoster(updated);
      }

      const groups = competition.groups.map((group, index) => {
        if (!shouldDistribute) {
          return index === competition.currentGroupIndex
            ? { ...group, players: nextPlayers }
            : group;
        }
        const hasParticipantCodes = nextPlayers.some(player =>
          /^[A-D][0-9]{2}$/.test(player.participantCode ?? '')
        );
        if (hasParticipantCodes) {
          const prefix = String.fromCharCode(65 + index);
          const codedPlayers = nextPlayers.filter(player =>
            player.participantCode?.trim().toUpperCase().startsWith(prefix)
          );
          const uncodedPlayers = nextPlayers.filter(player =>
            !/^[A-D][0-9]{2}$/.test(player.participantCode ?? '')
          );
          const uncodedPerGroup = Math.ceil(uncodedPlayers.length / competition.groups.length);
          return {
            ...group,
            players: [
              ...codedPlayers,
              ...uncodedPlayers.slice(index * uncodedPerGroup, (index + 1) * uncodedPerGroup),
            ],
          };
        }
        const perGroup = Math.ceil(nextPlayers.length / competition.groups.length);
        const start = index * perGroup;
        return {
          ...group,
          players: nextPlayers.slice(start, start + perGroup),
        };
      });
      const updated = { ...competition, groups };
      set({ competition: updated }, { label: '导入选手档案' });
      return validateRoster(updated);
    },

    setPlayerSchema: (schemaId: PlayerSchemaId) => {
      const { competition } = get();
      if (isRosterLocked(competition)) return;
      const playerFields = getDefaultPlayerFields(schemaId);
      persist({
        ...competition,
        playerSchemaId: schemaId,
        playerFields,
      }, '切换选手模板');
    },

    lockRoster: () => {
      const { competition } = get();
      if (isRosterLocked(competition)) return validateRoster(competition);
      const validation = validateRoster(competition);
      if (!validation.valid || validation.playerCount === 0) {
        return validation;
      }
      const updated: TournamentCompetition = {
        ...competition,
        rosterLockedAt: new Date().toISOString(),
      };
      set({ competition: updated }, { label: '锁定选手档案' });
      void logAudit('roster-lock', 'Roster locked', {
        playerCount: updated.groups.reduce((sum, group) => sum + group.players.length, 0),
      });
      return validateRoster(updated);
    },

    togglePlayerDropped: (playerId: string) => {
      const { competition } = get();
      const index = competition.currentGroupIndex;
      const group = competition.groups[index];
      if (group.status !== 'in_progress') return;
      const groups = [...competition.groups];
      const player = group.players.find(item => item.id === playerId);
      groups[index] = {
        ...group,
        players: group.players.map(player =>
          player.id === playerId ? { ...player, dropped: !player.dropped } : player
        ),
      };
      persist({ ...competition, groups }, player?.dropped ? '恢复选手' : '选手退赛');
      if (player) {
        void logAudit(
          player.dropped ? 'player-restore' : 'player-drop',
          `${player.name} ${player.dropped ? 'restored' : 'dropped'}`,
          { name: player.name }
        );
      }
    },

    setPlayerCount: (count: number) => {
      const { competition } = get();
      const index = competition.currentGroupIndex;
      const group = competition.groups[index];
      if (group.status !== 'setup') return;
      const newCount = Math.max(2, Math.min(200, count));
      const currentCount = group.players.length;
      if (newCount === currentCount) return;

      const players = [...group.players];
      if (newCount > currentCount) {
        for (let playerIndex = currentCount + 1; playerIndex <= newCount; playerIndex++) {
          players.push(createPlayer(`选手${String(playerIndex).padStart(3, '0')}`));
        }
      } else {
        players.splice(newCount);
      }

      let totalRounds = group.totalRounds;
      let roundGameTypes = group.roundGameTypes;
      if (group.pairingType === 'single_elimination') {
        totalRounds = getSingleEliminationRounds(newCount);
        const existing = group.roundGameTypes ?? [];
        if (existing.length === totalRounds) {
          roundGameTypes = [...existing];
        } else if (existing.length > totalRounds) {
          roundGameTypes = existing.slice(0, totalRounds);
        } else {
          roundGameTypes = [
            ...existing,
            ...new Array(totalRounds - existing.length).fill(group.gameType),
          ];
        }
      }

      const groups = [...competition.groups];
      groups[index] = { ...group, players, totalRounds, roundGameTypes };
      persist({ ...competition, groups }, '调整选手人数');
    },
  };
}
