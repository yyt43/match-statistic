/**
 * 全局快捷键守卫（纯逻辑，便于单测）。
 *
 * P1-15：全局快捷键不能穿透弹窗。这里统一用 DOM 信号判断是否有覆盖层打开，
 * 避免维护一份容易漏项的弹窗布尔列表。
 */

/** 带 aria-modal 或 role=dialog 的节点都视为"有弹窗/覆盖层打开"。 */
export const OVERLAY_SELECTOR = '[aria-modal="true"], [role="dialog"]';

/** 只依赖 querySelector，便于在测试里传一个假对象。 */
export interface OverlayLookup {
  querySelector(selector: string): unknown;
}

/** 页面上是否有打开的弹窗/覆盖层。 */
export function hasOpenOverlay(doc: OverlayLookup | null | undefined): boolean {
  if (!doc) return false;
  return Boolean(doc.querySelector(OVERLAY_SELECTOR));
}

/** 事件目标是否属于可编辑控件（输入框内不触发全局撤销/重做）。 */
export interface EditableShortcutTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

export function isEditableShortcutTarget(
  target: EditableShortcutTarget | null | undefined
): boolean {
  if (!target) return false;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}

/** Home 页负责的全局快捷键。 */
export type HomeShortcut = 'undo' | 'redo' | 'open-command-palette';

/** 只依赖按键字段，便于在测试里构造事件。 */
export interface ShortcutEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** 把按键事件归类成 Home 快捷键；不匹配返回 null。 */
export function classifyHomeShortcut(event: ShortcutEventLike): HomeShortcut | null {
  const key = event.key.toLowerCase();
  const withModifier = event.ctrlKey || event.metaKey;
  if (!withModifier) return null;
  if (key === 'k') return 'open-command-palette';
  if (key === 'z' && !event.shiftKey) return 'undo';
  if ((key === 'z' && event.shiftKey) || key === 'y') return 'redo';
  return null;
}

/** 结合"弹窗是否打开 / 目标是否可编辑"给出最终要执行的快捷键。 */
export interface ShortcutGuardOptions {
  hasOpenOverlay: boolean;
  targetEditable: boolean;
}

export function resolveHomeShortcut(
  intent: HomeShortcut | null,
  options: ShortcutGuardOptions
): HomeShortcut | null {
  if (!intent) return null;
  // 任何弹窗打开时，Home 的全局快捷键一律不触发。
  if (options.hasOpenOverlay) return null;
  // 输入框内保留原行为：不触发撤销/重做，但 Ctrl+K 仍可打开命令面板。
  if (options.targetEditable && intent !== 'open-command-palette') return null;
  return intent;
}
