'use client';

import SegmentedControl from '@/components/ui/SegmentedControl';
import type { Category } from '@/types';

interface CategoryTabsProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * The category rail is a scrollable iOS segmented control — the white pill
 * slides between categories rather than each tab lighting up independently.
 *
 * Scrollable rather than evenly divided because the categories come from the
 * database: five of them fit, but nine would crush the labels to nothing.
 */
export default function CategoryTabs({ categories, activeId, onSelect }: CategoryTabsProps) {
  return (
    <SegmentedControl
      scrollable
      segments={categories.map((c) => ({ id: c.id, label: c.name }))}
      activeId={activeId}
      onSelect={onSelect}
    />
  );
}
