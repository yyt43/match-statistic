import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  broadcastCompetitionSaved,
  canUseWriterLease,
  parseWriterLease,
  readWriterLease,
  releaseWriterLease,
  resolveRemoteSaveDecision,
  resolveWriterLease,
  subscribeCompetitionSaved,
  subscribeLocalPersistSuccess,
  TAB_ID,
  WRITER_LEASE_KEY,
  writeWriterLease,
  type CompetitionSavedEvent,
} from './storageSync';

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  private listeners = new Set<(event: MessageEvent) => void>();

  constructor() {
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  postMessage(data: unknown) {
    for (const instance of FakeBroadcastChannel.instances) {
      if (instance === this) continue;
      instance.listeners.forEach(listener => listener({ data } as MessageEvent));
    }
  }

  close() {
    this.listeners.clear();
  }
}

function stubLocalStorage(): Map<string, string> {
  const data = new Map<string, string>();
  const storage: Storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: key => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: index => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  return data;
}

describe('cross-tab storage sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeBroadcastChannel.instances = [];
  });

  it('broadcasts and receives competition save events', () => {
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const received: CompetitionSavedEvent[] = [];
    const unsubscribe = subscribeCompetitionSaved(event => received.push(event));

    broadcastCompetitionSaved('2026-09-12T00:00:00.000Z', 'competition-1');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      sourceId: TAB_ID,
      competitionId: 'competition-1',
      savedAt: '2026-09-12T00:00:00.000Z',
    });
    unsubscribe();
  });

  it('notifies local persist listeners without window or BroadcastChannel', () => {
    const received: CompetitionSavedEvent[] = [];
    const unsubscribe = subscribeLocalPersistSuccess(event => received.push(event));

    broadcastCompetitionSaved('2026-09-12T00:00:01.000Z', 'competition-2');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ sourceId: TAB_ID, competitionId: 'competition-2' });
    unsubscribe();
  });

  it('decides how to handle a remote save', () => {
    expect(
      resolveRemoteSaveDecision({
        localCompetitionId: 'a',
        remoteCompetitionId: 'b',
        hasUnsavedChanges: true,
      })
    ).toBe('ignore');
    expect(
      resolveRemoteSaveDecision({
        localCompetitionId: 'a',
        remoteCompetitionId: 'a',
        hasUnsavedChanges: true,
      })
    ).toBe('conflict');
    expect(
      resolveRemoteSaveDecision({
        localCompetitionId: 'a',
        remoteCompetitionId: 'a',
        hasUnsavedChanges: false,
      })
    ).toBe('auto-reload');
  });
});

describe('writer lease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses only well-formed leases', () => {
    expect(parseWriterLease(null)).toBeNull();
    expect(parseWriterLease('not-json')).toBeNull();
    expect(parseWriterLease('{"tabId":"tab-a"}')).toBeNull();
    expect(parseWriterLease('{"tabId":"tab-a","expiresAt":1700000000000}')).toEqual({
      tabId: 'tab-a',
      expiresAt: 1700000000000,
    });
  });

  it('claims when free or expired, renews for the owner, waits for another tab', () => {
    expect(resolveWriterLease(null, 'tab-a', 1000)).toBe('claim');
    expect(resolveWriterLease({ tabId: 'tab-a', expiresAt: 5000 }, 'tab-a', 1000)).toBe('renew');
    expect(resolveWriterLease({ tabId: 'tab-b', expiresAt: 5000 }, 'tab-a', 1000)).toBe('wait');
    expect(resolveWriterLease({ tabId: 'tab-b', expiresAt: 999 }, 'tab-a', 1000)).toBe('claim');
  });

  it('reads back written leases and only the owner can release them', () => {
    stubLocalStorage();
    expect(canUseWriterLease()).toBe(true);

    writeWriterLease({ tabId: 'tab-a', expiresAt: 1234 });
    expect(readWriterLease()).toEqual({ tabId: 'tab-a', expiresAt: 1234 });

    releaseWriterLease('tab-b');
    expect(readWriterLease()).toEqual({ tabId: 'tab-a', expiresAt: 1234 });

    releaseWriterLease('tab-a');
    expect(readWriterLease()).toBeNull();
    expect(localStorage.getItem(WRITER_LEASE_KEY)).toBeNull();
  });

  it('treats a corrupted lease value as absent', () => {
    stubLocalStorage();
    localStorage.setItem(WRITER_LEASE_KEY, '{broken');
    expect(readWriterLease()).toBeNull();
  });
});
