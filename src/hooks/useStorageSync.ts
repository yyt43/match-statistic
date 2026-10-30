import { useCallback, useEffect, useRef, useState } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { getLastSavedAt, saveCompetition } from '../utils/storage/storage';
import {
  resolveRemoteSaveDecision,
  subscribeCompetitionSaved,
  TAB_ID,
} from '../utils/storage/storageSync';
import { logAudit } from '../utils/auditLog';

interface StorageConflict {
  savedAt: string;
  competitionId: string;
}

export function useStorageSync() {
  const loadSavedCompetition = useTournamentStore(state => state.loadSavedCompetition);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(getLastSavedAt);
  const [syncedFromOtherTab, setSyncedFromOtherTab] = useState(false);
  const [conflict, setConflict] = useState<StorageConflict | null>(null);
  const syncedToastTimerRef = useRef<number | null>(null);

  const showSyncedToast = useCallback(() => {
    setSyncedFromOtherTab(true);
    if (syncedToastTimerRef.current !== null) window.clearTimeout(syncedToastTimerRef.current);
    syncedToastTimerRef.current = window.setTimeout(() => {
      syncedToastTimerRef.current = null;
      setSyncedFromOtherTab(false);
    }, 2200);
  }, []);

  useEffect(() => subscribeCompetitionSaved(event => {
    setLastSavedAt(event.savedAt);
    // 本页自己的保存：脏标记由 store 在持久化成功回调中清理，这里只更新保存时间。
    if (event.sourceId === TAB_ID) return;

    const state = useTournamentStore.getState();
    const decision = resolveRemoteSaveDecision({
      localCompetitionId: state.competition.id,
      remoteCompetitionId: event.competitionId,
      hasUnsavedChanges: state.dirtySinceLastPersist,
    });

    if (decision === 'ignore') return;
    if (decision === 'conflict') {
      // 本页有未保存改动：交给用户选择，绝不静默重载丢弃编辑。
      setConflict({ savedAt: event.savedAt, competitionId: event.competitionId });
      return;
    }

    void loadSavedCompetition().then(loaded => {
      if (loaded) showSyncedToast();
    });
  }), [loadSavedCompetition, showSyncedToast]);

  useEffect(() => () => {
    if (syncedToastTimerRef.current !== null) {
      window.clearTimeout(syncedToastTimerRef.current);
      syncedToastTimerRef.current = null;
    }
  }, []);

  const loadOtherTabVersion = useCallback(async () => {
    const loaded = await loadSavedCompetition();
    if (!loaded) return;
    void logAudit('conflict-resolve', 'Used other tab version', { choice: 'other-tab' });
    setConflict(null);
    showSyncedToast();
  }, [loadSavedCompetition, showSyncedToast]);

  const keepLocalVersion = useCallback(() => {
    // 明确用本页状态覆盖其他标签页的版本；撤销历史保持不变。
    // 写入期间保持脏标记，避免持久化落地前又被自动重载覆盖。
    const state = useTournamentStore.getState();
    state.markUnsavedChanges();
    saveCompetition(state.competition);
    void logAudit('conflict-resolve', 'Kept this tab version', { choice: 'this-tab' });
    setConflict(null);
  }, []);

  return {
    lastSavedAt,
    syncedFromOtherTab,
    conflict,
    loadOtherTabVersion,
    keepLocalVersion,
  };
}
