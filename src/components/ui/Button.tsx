'use client';

import { motion } from 'motion/react';
import { springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'ghost'
  | 'warm'
  /** iOS "tinted" — accent text on a wash of the accent. The quiet action. */
  | 'tinted'
  /** iOS "plain" — text only, no container. Toolbar and inline actions. */
  | 'plain';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: React.ReactNode;
}

/**
 * Filled variants carry their own color and brighten on hover; tinted and plain
 * variants deepen their wash instead, since brightening a near-transparent fill
 * does nothing visible.
 *
 * The hover rules are gated behind `(hover: hover) and (pointer: fine)` in
 * globals.css, so a phone can't get stuck displaying one after a tap.
 */
const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-sm hover-bright',
  secondary: 'bg-secondary text-white shadow-sm hover-bright',
  success: 'bg-success text-white shadow-sm hover-bright',
  danger: 'bg-danger text-white shadow-sm hover-bright',
  warm: 'bg-warm text-white shadow-sm hover-bright',
  tinted: 'bg-primary/12 text-primary hover-tint-strong',
  ghost: 'bg-fill-tertiary text-label hover-tint-strong',
  plain: 'bg-transparent text-primary hover-tint',
};

/** iOS controls are pill-shaped and generously tall — 44px is the minimum
 *  comfortable touch target, which `md` hits exactly. */
const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-[15px] min-h-[34px]',
  md: 'px-5 py-3 text-[17px] min-h-[44px]',
  lg: 'px-7 py-4 text-[17px] min-h-[50px]',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      // Scale-on-press is the single most "native" cue available in a browser.
      // Suppressed when disabled so a dead button doesn't appear responsive.
      whileTap={disabled ? undefined : { scale: size === 'lg' ? 0.98 : 0.96 }}
      transition={springSnappy}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full',
        'font-accent font-semibold tracking-[-0.01em]',
        'cursor-pointer touch-manipulation select-none',
        // Cancels the hover rules rather than letting a dead control light up.
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        !disabled && 'transition-[filter,background-color] duration-200 ease-[var(--ease-out-ios)]',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}
