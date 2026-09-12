import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  className?: string;
  overscan?: number;
  role?: string;
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  renderItem,
  getKey,
  className = '',
  overscan = 4,
  role,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewportHeight = () => setViewportHeight(container.clientHeight);
    updateViewportHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateViewportHeight);
      observer.observe(container);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  const visibleCount = Math.max(1, Math.ceil(viewportHeight / itemHeight));
  const maxStartIndex = Math.max(0, items.length - visibleCount);
  const startIndex = Math.min(
    maxStartIndex,
    Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  );
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);
  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      role={role}
      className={`overflow-y-auto ${className}`}
      onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: items.length * itemHeight }}>
        {visibleItems.map((item, offset) => {
          const index = startIndex + offset;
          return (
            <div
              key={getKey(item, index)}
              className="absolute inset-x-0"
              style={{ height: itemHeight, top: index * itemHeight }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
