'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface Segment {
  id: string;
  label: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
  /** Let the control scroll sideways instead of dividing the width evenly.
   *  Use when the segments are data (drink categories), not a fixed few. */
  scrollable?: boolean;
}

/**
 * iOS segmented control.
 *
 * The white pill is a single element that *moves* between segments via a
 * shared `layoutId`, rather than each segment fading its own background in
 * and out. That distinction is the whole effect: Framer measures the old and
 * new positions and interpolates, so the pill slides and stretches to its new
 * home the way the real control does.
 *
 * `layoutId` must be unique per mounted control, so it's keyed off the
 * segment ids — two controls on one page would otherwise fling their pills
 * across the screen at each other.
 */
export default function SegmentedControl({
  segments,
  activeId,
  onSelect,
  className,
  scrollable = false,
}: SegmentedControlProps) {
  const groupId = `seg-${segments.map((s) => s.id).join('-').slice(0, 40)}`;

  return (
    <div
      className={cn(
        'rounded-[var(--r-md)] bg-fill-tertiary p-[2px]',
        scrollable ? 'scrollbar-hide flex gap-0 overflow-x-auto' : 'inline-flex w-full',
        className,
      )}
    >
      {segments.map((seg) => {
        const active = seg.id === activeId;
        return (
          <button
            key={seg.id}
            onClick={() => onSelect(seg.id)}
            className={cn(
              'relative cursor-pointer rounded-[calc(var(--r-md)-2px)] px-4 py-1.5',
              'text-[15px] font-medium tracking-[-0.01em] whitespace-nowrap',
              'transition-colors duration-200',
              scrollable ? 'shrink-0' : 'flex-1',
              active ? 'text-label' : 'text-label-secondary',
            )}
          >
            {active && (
              <motion.span
                layoutId={groupId}
                transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                className="absolute inset-0 rounded-[calc(var(--r-md)-2px)] bg-plain shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_1px_rgba(0,0,0,0.06)]"
              />
            )}
            {/* Sits above the sliding pill. */}
            <span className="relative z-10">{seg.label}</span>
          </button>
        );
      })}
    </div>
  );
}
