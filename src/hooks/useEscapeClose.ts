import { useEffect, useRef } from 'react';

/**
 * ESC 关闭栈（P1-15）。
 *
 * 多个弹窗叠开时，一次 ESC 只能关闭最上层弹窗。所有弹窗共用一个合成器：
 * 弹窗按打开顺序入栈，栈顶先关；监听器只在 document capture 阶段注册一次，
 * 不再依赖 e.stopPropagation()（同一节点的其它 capture 监听不受其阻挡）。
 */
export interface EscapeStackEntry {
  id: number;
  close: () => void;
}

export interface EscapeStack {
  push(close: () => void): EscapeStackEntry;
  remove(entry: EscapeStackEntry): void;
  size(): number;
  /** 关闭栈顶并返回 true；空栈返回 false。每次调用最多关闭一个弹窗。 */
  closeTop(): boolean;
}

export function createEscapeStack(): EscapeStack {
  const entries: EscapeStackEntry[] = [];
  let nextId = 1;

  return {
    push(close) {
      const entry: EscapeStackEntry = { id: nextId, close };
      nextId += 1;
      entries.push(entry);
      return entry;
    },
    remove(entry) {
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
    },
    size() {
      return entries.length;
    },
    closeTop() {
      // 先出栈再关闭：即使关闭回调触发重渲染/卸载，重复的 ESC 也不会再次命中同一层。
      const top = entries.pop();
      if (!top) return false;
      top.close();
      return true;
    },
  };
}

const escapeStack = createEscapeStack();
let listenerAttached = false;

function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (escapeStack.size() === 0) return;
  // 只关闭最上层，避免一次 ESC 关掉多层弹窗。
  event.preventDefault();
  escapeStack.closeTop();
}

function attachEscapeListener(): void {
  if (listenerAttached) return;
  document.addEventListener('keydown', handleEscapeKey, true);
  listenerAttached = true;
}

function detachEscapeListenerIfIdle(): void {
  if (!listenerAttached || escapeStack.size() > 0) return;
  document.removeEventListener('keydown', handleEscapeKey, true);
  listenerAttached = false;
}

export function useEscapeClose(enabled: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const entry = escapeStack.push(() => onCloseRef.current());
    attachEscapeListener();
    return () => {
      escapeStack.remove(entry);
      detachEscapeListenerIfIdle();
    };
  }, [enabled]);
}
