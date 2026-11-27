'use client';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'warm' | 'tinted';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner beside the label. Does NOT disable the button — pass `disabled` too. */
  loading?: boolean;
  children: React.ReactNode;
}

// Filled buttons are flat colour with a faint tinted lift, the way iOS draws them — not a
// grey drop shadow. Hover brightens rather than switching to a second colour, so a hover
// on a dark scheme can't land on a value nobody picked.
const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white shadow-sm shadow-primary/20 enabled:hover:brightness-110 enabled:active:brightness-95',
  secondary:
    'bg-secondary text-white shadow-sm shadow-secondary/20 enabled:hover:brightness-110 enabled:active:brightness-95',
  success:
    'bg-success text-white shadow-sm shadow-success/20 enabled:hover:brightness-110 enabled:active:brightness-95',
  danger:
    'bg-danger text-white shadow-sm shadow-danger/20 enabled:hover:brightness-110 enabled:active:brightness-95',
  ghost: 'bg-transparent text-text enabled:hover:bg-gray-100 enabled:active:bg-gray-200',
  warm: 'bg-warm text-white shadow-sm shadow-warm/20 enabled:hover:brightness-110 enabled:active:brightness-95',
  // Apple's "tinted" style: the brand colour as a soft fill with the label in full colour.
  // For the second action beside a filled one.
  tinted: 'bg-primary/10 text-primary enabled:hover:bg-primary/15 enabled:active:bg-primary/20',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-sm',
  md: 'min-h-11 px-5 py-2.5 text-[15px]',
  lg: 'min-h-[3.25rem] px-7 py-3.5 text-[17px]',
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
        // A press you can feel: a quick squeeze down, then a slower spring back up, so a
        // tap on a slow connection still visibly "took" — the absence of that is what
        // makes people tap twice.
        'tracking-[-0.01em] transition-[background-color,transform,filter,box-shadow,opacity] duration-300 ease-snappy enabled:active:scale-[0.96] enabled:active:duration-75',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
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
