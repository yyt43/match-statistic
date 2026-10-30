const CHANNEL_NAME = 'match-statistic-sync';
const LOCAL_EVENT = 'tournament-saved';

/**
 * 无 Web Locks API 时的备用写者租约 key：同一时刻只允许一个标签页写入。
 * 值形如 {"tabId":"...","expiresAt":1700000000000}。
 */
export const WRITER_LEASE_KEY = 'swiss_tournament_writer_lease';
/** 租约有效期：写者标签页崩溃后，其他页面最多只读这么久即可接管。 */
export const WRITER_LEASE_TTL_MS = 3000;
/** 心跳续约间隔；需明显小于 TTL，保证正常运行时租约不会过期。 */
export const WRITER_LEASE_HEARTBEAT_MS = 1000;

export const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

export interface CompetitionSavedEvent {
  sourceId: string;
  savedAt: string;
  competitionId: string;
}

type CompetitionSavedListener = (event: CompetitionSavedEvent) => void;
const persistSuccessListeners = new Set<CompetitionSavedListener>();

/**
 * 订阅"本标签页成功持久化"事件。
 * 与跨标签页广播不同：不依赖 window / BroadcastChannel，页面监听尚未挂载时也能收到，
 * 供 store 在写入真正落库后清除"有未保存改动"标记。
 */
export function subscribeLocalPersistSuccess(listener: CompetitionSavedListener): () => void {
  persistSuccessListeners.add(listener);
  return () => {
    persistSuccessListeners.delete(listener);
  };
}

export type RemoteSaveDecision = 'ignore' | 'auto-reload' | 'conflict';

export interface RemoteSaveDecisionInput {
  localCompetitionId: string;
  remoteCompetitionId: string;
  /** 本标签页是否有尚未成功持久化的改动 */
  hasUnsavedChanges: boolean;
}

/**
 * 决定收到其他标签页保存后的处理方式：
 * - 不是同一个赛事：忽略；
 * - 本页有未保存改动：必须交给用户选择，绝不静默丢弃编辑；
 * - 本页没有未保存改动：直接加载对方版本。
 */
export function resolveRemoteSaveDecision(input: RemoteSaveDecisionInput): RemoteSaveDecision {
  if (input.localCompetitionId !== input.remoteCompetitionId) return 'ignore';
  return input.hasUnsavedChanges ? 'conflict' : 'auto-reload';
}

export interface WriterLease {
  tabId: string;
  expiresAt: number;
}

export function parseWriterLease(raw: string | null): WriterLease | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const { tabId, expiresAt } = value as { tabId?: unknown; expiresAt?: unknown };
    if (typeof tabId !== 'string' || tabId.length === 0) return null;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
    return { tabId, expiresAt };
  } catch {
    // 损坏的租约按"无租约"处理，下一个标签页可以重新抢占。
    return null;
  }
}

export type WriterLeaseDecision = 'claim' | 'renew' | 'wait';

/**
 * 根据当前租约决定本标签页的动作：
 * - claim：没有租约 / 租约已过期，可以抢占；
 * - renew：租约属于本页，续约即可；
 * - wait：其他标签页持有有效租约，本页只能只读等待。
 */
export function resolveWriterLease(
  lease: WriterLease | null,
  tabId: string,
  now: number = Date.now()
): WriterLeaseDecision {
  if (!lease) return 'claim';
  if (lease.tabId === tabId) return 'renew';
  return lease.expiresAt > now ? 'wait' : 'claim';
}

function getLeaseStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function readWriterLease(): WriterLease | null {
  const storage = getLeaseStorage();
  if (!storage) return null;
  try {
    return parseWriterLease(storage.getItem(WRITER_LEASE_KEY));
  } catch {
    // 隐私模式等场景读取 localStorage 可能抛错，视为没有租约。
    return null;
  }
}

export function writeWriterLease(lease: WriterLease): void {
  const storage = getLeaseStorage();
  if (!storage) return;
  try {
    storage.setItem(WRITER_LEASE_KEY, JSON.stringify(lease));
  } catch {
    // 写入失败时由调用方回读校验，回读不到自己的租约就会退让为只读。
  }
}

/** 仅当租约仍属于该标签页时删除，避免误删别人刚抢到的租约。 */
export function releaseWriterLease(tabId: string): void {
  const storage = getLeaseStorage();
  if (!storage) return;
  try {
    const lease = parseWriterLease(storage.getItem(WRITER_LEASE_KEY));
    if (lease && lease.tabId !== tabId) return;
    storage.removeItem(WRITER_LEASE_KEY);
  } catch {
    // 释放失败不影响租约过期机制。
  }
}

/** localStorage 是否真的可读写；不可用时无法实现跨标签页写保护。 */
export function canUseWriterLease(): boolean {
  const storage = getLeaseStorage();
  if (!storage) return false;
  try {
    const probeKey = `${WRITER_LEASE_KEY}:probe`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

export function broadcastCompetitionSaved(savedAt: string, competitionId: string): void {
  const event: CompetitionSavedEvent = { sourceId: TAB_ID, savedAt, competitionId };
  // 本页持久化成功是同步可知的事实，先通知本页订阅者（含 store 的脏标记清理）。
  persistSuccessListeners.forEach(listener => listener(event));

  if (typeof window === 'undefined') return;
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
