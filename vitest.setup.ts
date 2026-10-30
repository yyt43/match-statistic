/**
 * 测试环境的最小 localStorage 实现（仅测试使用，不影响生产行为）。
 *
 * 生产代码在 IndexedDB 不可用时会回退到 localStorage；node 测试环境没有
 * `localStorage`，于是 auditLog / historyStore 的回退路径会打印
 * "[audit] localStorage write failed" / "[history] localStorage fallback write failed"
 * 之类的噪声。这里提供一个内存实现，让回退路径按设计正常工作；
 * 各测试如果显式 stub 了会抛错的 localStorage，仍然会走到真实的失败分支，
 * 因此不会掩盖错误，只是消除"环境缺少 Web Storage"造成的假失败。
 *
 * 注意：测试内自己用 vi.stubGlobal('localStorage', ...) 时仍优先使用自己的实现；
 * 调用 vi.unstubAllGlobals() 后会恢复到这里定义的内存实现。
 */
function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}
