export const BRACKET_MIN_ZOOM = 0.3;
export const BRACKET_MAX_ZOOM = 2;
export const BRACKET_ZOOM_STEP = 0.1;

/**
 * 签表缩放的边界收敛：限制在 [MIN, MAX]，并保留两位小数避免浮点累加出 0.7000000001。
 */
export function clampBracketZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const bounded = Math.min(BRACKET_MAX_ZOOM, Math.max(BRACKET_MIN_ZOOM, value));
  return Math.round(bounded * 100) / 100;
}

/**
 * 自适应缩放：内容比容器宽时整体缩小到刚好铺满（含 2px 余量），放得下就保持 100%。
 * 容器宽度未知（首帧未测量）时按 100% 处理，避免闪一下再缩放。
 */
export function computeBracketFitZoom(contentWidth: number, viewportWidth: number): number {
  if (contentWidth <= 0 || viewportWidth <= 0) return 1;
  return clampBracketZoom(Math.min(1, (viewportWidth - 2) / contentWidth));
}
