import type { CompetitionState } from '../useTournamentStore';
import type { StoreGet, StoreSet } from './actionTypes';
import { getSnapshot, getSnapshotOwner, saveSnapshot } from '../../utils/storage/snapshot';
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
      return saveSnapshot(competition, label || defaultLabel);
    },

    restoreFromSnapshot: async (snapshotId: string) => {
      const snapshot = await getSnapshot(snapshotId);
      if (!snapshot) return false;

      // 只允许把快照恢复到它所属的赛事：否则会用另一场赛事的旧数据覆盖当前赛事。
      const owner = getSnapshotOwner(snapshot);
      const currentCompetition = get().competition;
      if (owner.id !== currentCompetition.id) {
        set({
          actionError: {
            zh: '该快照属于其他赛事，无法恢复到当前赛事。',
            en: 'This snapshot belongs to a different event, so it cannot be restored over the current event.',
          },
        });
        return false;
      }

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
      set(
        {
          competition: restored,
          viewRound: currentGroup?.currentRound > 0 ? currentGroup.currentRound : 0,
          isRandomGenerating: false,
          randomGenerateProgress: { total: 0, current: 0 },
        },
        // 恢复快照是整场赛事的替换而非一步可撤销编辑，清空撤销历史避免回到旧赛事。
        { label: `恢复快照：${snapshot.label}`, history: 'replace' }
      );
      void logAudit('snapshot-restore', `Restored ${snapshot.label}`, { label: snapshot.label });
      return true;
    },
  };
}
