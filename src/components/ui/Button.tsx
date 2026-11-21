'use client';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'warm';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner beside the label. Does NOT disable the button — pass `disabled` too. */
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white shadow-sm shadow-primary/25 hover:bg-primary-light active:bg-primary-light',
  secondary:
    'bg-secondary text-white shadow-sm shadow-secondary/25 hover:bg-secondary-light active:bg-secondary-light',
  success:
    'bg-success text-white shadow-sm shadow-success/25 hover:bg-success-light active:bg-success-light',
  danger: 'bg-danger text-white shadow-sm shadow-danger/25 hover:brightness-110 active:brightness-95',
  ghost: 'bg-transparent text-text hover:bg-gray-100 active:bg-gray-200',
  warm: 'bg-warm text-white shadow-sm shadow-warm/25 hover:bg-warm-light active:bg-warm-light',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3.5 text-lg',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        // Not `rounded-full`: that compiles to a hard-coded calc(infinity * 1px), which the
        // Corners setting at /admin/theme could never reach. --radius-button is declared in
        // globals.css and defaults to a pill, so this is the same shape it has always been.
        'inline-flex items-center justify-center gap-2 font-accent font-semibold rounded-[var(--radius-button)] cursor-pointer touch-manipulation select-none',
        // A press you can feel: a short squeeze, so a tap on a slow connection still
        // visibly "took" — the absence of that is what makes people tap twice.
        'transition-[background-color,transform,filter,box-shadow] duration-150 enabled:active:scale-[0.97]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
