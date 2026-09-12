import type { CompetitionState } from '../useTournamentStore';
import type { Player } from '../../types';
import type { StoreGet, StoreSet } from './actionTypes';
import { updateCurrentGroup } from '../competitionMutators';
import { createPlayersFromNames, getSingleEliminationRounds } from '../../utils/swissPairing';
import { generateId } from '../tournamentFactory';
import { logAudit } from '../../utils/auditLog';

type PlayerActionKey =
  | 'addPlayer'
  | 'addPlayers'
  | 'replacePlayers'
  | 'removePlayer'
  | 'updatePlayerName'
  | 'togglePlayerDropped'
  | 'setPlayerCount';

function createPlayer(name: string): Player {
  return {
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
      persist(updateCurrentGroup(competition, current => ({
        ...current,
        players: createPlayersFromNames(names.filter(name => name.trim())),
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
