const DB_NAME = 'match-statistic-storage';
const DB_VERSION = 1;
const STORE_NAME = 'key-value';

let databasePromise: Promise<IDBDatabase | null> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };

    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked by another tab'));
  }).catch(error => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const database = await openDatabase();
  if (!database) return null;

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function idbGet<T>(key: string): Promise<T | null> {
  return runRequest('readonly', store => store.get(key) as IDBRequest<T | undefined>)
    .then(value => value ?? null);
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return runRequest('readwrite', store => store.put(value, key)).then(() => undefined);
}

export function idbDelete(key: string): Promise<void> {
  return runRequest('readwrite', store => store.delete(key)).then(() => undefined);
}
