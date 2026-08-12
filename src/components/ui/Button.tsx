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
 * Filled variants carry their own color; hover is left almost alone because
 * the primary target here is touch, where hover doesn't exist and a hover
 * rule just causes a stuck highlight after tapping on iOS.
 */
const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-sm',
  secondary: 'bg-secondary text-white shadow-sm',
  success: 'bg-success text-white shadow-sm',
  danger: 'bg-danger text-white shadow-sm',
  warm: 'bg-warm text-white shadow-sm',
  tinted: 'bg-primary/12 text-primary',
  ghost: 'bg-fill-tertiary text-label',
  plain: 'bg-transparent text-primary',
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
        'disabled:opacity-40 disabled:cursor-not-allowed',
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
