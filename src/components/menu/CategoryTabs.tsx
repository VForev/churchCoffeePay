'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Category } from '@/types';

interface CategoryTabsProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export default function CategoryTabs({ categories, activeId, onSelect, className }: CategoryTabsProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep the chosen tab in view — on a phone the row is wider than the screen, and a
  // selected tab half off the edge looks like a mis-tap.
  useEffect(() => {
    // Scrolls the row only — scrollIntoView would also drag the whole page down to the
    // tabs on first load, past the banner the customer hasn't read yet.
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !active) return;
    row.scrollTo({
      left: active.offsetLeft - row.clientWidth / 2 + active.offsetWidth / 2,
      behavior: 'smooth',
    });
  }, [activeId]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Menu categories"
      className={cn('scrollbar-hide relative -mx-4 flex gap-2 overflow-x-auto px-4 py-1', className)}
    >
      {categories.map((cat) => {
        const active = activeId === cat.id;
        return (
          <button
            key={cat.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'shrink-0 cursor-pointer touch-manipulation whitespace-nowrap rounded-full px-4 py-2 font-accent text-sm font-semibold transition-all duration-200 active:scale-95',
              active
                ? 'bg-primary text-white shadow-md shadow-primary/25'
                : 'bg-surface text-text ring-1 ring-gray-200 hover:text-primary hover:ring-primary/30',
            )}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}
