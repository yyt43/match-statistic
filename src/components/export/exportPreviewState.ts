/**
 * 导出弹窗预览状态（纯函数，便于单测）。
 *
 * P1-15：导出弹窗里的"预览某组/某轮"只改弹窗本地状态，不再调用
 * store.setCurrentGroup / setViewRound 去改全局工作区。
 */

/** 按索引取预览小组；索引非法时退回当前全局小组，保证始终有可渲染的数据。 */
export function resolvePreviewGroup<T extends { id: string }>(
  groups: readonly T[],
  index: number,
  fallback: T
): T {
  if (!Number.isInteger(index) || index < 0 || index >= groups.length) return fallback;
  return groups[index];
}

/** 把预览轮次夹在该小组 1..currentRound 之间（未开赛时保留第 1 轮）。 */
export function clampPreviewRound(group: { currentRound: number }, round: number): number {
  const maxRound = Math.max(1, group.currentRound);
  if (!Number.isFinite(round)) return maxRound;
  return Math.max(1, Math.min(Math.floor(round), maxRound));
}
