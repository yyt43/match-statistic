import { useEffect, useState } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { getLastSavedAt } from '../utils/storage';
import { subscribeCompetitionSaved, TAB_ID } from '../utils/storageSync';

export function useStorageSync() {
  const loadSavedCompetition = useTournamentStore(state => state.loadSavedCompetition);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(getLastSavedAt);
  const [syncedFromOtherTab, setSyncedFromOtherTab] = useState(false);

  useEffect(() => subscribeCompetitionSaved(event => {
    setLastSavedAt(event.savedAt);
    if (event.sourceId === TAB_ID) return;

    void loadSavedCompetition().then(loaded => {
      if (!loaded) return;
      setSyncedFromOtherTab(true);
      window.setTimeout(() => setSyncedFromOtherTab(false), 2200);
    });
  }), [loadSavedCompetition]);

  return { lastSavedAt, syncedFromOtherTab };
}
