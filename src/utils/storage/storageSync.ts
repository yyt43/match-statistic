const CHANNEL_NAME = 'match-statistic-sync';
const LOCAL_EVENT = 'tournament-saved';

export const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

export interface CompetitionSavedEvent {
  sourceId: string;
  savedAt: string;
  competitionId: string;
}

export function isConcurrentSave(
  lastLocalSaveAt: number,
  receivedAt: number = Date.now(),
  thresholdMs = 2000
): boolean {
  return lastLocalSaveAt > 0 && receivedAt - lastLocalSaveAt < thresholdMs;
}

export function broadcastCompetitionSaved(savedAt: string, competitionId: string): void {
  if (typeof window === 'undefined') return;
  const event: CompetitionSavedEvent = { sourceId: TAB_ID, savedAt, competitionId };
  window.dispatchEvent(new CustomEvent<CompetitionSavedEvent>(LOCAL_EVENT, { detail: event }));

  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(event);
  channel.close();
}

export function subscribeCompetitionSaved(
  listener: (event: CompetitionSavedEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleLocal = (event: Event) => {
    listener((event as CustomEvent<CompetitionSavedEvent>).detail);
  };
  window.addEventListener(LOCAL_EVENT, handleLocal);

  if (typeof BroadcastChannel === 'undefined') {
    return () => window.removeEventListener(LOCAL_EVENT, handleLocal);
  }

  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener('message', event => {
    const savedEvent = event.data as CompetitionSavedEvent;
    // The local CustomEvent already handles this tab's own save.
    if (savedEvent.sourceId !== TAB_ID) listener(savedEvent);
  });

  return () => {
    window.removeEventListener(LOCAL_EVENT, handleLocal);
    channel.close();
  };
}
