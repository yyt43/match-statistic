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

/** 模拟单个事务：请求成功后由 objectStore 触发 complete，失败则触发 abort。 */
class FakeTransaction {
  oncomplete: RequestHandler = null;
  onabort: RequestHandler = null;
  onerror: RequestHandler = null;
  error: Error | null = null;

  constructor(
    private values: Map<string, unknown>,
    private writeDelayMs: number,
    private failWrites: boolean
  ) {}

  objectStore(): FakeObjectStore {
    return new FakeObjectStore(this.values, this.writeDelayMs, this.failWrites, this);
  }

  /** 真实 IndexedDB 在请求成功后的事件循环末尾触发 oncomplete。 */
  complete(): void {
    queueMicrotask(() => this.oncomplete?.());
  }

  abort(error: Error): void {
    this.error = error;
    queueMicrotask(() => this.onabort?.());
  }
}

class FakeObjectStore {
  constructor(
    private values: Map<string, unknown>,
    private writeDelayMs: number,
    private failWrites: boolean,
    private transaction: FakeTransaction
  ) {}

  get(key: string): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>();
    queueMicrotask(() => {
      request.result = this.values.get(key);
      request.onsuccess?.();
      this.transaction.complete();
    });
    return request;
  }

  put(value: unknown, key: string): FakeRequest<string> {
    const request = new FakeRequest<string>();
    setTimeout(() => {
      if (this.failWrites) {
        const error = new Error('QuotaExceededError');
        request.error = error;
        request.onerror?.();
        this.transaction.abort(error);
        return;
      }
      this.values.set(key, value);
      request.result = key;
      request.onsuccess?.();
      this.transaction.complete();
    }, this.writeDelayMs);
    return request;
  }

  delete(key: string): FakeRequest<undefined> {
    const request = new FakeRequest<undefined>();
    setTimeout(() => {
      if (this.failWrites) {
        const error = new Error('QuotaExceededError');
        request.error = error;
        request.onerror?.();
        this.transaction.abort(error);
        return;
      }
      this.values.delete(key);
      request.result = undefined;
      request.onsuccess?.();
      this.transaction.complete();
    }, this.writeDelayMs);
    return request;
  }
}

class FakeDatabase {
  onversionchange: RequestHandler = null;
  objectStoreNames = { contains: () => true };

  constructor(
    private values: Map<string, unknown>,
    private writeDelayMs: number,
    private failWrites: boolean
  ) {}

  transaction(): FakeTransaction {
    return new FakeTransaction(this.values, this.writeDelayMs, this.failWrites);
  }

  close(): void {}
}

function stubIndexedDb(
  values: Map<string, unknown>,
  writeDelayMs = 0,
  failWrites = false
) {
  const open = () => {
    const request = new FakeRequest<FakeDatabase>();
    queueMicrotask(() => {
      request.result = new FakeDatabase(values, writeDelayMs, failWrites);
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

/** 让 estimateDataSize 认为赛事超过 localStorage 镜像上限（2MB）。 */
function stubLargeBlob(): void {
  vi.stubGlobal('Blob', class {
    size = 3 * 1024 * 1024;
  });
}

const STORAGE_KEY = 'swiss_tournament_data';
const BACKUP_KEY = 'swiss_tournament_data_backup';

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

  it('does not broadcast a save when the IndexedDB transaction aborts', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    });
    stubIndexedDb(new Map(), 0, true);
    const { flushStorage, saveCompetition } = await import('./storage');
    const { subscribeCompetitionSaved } = await import('./storageSync');
    const { getStorageStatus } = await import('./storageStatus');
    const received: string[] = [];
    const unsubscribe = subscribeCompetitionSaved(event => received.push(event.savedAt));

    saveCompetition(createNewCompetition('Aborted save'));
    await flushStorage();

    expect(received).toHaveLength(0);
    expect(getStorageStatus().status).toBe('error');
    unsubscribe();
  });

  it('loads a newer local mirror instead of an older IndexedDB value', async () => {
    const indexedValues = new Map<string, unknown>();
    indexedValues.set(STORAGE_KEY, envelope(
      'Older IndexedDB',
      '2026-09-12T00:00:00.000Z'
    ));
    values.set(STORAGE_KEY, JSON.stringify(envelope(
      'Newer local mirror',
      '2026-09-12T00:01:00.000Z'
    )));
    stubIndexedDb(indexedValues);
    const { flushStorage, loadCompetition } = await import('./storage');

    const loaded = await loadCompetition();
    expect(loaded?.name).toBe('Newer local mirror');
    await flushStorage();
  });

  it('keeps large localStorage mirrors until the IndexedDB write commits', async () => {
    const indexedValues = new Map<string, unknown>();
    stubIndexedDb(indexedValues, 25);
    stubLargeBlob();
    values.set(STORAGE_KEY, 'old-main-mirror');
    values.set(BACKUP_KEY, 'old-backup-mirror');
    const { flushStorage, saveCompetition } = await import('./storage');

    saveCompetition(createNewCompetition('Large competition'));
    // 事务提交前，旧镜像必须还在（避免关页丢数据）。
    expect(values.get(STORAGE_KEY)).toBe('old-main-mirror');
    expect(values.get(BACKUP_KEY)).toBe('old-backup-mirror');

    await flushStorage();
    expect(indexedValues.has(STORAGE_KEY)).toBe(true);
    expect(values.has(STORAGE_KEY)).toBe(false);
    expect(values.has(BACKUP_KEY)).toBe(false);
  });

  it('keeps old mirrors when a large save fails', async () => {
    stubIndexedDb(new Map(), 0, true);
    stubLargeBlob();
    values.set(STORAGE_KEY, 'old-main-mirror');
    values.set(BACKUP_KEY, 'old-backup-mirror');
    const { flushStorage, saveCompetition } = await import('./storage');
    const { getStorageStatus } = await import('./storageStatus');

    saveCompetition(createNewCompetition('Large save failure'));
    await flushStorage();

    expect(values.get(STORAGE_KEY)).toBe('old-main-mirror');
    expect(values.get(BACKUP_KEY)).toBe('old-backup-mirror');
    expect(getStorageStatus().status).toBe('error');
  });

  it('records the saved timestamp in the meta key for large competitions', async () => {
    const indexedValues = new Map<string, unknown>();
    stubIndexedDb(indexedValues);
    stubLargeBlob();
    const { META_KEY, flushStorage, getLastSavedAt, saveCompetition } = await import('./storage');

    saveCompetition(createNewCompetition('Large with meta'));
    await flushStorage();

    const meta = JSON.parse(values.get(META_KEY) ?? 'null') as { savedAt?: string } | null;
    expect(meta?.savedAt).toBeTruthy();
    expect(meta?.savedAt).toBe(getLastSavedAt());
    expect(indexedValues.has(META_KEY)).toBe(true);
  });

  it('flushes queued writes when the document becomes hidden', async () => {
    class FakeDocument extends EventTarget {
      visibilityState: DocumentVisibilityState = 'hidden';
    }
    const fakeDocument = new FakeDocument();
    vi.stubGlobal('document', fakeDocument);
    const indexedValues = new Map<string, unknown>();
    stubIndexedDb(indexedValues);
    const { saveCompetition } = await import('./storage');

    saveCompetition(createNewCompetition('Hidden save'));
    fakeDocument.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(() => expect(indexedValues.has(STORAGE_KEY)).toBe(true));
  });

  it('flushes queued writes on pagehide', async () => {
    const indexedValues = new Map<string, unknown>();
    stubIndexedDb(indexedValues);
    const { saveCompetition } = await import('./storage');

    saveCompetition(createNewCompetition('Pagehide save'));
    window.dispatchEvent(new Event('pagehide'));

    await vi.waitFor(() => expect(indexedValues.has(STORAGE_KEY)).toBe(true));
  });

  it('reports corrupt stored data instead of pretending nothing is saved', async () => {
    values.set(STORAGE_KEY, '{not valid json');
    values.set(BACKUP_KEY, JSON.stringify({
      version: 4,
      savedAt: '2026-09-12T00:00:00.000Z',
      data: { id: 'broken' },
    }));
    stubIndexedDb(new Map());
    const {
      collectStoredRawRecords,
      loadCompetition,
      loadCompetitionResult,
    } = await import('./storage');

    const result = await loadCompetitionResult();
    expect(result.status).toBe('corrupt');
    expect(result.error).toContain('local-main');
    expect(result.error).toContain('local-backup');
    // 损坏数据不会被清空或覆盖。
    expect(values.get(STORAGE_KEY)).toBe('{not valid json');
    expect(await loadCompetition()).toBeNull();

    const records = await collectStoredRawRecords();
    expect(records.map(record => record.source)).toEqual(
      expect.arrayContaining(['local-main', 'local-backup'])
    );
    expect(records.find(record => record.source === 'local-main')?.raw).toBe('{not valid json');
  });

  it('reports an empty result when nothing is stored', async () => {
    stubIndexedDb(new Map());
    const { loadCompetitionResult } = await import('./storage');

    expect((await loadCompetitionResult()).status).toBe('empty');
  });
});
