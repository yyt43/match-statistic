import type { TournamentCompetition } from '../../types';
import type { CompetitionState } from '../useTournamentStore';
import type { StoreSet } from './actionTypes';
import { createNewCompetition } from '../tournamentFactory';
import { loadCompetitionResult } from '../../utils/storage/storage';
import { loadCompetitionHistory } from '../../utils/storage/historyStore';
import { normalizeCompetitionGroups, resolveViewRound } from '../competitionState';
import { logAudit } from '../../utils/auditLog';

export function createCompetitionActions(
  set: StoreSet
): Pick<
  CompetitionState,
  'initCompetition' | 'initMultiStageCompetition' | 'loadSavedCompetition' | 'importCompetition' | 'resetCompetition'
> {
  return {
    initCompetition: (name, groupCount, playerCountPerGroup, roundsPerGroup, gameType, pairingType) => {
      const competition = createNewCompetition(
        name,
        groupCount || 1,
        playerCountPerGroup || 32,
        roundsPerGroup || 5,
        gameType || 'bo1',
        pairingType || 'swiss'
      );
      set(
        { competition, viewRound: 0, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } },
        { history: 'replace' }
      );
    },

    initMultiStageCompetition: competition => {
      const normalized = normalizeCompetitionGroups(competition);
      set(
        {
          competition: normalized,
          viewRound: 0,
          isRandomGenerating: false,
          randomGenerateProgress: { total: 0, current: 0 },
        },
        { history: 'replace' }
      );
      void logAudit('tournament-import', `Created ${normalized.name}`, { name: normalized.name });
    },

    loadSavedCompetition: async () => {
      // 数据损坏时不进入工作区，也不覆盖原有记录；由入口页提示并导出原始数据。
      const result = await loadCompetitionResult();
      if (result.status !== 'ok' || !result.competition) return false;
      const saved = normalizeCompetitionGroups(result.competition);

      set(
        {
          competition: saved,
          viewRound: resolveViewRound(saved),
          isRandomGenerating: false,
          randomGenerateProgress: { total: 0, current: 0 },
        },
        { history: 'replace', allowReadOnly: true, persist: false }
      );
      const history = await loadCompetitionHistory(saved.id);
      if (history) {
        set({
          historyPast: history.past,
          historyFuture: history.future,
        });
      }
      return true;
    },

    importCompetition: (competition: TournamentCompetition) => {
      const normalized = normalizeCompetitionGroups(competition);
      set(
        {
          competition: normalized,
          viewRound: resolveViewRound(normalized),
          isRandomGenerating: false,
          randomGenerateProgress: { total: 0, current: 0 },
        },
        { history: 'replace' }
      );
      void logAudit('tournament-import', `Imported ${normalized.name}`, { name: normalized.name });
    },

    resetCompetition: () => {
      const competition = createNewCompetition('新建赛事');
      set(
        { competition, viewRound: 0, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } },
        { history: 'replace' }
      );
      void logAudit('tournament-reset', 'Tournament reset');
    },
  };
}
