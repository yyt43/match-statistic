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
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE_NAME, mode);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let settled = false;
    let requestResult: T | undefined;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    // put/delete 的 request.onsuccess 只代表请求执行完毕，事务真正提交还要等
    // oncomplete；配额不足或 versionchange 会触发 abort，此时必须按失败处理，
    // 否则上层会把没落库的数据当成保存成功并广播。
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(requestResult as T);
    };
    transaction.onabort = () => fail(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => fail(transaction.error ?? new Error('IndexedDB transaction failed'));

    let request: IDBRequest<T>;
    try {
      request = operation(transaction.objectStore(STORE_NAME));
    } catch (error) {
      fail(error);
      return;
    }

    request.onsuccess = () => {
      requestResult = request.result;
    };
    request.onerror = () => fail(request.error ?? new Error('IndexedDB request failed'));
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
