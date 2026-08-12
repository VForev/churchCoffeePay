'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/**
 * The iOS toggle, at its real dimensions: 51 × 31 with a 27px knob.
 *
 * Size matters more than it looks like it should — the proportions are what
 * make it read as an iOS switch rather than a generic toggle, so these are
 * fixed pixel values rather than something that scales with the type size.
 *
 * The knob is animated by a spring with a little bounce, which reproduces the
 * slight overshoot the real control has when it snaps across.
 */
export default function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full p-[2px]',
        'transition-colors duration-300 ease-[var(--ease-out-ios)]',
        checked ? 'bg-success' : 'bg-fill',
        disabled && 'cursor-not-allowed opacity-40',
        className,
      )}
    >
      <motion.span
        // Animating `x` rather than a layout change keeps this off the layout
        // path entirely — it's a compositor transform, so it stays smooth even
        // with a long settings list re-rendering around it.
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }}
        className="h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)]"
      />
    </button>
  );
}
