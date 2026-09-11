import { useEffect, useRef, useState } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { getLastSavedAt } from '../utils/storage/storage';
import { subscribeCompetitionSaved, TAB_ID } from '../utils/storage/storageSync';

export function useStorageSync() {
  const loadSavedCompetition = useTournamentStore(state => state.loadSavedCompetition);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(getLastSavedAt);
  const [syncedFromOtherTab, setSyncedFromOtherTab] = useState(false);
  const [conflictDetected, setConflictDetected] = useState(false);
  const lastLocalSaveRef = useRef(0);

  useEffect(() => subscribeCompetitionSaved(event => {
    setLastSavedAt(event.savedAt);
    if (event.sourceId === TAB_ID) {
      lastLocalSaveRef.current = Date.now();
      return;
    }

    void loadSavedCompetition().then(loaded => {
      if (!loaded) return;
      if (Date.now() - lastLocalSaveRef.current < 2000) {
        setConflictDetected(true);
        window.setTimeout(() => setConflictDetected(false), 3200);
      } else {
        setSyncedFromOtherTab(true);
        window.setTimeout(() => setSyncedFromOtherTab(false), 2200);
      }
    });
  }), [loadSavedCompetition]);

  return { lastSavedAt, syncedFromOtherTab, conflictDetected };
}
