import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;
    const previousFocus = document.activeElement as HTMLElement | null;

    const getFocusable = () => Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(element => !element.hasAttribute('disabled') && element.offsetParent !== null);

    const focusFirst = () => {
      const focusable = getFocusable();
      (focusable[0] ?? container).focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const timer = window.setTimeout(focusFirst, 0);
    container.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      container.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [containerRef, isOpen]);
}
