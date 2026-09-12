import type { TournamentCompetition } from '../../types';
import type { CompetitionState } from '../useTournamentStore';
import type { StoreSet } from './actionTypes';
import { createNewCompetition } from '../tournamentFactory';
import { loadCompetition } from '../../utils/storage/storage';
import { loadCompetitionHistory } from '../../utils/storage/historyStore';
import { normalizeCompetitionGroups, resolveViewRound } from '../competitionState';
import { logAudit } from '../../utils/auditLog';

export function createCompetitionActions(
  set: StoreSet
): Pick<CompetitionState, 'initCompetition' | 'loadSavedCompetition' | 'importCompetition' | 'resetCompetition'> {
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

    loadSavedCompetition: async () => {
      const rawSaved = await loadCompetition();
      const saved = rawSaved ? normalizeCompetitionGroups(rawSaved) : null;
      if (!saved) return false;

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
        { label: '导入赛事' }
      );
      void logAudit('tournament-import', `Imported ${normalized.name}`, { name: normalized.name });
    },

    resetCompetition: () => {
      const competition = createNewCompetition('新建赛事');
      set(
        { competition, viewRound: 0, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } },
        { label: '重置赛事' }
      );
      void logAudit('tournament-reset', 'Tournament reset');
    },
  };
}
