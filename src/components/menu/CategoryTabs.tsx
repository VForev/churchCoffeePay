'use client';

import { cn } from '@/lib/utils';
import type { Category } from '@/types';

interface CategoryTabsProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export default function CategoryTabs({ categories, activeId, onSelect }: CategoryTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            'px-5 py-2 rounded-full font-accent font-semibold text-sm whitespace-nowrap transition-all duration-200',
            'border-2 cursor-pointer',
            activeId === cat.id
              ? 'bg-primary text-white border-primary'
              : 'bg-surface text-text border-gray-200 hover:border-primary/30 hover:text-primary',
          )}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
