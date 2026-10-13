import type { StageAdvancementPreview } from '../../types';
import type { CompetitionState } from '../useTournamentStore';
import type { StoreGet, StoreSet } from './actionTypes';
import {
  computeStageAdvancement,
  confirmStageAdvancement,
  hasDownstreamResults,
  isStageComplete,
  revertStageAdvancement,
} from '../../utils/advancement';
import { getOrderedStages } from '../../utils/multiStage';

export function createAdvancementActions(
  set: StoreSet,
  get: StoreGet
): Pick<
  CompetitionState,
  'previewStageAdvancement' | 'confirmStageAdvancement' | 'revertStageAdvancement'
> {
  return {
    previewStageAdvancement: (stageId?: string): StageAdvancementPreview => {
      const { competition } = get();
      const stages = getOrderedStages(competition);
      const fallbackStageId = competition.groups[competition.currentGroupIndex]?.stageId;
      const sourceStageId = stageId ?? fallbackStageId ?? stages[0]?.id ?? '';
      return computeStageAdvancement(competition, sourceStageId);
    },

    confirmStageAdvancement: (preview: StageAdvancementPreview) => {
      const { competition } = get();
      const updated = confirmStageAdvancement(competition, preview);
      if (updated === competition) return false;
      // 确认后直接跳到下一赛段的第一个小组，裁判不必再手动切换。
      const nextStage = (updated.stages ?? [])
        .filter(stage => preview.targetStageIds.includes(stage.id))
        .sort((a, b) => a.order - b.order)[0];
      const nextGroupId = nextStage?.groupIds[0];
      const nextGroupIndex = nextGroupId
        ? updated.groups.findIndex(group => group.id === nextGroupId)
        : -1;
      set(
        {
          competition: nextGroupIndex >= 0
            ? { ...updated, currentGroupIndex: nextGroupIndex }
            : updated,
        },
        { label: '确认晋级' }
      );
      return true;
    },

    revertStageAdvancement: (stageId?: string) => {
      const { competition } = get();
      const sourceStage = getOrderedStages(competition).find(
        stage => stage.id === (stageId ?? competition.groups[competition.currentGroupIndex]?.stageId)
      );
      if (!sourceStage) return false;
      if (hasDownstreamResults(competition, sourceStage)) return false;
      const updated = revertStageAdvancement(competition, sourceStage.id);
      set({ competition: updated }, { label: '回退晋级' });
      return true;
    },
  };
}

export { hasDownstreamResults, isStageComplete };
