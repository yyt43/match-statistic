import type { CompetitionState } from '../useTournamentStore';
import type { StoreGet, StoreSet } from './actionTypes';
import { getSnapshot, saveSnapshot } from '../../utils/storage/snapshot';
import { calculateAllWinRates, getRankedPlayers } from '../../utils/swissPairing';
import { logAudit } from '../../utils/auditLog';

export function createSnapshotActions(
  set: StoreSet,
  get: StoreGet
): Pick<CompetitionState, 'createSnapshot' | 'restoreFromSnapshot'> {
  return {
    createSnapshot: async (label?: string) => {
      const { competition } = get();
      const currentGroup = competition.groups[competition.currentGroupIndex];
      const defaultLabel = currentGroup
        ? `${currentGroup.name}·第${currentGroup.currentRound}轮`
        : '手动备份';
      await saveSnapshot(competition, label || defaultLabel);
    },

    restoreFromSnapshot: async (snapshotId: string) => {
      const snapshot = await getSnapshot(snapshotId);
      if (!snapshot) return false;

      const recalculatedGroups = snapshot.data.groups.map(group => {
        const updatedPlayers = calculateAllWinRates(group.players, group.matches, group.gameType);
        const rankedPlayers = getRankedPlayers(
          updatedPlayers,
          group.gameType,
          group.pairingType,
          group.tiebreakRules
        );
        return {
          ...group,
          players: rankedPlayers.map((player, index) => ({ ...player, previousRank: index + 1 })),
        };
      });
      const restored = { ...snapshot.data, groups: recalculatedGroups };
      const currentGroup = restored.groups[restored.currentGroupIndex];
      set({
        competition: restored,
        viewRound: currentGroup?.currentRound > 0 ? currentGroup.currentRound : 0,
        isRandomGenerating: false,
        randomGenerateProgress: { total: 0, current: 0 },
      }, { label: `恢复快照：${snapshot.label}` });
      void logAudit('snapshot-restore', `Restored ${snapshot.label}`, { label: snapshot.label });
      return true;
    },
  };
}
