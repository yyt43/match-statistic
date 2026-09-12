import { useEffect, useRef, useState } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { getLastSavedAt, saveCompetition } from '../utils/storage/storage';
import { isConcurrentSave, subscribeCompetitionSaved, TAB_ID } from '../utils/storage/storageSync';
import { logAudit } from '../utils/auditLog';

export function useStorageSync() {
  const loadSavedCompetition = useTournamentStore(state => state.loadSavedCompetition);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(getLastSavedAt);
  const [syncedFromOtherTab, setSyncedFromOtherTab] = useState(false);
  const [conflict, setConflict] = useState<{ savedAt: string; competitionId: string } | null>(null);
  const lastLocalSaveRef = useRef(0);

  useEffect(() => subscribeCompetitionSaved(event => {
    setLastSavedAt(event.savedAt);
    if (event.sourceId === TAB_ID) {
      lastLocalSaveRef.current = Date.now();
      return;
    }

    const currentCompetition = useTournamentStore.getState().competition;
    if (event.competitionId !== currentCompetition.id) return;

    if (isConcurrentSave(lastLocalSaveRef.current)) {
      setConflict({ savedAt: event.savedAt, competitionId: event.competitionId });
      return;
    }

    void loadSavedCompetition().then(loaded => {
      if (!loaded) return;
      setSyncedFromOtherTab(true);
      window.setTimeout(() => setSyncedFromOtherTab(false), 2200);
    });
  }), [loadSavedCompetition]);

  return {
    lastSavedAt,
    syncedFromOtherTab,
    conflict,
    loadOtherTabVersion: async () => {
      const loaded = await loadSavedCompetition();
      if (loaded) {
        void logAudit('conflict-resolve', 'Used other tab version', { choice: 'other-tab' });
        setConflict(null);
      }
    },
    keepLocalVersion: () => {
      saveCompetition(useTournamentStore.getState().competition);
      void logAudit('conflict-resolve', 'Kept this tab version', { choice: 'this-tab' });
      setConflict(null);
    },
  };
}
