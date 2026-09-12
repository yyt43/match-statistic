import type { CompetitionState } from '../useTournamentStore';
import type { GameType, PairingType, Player, TournamentGroup } from '../../types';
import type { StoreGet, StoreSet } from './actionTypes';
import { createNewGroup, generateId } from '../tournamentFactory';
import { getSingleEliminationRounds } from '../../utils/swissPairing';
import { saveCompetition } from '../../utils/storage/storage';

type GroupActionKey =
  | 'setCurrentGroup'
  | 'addGroup'
  | 'removeGroup'
  | 'setGroupCount'
  | 'batchSetGroupConfig'
  | 'updateGroupName'
  | 'setTotalRounds'
  | 'setGameType'
  | 'setPairingType'
  | 'setRoundGameType';

export function createGroupActions(
  set: StoreSet,
  get: StoreGet
): Pick<CompetitionState, GroupActionKey> {
  const persist = (competition: CompetitionState['competition']) => {
    set({ competition });
    saveCompetition(competition);
  };

  return {
    setCurrentGroup: (index: number) => {
      const { competition } = get();
      if (index < 0 || index >= competition.groups.length) return;
      const group = competition.groups[index];
      set({
        competition: { ...competition, currentGroupIndex: index },
        viewRound: group.currentRound > 0 ? group.currentRound : 0,
      });
    },

    addGroup: () => {
      const { competition } = get();
      if (competition.groups.some(group => group.status !== 'setup')) return;
      let maxPlayerIndex = 0;
      for (const group of competition.groups) {
        for (const player of group.players) {
          const index = parseInt(player.name.replace(/\D/g, ''));
          if (!Number.isNaN(index) && index > maxPlayerIndex) maxPlayerIndex = index;
        }
      }
      const newGroup = createNewGroup(
        `小组${String(competition.groups.length + 1).padStart(2, '0')}`,
        32,
        5,
        'bo1',
        'swiss',
        maxPlayerIndex + 1
      );
      persist({ ...competition, groups: [...competition.groups, newGroup] });
    },

    removeGroup: (index: number) => {
      const { competition } = get();
      if (competition.groups.length <= 1 || competition.groups[index]?.status !== 'setup') return;
      const groups = competition.groups.filter((_, groupIndex) => groupIndex !== index);
      persist({
        ...competition,
        groups,
        currentGroupIndex: Math.min(competition.currentGroupIndex, groups.length - 1),
      });
    },

    setGroupCount: (count: number) => {
      const { competition } = get();
      if (competition.groups.some(group => group.status !== 'setup')) return;
      const targetCount = Math.max(1, Math.min(20, Math.floor(count)));
      const currentCount = competition.groups.length;
      if (targetCount === currentCount) return;

      let maxPlayerIndex = 0;
      for (const group of competition.groups) {
        for (const player of group.players) {
          const index = parseInt(player.name.replace(/\D/g, ''));
          if (!Number.isNaN(index) && index > maxPlayerIndex) maxPlayerIndex = index;
        }
      }

      const reference = competition.groups[0];
      const referencePlayerCount = reference?.status === 'setup' ? reference.players.length : 32;
      const referenceRounds = reference?.status === 'setup' ? reference.totalRounds : 5;
      const referenceGameType = reference?.gameType ?? 'bo1';
      const referencePairingType = reference?.pairingType ?? 'swiss';
      let groups: TournamentGroup[];

      if (targetCount > currentCount) {
        const added: TournamentGroup[] = [];
        for (let index = currentCount; index < targetCount; index++) {
          const startIndex = maxPlayerIndex + 1 + (index - currentCount) * referencePlayerCount;
          added.push(createNewGroup(
            `小组${String(index + 1).padStart(2, '0')}`,
            referencePlayerCount,
            referenceRounds,
            referenceGameType,
            referencePairingType,
            startIndex
          ));
        }
        groups = [...competition.groups, ...added];
      } else {
        groups = [...competition.groups];
        while (groups.length > targetCount) {
          const last = groups[groups.length - 1];
          if (last.status === 'setup') {
            groups.pop();
          } else {
            const setupIndex = groups.slice(0, -1).findIndex(group => group.status === 'setup');
            if (setupIndex === -1) break;
            groups.splice(setupIndex, 1);
          }
        }
      }

      if (groups.length === currentCount) return;
      persist({
        ...competition,
        groups,
        currentGroupIndex: Math.min(competition.currentGroupIndex, groups.length - 1),
      });
    },

    batchSetGroupConfig: (
      playerCount: number,
      rounds: number,
      gameType: GameType,
      pairingType: PairingType,
      roundGameTypes?: GameType[]
    ) => {
      const { competition } = get();
      let startIndex = 1;
      const groups = competition.groups.map(group => {
        if (group.status !== 'setup') {
          startIndex += group.players.length;
          return group;
        }
        const count = Math.max(2, Math.min(200, playerCount));
        const players: Player[] = Array.from({ length: count }, (_, index) => ({
          id: generateId(),
          name: `选手${String(startIndex + index).padStart(3, '0')}`,
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
        }));
        startIndex += count;
        const totalRounds = pairingType === 'single_elimination'
          ? getSingleEliminationRounds(count)
          : Math.max(1, Math.min(20, rounds));
        const finalRoundGameTypes = pairingType === 'single_elimination'
          && roundGameTypes
          && roundGameTypes.length === totalRounds
          ? [...roundGameTypes]
          : new Array(totalRounds).fill(gameType);
        return {
          ...group,
          players,
          totalRounds,
          gameType,
          pairingType,
          roundGameTypes: finalRoundGameTypes,
        };
      });
      persist({ ...competition, groups });
    },

    updateGroupName: (index: number, name: string) => {
      const { competition } = get();
      const groups = [...competition.groups];
      groups[index] = { ...groups[index], name: name.trim() };
      persist({ ...competition, groups });
    },

    setTotalRounds: (rounds: number) => {
      const { competition } = get();
      const index = competition.currentGroupIndex;
      const group = competition.groups[index];
      if (group.status !== 'setup') return;
      const newRounds = Math.max(1, Math.min(20, rounds));
      const oldRounds = group.totalRounds;
      let roundGameTypes = group.roundGameTypes
        ? [...group.roundGameTypes]
        : new Array(oldRounds).fill(group.gameType);
      if (newRounds > oldRounds) {
        roundGameTypes = roundGameTypes.concat(new Array(newRounds - oldRounds).fill(group.gameType));
      } else if (newRounds < oldRounds) {
        roundGameTypes = roundGameTypes.slice(0, newRounds);
      }
      const groups = [...competition.groups];
      groups[index] = { ...group, totalRounds: newRounds, roundGameTypes };
      persist({ ...competition, groups });
    },

    setGameType: (gameType: GameType) => {
      const { competition } = get();
      const index = competition.currentGroupIndex;
      const group = competition.groups[index];
      if (group.status !== 'setup') return;
      const groups = [...competition.groups];
      groups[index] = {
        ...group,
        gameType,
        roundGameTypes: new Array(group.totalRounds).fill(gameType),
      };
      persist({ ...competition, groups });
    },

    setPairingType: (pairingType: PairingType) => {
      const { competition } = get();
      const index = competition.currentGroupIndex;
      const group = competition.groups[index];
      if (group.status !== 'setup') return;
      const totalRounds = pairingType === 'single_elimination'
        ? getSingleEliminationRounds(group.players.length)
        : group.totalRounds;
      let roundGameTypes = group.roundGameTypes
        ? [...group.roundGameTypes]
        : new Array(group.totalRounds).fill(group.gameType);
      if (totalRounds > roundGameTypes.length) {
        roundGameTypes = roundGameTypes.concat(new Array(totalRounds - roundGameTypes.length).fill(group.gameType));
      } else if (totalRounds < roundGameTypes.length) {
        roundGameTypes = roundGameTypes.slice(0, totalRounds);
      }
      const groups = [...competition.groups];
      groups[index] = { ...group, pairingType, totalRounds, roundGameTypes };
      persist({ ...competition, groups });
    },

    setRoundGameType: (round: number, gameType: GameType) => {
      const { competition } = get();
      const index = competition.currentGroupIndex;
      const group = competition.groups[index];
      if (group.status !== 'setup') return;
      const roundGameTypes = group.roundGameTypes
        ? [...group.roundGameTypes]
        : new Array(group.totalRounds).fill(group.gameType);
      if (round >= 1 && round <= roundGameTypes.length) {
        roundGameTypes[round - 1] = gameType;
      }
      const groups = [...competition.groups];
      groups[index] = { ...group, roundGameTypes };
      persist({ ...competition, groups });
    },
  };
}
