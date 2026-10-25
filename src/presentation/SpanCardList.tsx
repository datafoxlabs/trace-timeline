import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';

interface Props<T> {
  items: T[];
  itemKey: (item: T) => string;
  children: (item: T) => ReactNode;
  scrollElement: HTMLDivElement | null;
  active: boolean;
  virtualized: boolean;
  estimateSize: number;
  scrollOffset: MutableRefObject<number>;
}

/** Dynamic card heights; only visible cards (and the focused card) own DOM. */
export function SpanCardList<T>({ items, itemKey, children, scrollElement, active, virtualized, estimateSize, scrollOffset }: Props<T>) {
  const windowed = virtualized && items.length > 20;
  const root = useRef<HTMLDivElement>(null);
  const measuredWidth = useRef(0);
  const [margin, setMargin] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const focusedIndex = focusedKey === null ? -1 : items.findIndex(item => itemKey(item) === focusedKey);
  const getItemKey = useCallback((index: number) => itemKey(items[index]), [items, itemKey]);
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const indices = defaultRangeExtractor(range);
    return focusedIndex < 0 || indices.includes(focusedIndex) ? indices : [...indices, focusedIndex].sort((a, b) => a - b);
  }, [focusedIndex]);
  const virtualizer = useVirtualizer({
    count: items.length, getScrollElement: () => active ? scrollElement : null,
    estimateSize: () => estimateSize, getItemKey, overscan: 3,
    enabled: windowed, scrollMargin: margin, useFlushSync: false,
    initialOffset: () => scrollOffset.current, rangeExtractor,
  });
  useLayoutEffect(() => {
    if (!active || !scrollElement || !root.current) return;
    const measure = () => {
      const width = scrollElement.clientWidth;
      if (width && measuredWidth.current && measuredWidth.current !== width) virtualizer.measure();
      if (width) measuredWidth.current = width;
      setMargin(root.current!.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollElement);
    // The preceding SQL toolbar can wrap without changing the viewport size.
    if (root.current.previousElementSibling) observer.observe(root.current.previousElementSibling);
    return () => observer.disconnect();
  }, [active, windowed, scrollElement, virtualizer]);
  useLayoutEffect(() => {
    if (active && scrollElement) scrollElement.scrollTop = scrollOffset.current;
  }, [active, scrollElement, scrollOffset]);
  if (!active) return null;
  if (!windowed) return <>{items.map(item => <div key={itemKey(item)}>{children(item)}</div>)}</>;
  return <div ref={root} data-testid="SpanCardList" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
    {virtualizer.getVirtualItems().map(row => <div key={row.key} data-index={row.index} ref={virtualizer.measureElement}
      data-card-index={row.index} style={{ position: 'absolute', top: 0, left: 0, width: '100%', display: 'flow-root', transform: `translateY(${row.start - margin}px)` }}
      onFocusCapture={() => setFocusedKey(itemKey(items[row.index]))}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocusedKey(null); }}
      onKeyDown={event => {
        if (!(event.target as HTMLElement).matches('[data-slot="accordion-header"]')) return;
        const next = event.key === 'ArrowDown' ? row.index + 1 : event.key === 'ArrowUp' ? row.index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
        if (next < 0 || next >= items.length) return;
        event.preventDefault();
        setFocusedKey(itemKey(items[next]));
        virtualizer.scrollToIndex(next, { align: 'auto' });
        requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-card-index="${next}"] [data-slot="accordion-header"]`)?.focus({ preventScroll: true }));
      }}>
      {children(items[row.index])}
    </div>)}
  </div>;
}
