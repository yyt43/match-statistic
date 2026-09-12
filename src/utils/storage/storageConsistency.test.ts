import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';

type RequestHandler = (() => void) | null;

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onupgradeneeded: RequestHandler = null;
  onblocked: RequestHandler = null;
  onsuccess: RequestHandler = null;
  onerror: RequestHandler = null;
}

class FakeObjectStore {
  constructor(
    private values: Map<string, unknown>,
    private writeDelayMs: number
  ) {}

  get(key: string): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>();
    queueMicrotask(() => {
      request.result = this.values.get(key);
      request.onsuccess?.();
    });
    return request;
  }

  put(value: unknown, key: string): FakeRequest<string> {
    const request = new FakeRequest<string>();
    setTimeout(() => {
      this.values.set(key, value);
      request.result = key;
      request.onsuccess?.();
    }, this.writeDelayMs);
    return request;
  }

  delete(key: string): FakeRequest<undefined> {
    const request = new FakeRequest<undefined>();
    queueMicrotask(() => {
      this.values.delete(key);
      request.result = undefined;
      request.onsuccess?.();
    });
    return request;
  }
}

class FakeTransaction {
  onabort: RequestHandler = null;
  error: Error | null = null;

  constructor(
    private values: Map<string, unknown>,
    private writeDelayMs: number
  ) {}

  objectStore(): FakeObjectStore {
    return new FakeObjectStore(this.values, this.writeDelayMs);
  }
}

class FakeDatabase {
  onversionchange: RequestHandler = null;
  objectStoreNames = { contains: () => true };

  constructor(
    private values: Map<string, unknown>,
    private writeDelayMs: number
  ) {}

  transaction(): FakeTransaction {
    return new FakeTransaction(this.values, this.writeDelayMs);
  }

  close(): void {}
}

function stubIndexedDb(values: Map<string, unknown>, writeDelayMs = 0) {
  const open = () => {
    const request = new FakeRequest<FakeDatabase>();
    queueMicrotask(() => {
      request.result = new FakeDatabase(values, writeDelayMs);
      request.onsuccess?.();
    });
    return request;
  };
  vi.stubGlobal('indexedDB', { open });
}

function envelope(name: string, savedAt: string) {
  return {
    version: 4,
    savedAt,
    data: createNewCompetition(name),
  };
}

describe('storage consistency', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('BroadcastChannel', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('broadcasts only after the persistence queue finishes', async () => {
    const indexedValues = new Map<string, unknown>();
    stubIndexedDb(indexedValues, 25);
    const { flushStorage, saveCompetition } = await import('./storage');
    const { subscribeCompetitionSaved } = await import('./storageSync');
    const received: string[] = [];
    const unsubscribe = subscribeCompetitionSaved(event => received.push(event.savedAt));

    saveCompetition(createNewCompetition('Queued save'));
    expect(received).toHaveLength(0);

    await flushStorage();
    expect(received).toHaveLength(1);
    unsubscribe();
  });

  it('loads a newer local mirror instead of an older IndexedDB value', async () => {
    const indexedValues = new Map<string, unknown>();
    indexedValues.set('swiss_tournament_data', envelope(
      'Older IndexedDB',
      '2026-09-12T00:00:00.000Z'
    ));
    values.set('swiss_tournament_data', JSON.stringify(envelope(
      'Newer local mirror',
      '2026-09-12T00:01:00.000Z'
    )));
    stubIndexedDb(indexedValues);
    const { flushStorage, loadCompetition } = await import('./storage');

    const loaded = await loadCompetition();
    expect(loaded?.name).toBe('Newer local mirror');
    await flushStorage();
  });
});
