'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

/**
 * The iOS ± stepper: one filled capsule split by a hairline, not two separate
 * round buttons. Used for cart quantities.
 *
 * The value uses tabular figures so the capsule doesn't change width — and
 * therefore doesn't nudge everything beside it — when the count crosses from
 * 9 to 10.
 */
export default function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  className,
}: StepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden rounded-full bg-fill-tertiary',
        className,
      )}
    >
      <motion.button
        whileTap={atMin ? undefined : { scale: 0.88 }}
        onClick={() => !atMin && onChange(value - 1)}
        disabled={atMin}
        aria-label="Decrease"
        className={cn(
          'flex h-8 w-9 cursor-pointer items-center justify-center text-label',
          'hover-tint-strong transition-colors duration-150',
          atMin && 'cursor-not-allowed opacity-30',
        )}
      >
        <svg viewBox="0 0 14 2" className="h-[2px] w-3.5" fill="currentColor">
          <rect width="14" height="2" rx="1" />
        </svg>
      </motion.button>

      <span className="tnum min-w-[24px] text-center text-[15px] font-semibold text-label">
        {value}
      </span>

      <motion.button
        whileTap={atMax ? undefined : { scale: 0.88 }}
        onClick={() => !atMax && onChange(value + 1)}
        disabled={atMax}
        aria-label="Increase"
        className={cn(
          'flex h-8 w-9 cursor-pointer items-center justify-center text-label',
          'hover-tint-strong transition-colors duration-150',
          atMax && 'cursor-not-allowed opacity-30',
        )}
      >
        <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="currentColor">
          <rect y="6" width="14" height="2" rx="1" />
          <rect x="6" width="2" height="14" rx="1" />
        </svg>
      </motion.button>
    </div>
  );
}
