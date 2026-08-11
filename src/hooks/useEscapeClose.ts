import { useEffect } from 'react';

/**
 * 在弹窗打开时监听 ESC 键关闭。
 * 仅当 enabled 为 true（即弹窗已打开）时挂载监听，避免后台误触发。
 *
 * 用法：
 *   useEscapeClose(isOpen, onClose);
 */
export function useEscapeClose(enabled: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // 使用 capture 阶段，确保在 input 的 ESC 之前拦截到弹窗关闭
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
    // onClose 引用变化时不应重新绑定，仅依赖 enabled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
