import type { TournamentCompetition } from '../../types';
import type { CompetitionState } from '../useTournamentStore';
import { createNewCompetition } from '../tournamentFactory';
import { loadCompetition, saveCompetition } from '../../utils/storage/storage';
import { normalizeCompetitionGroups, resolveViewRound } from '../competitionState';

type StoreSet = (
  partial:
    | Partial<CompetitionState>
    | ((state: CompetitionState) => Partial<CompetitionState>)
) => void;

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
      set({ competition, viewRound: 0, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } });
      saveCompetition(competition);
    },

    loadSavedCompetition: async () => {
      const rawSaved = await loadCompetition();
      const saved = rawSaved ? normalizeCompetitionGroups(rawSaved) : null;
      if (!saved) return false;

      set({
        competition: saved,
        viewRound: resolveViewRound(saved),
        isRandomGenerating: false,
        randomGenerateProgress: { total: 0, current: 0 },
      });
      return true;
    },

    importCompetition: (competition: TournamentCompetition) => {
      const normalized = normalizeCompetitionGroups(competition);
      set({
        competition: normalized,
        viewRound: resolveViewRound(normalized),
        isRandomGenerating: false,
        randomGenerateProgress: { total: 0, current: 0 },
      });
      saveCompetition(normalized);
    },

    resetCompetition: () => {
      const competition = createNewCompetition('新建赛事');
      set({ competition, viewRound: 0, isRandomGenerating: false, randomGenerateProgress: { total: 0, current: 0 } });
      saveCompetition(competition);
    },
  };
}
