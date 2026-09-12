import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  broadcastCompetitionSaved,
  isConcurrentSave,
  subscribeCompetitionSaved,
  TAB_ID,
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

describe('cross-tab storage sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeBroadcastChannel.instances = [];
  });

  it('classifies saves within two seconds as concurrent', () => {
    expect(isConcurrentSave(1000, 2999)).toBe(true);
    expect(isConcurrentSave(1000, 3000)).toBe(false);
    expect(isConcurrentSave(0, 1200)).toBe(false);
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
});
