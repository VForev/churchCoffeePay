'use client';

import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Category } from '@/types';

interface CategoryTabsProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * The category row, with one selection capsule that slides from tab to tab.
 *
 * The capsule is a single element positioned under the active tab, rather than each tab
 * colouring itself in, so changing category reads as movement — the way a segmented
 * control does on iOS. It's placed by writing to its style directly (no state, so no
 * extra render per tap), and re-placed if the row resizes: a late-loading font or a
 * phone turned sideways changes every tab's width.
 */
export default function CategoryTabs({ categories, activeId, onSelect, className }: CategoryTabsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const placedOnce = useRef(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const pill = pillRef.current;
    if (!row || !pill) return;

    const place = () => {
      const active = row.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) {
        pill.style.opacity = '0';
        return;
      }
      // First placement jumps straight there; every later one glides.
      if (!placedOnce.current) pill.style.transition = 'none';
      pill.style.opacity = '1';
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
      if (!placedOnce.current) {
        placedOnce.current = true;
        requestAnimationFrame(() => {
          pill.style.transition = '';
        });
      }
    };

    place();

    // Keep the chosen tab in view — on a phone the row is wider than the screen, and a
    // selected tab half off the edge looks like a mis-tap. Scrolls the row only:
    // scrollIntoView would also drag the whole page down to the tabs on first load.
    const active = row.querySelector<HTMLElement>('[aria-selected="true"]');
    if (active) {
      row.scrollTo({
        left: active.offsetLeft - row.clientWidth / 2 + active.offsetWidth / 2,
        behavior: 'smooth',
      });
    }

    const ro = new ResizeObserver(place);
    ro.observe(row);
    for (const el of row.querySelectorAll('[role="tab"]')) ro.observe(el);
    return () => ro.disconnect();
  }, [activeId, categories]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Menu categories"
      className={cn('scrollbar-hide relative -mx-4 flex gap-1 overflow-x-auto px-4 py-1', className)}
    >
      <span
        ref={pillRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-1 h-[calc(100%-0.5rem)] rounded-full bg-primary opacity-0 shadow-md shadow-primary/25 transition-[transform,width] duration-500 ease-ios"
      />
      {categories.map((cat) => {
        const active = activeId === cat.id;
        return (
          <button
            key={cat.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'relative z-10 shrink-0 cursor-pointer touch-manipulation whitespace-nowrap rounded-full px-4 py-2 font-accent text-[15px] font-semibold tracking-[-0.01em] transition-[color,background-color,transform] duration-300 active:scale-95',
              active ? 'text-white' : 'text-text hover:bg-gray-100 hover:text-text-dark',
            )}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}
