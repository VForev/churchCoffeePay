'use client';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'warm';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-light active:bg-primary-light',
  secondary: 'bg-secondary text-white hover:bg-secondary-light active:bg-secondary-light',
  success: 'bg-success text-white hover:bg-success-light active:bg-success-light',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
  ghost: 'bg-transparent text-text hover:bg-gray-100 active:bg-gray-200',
  warm: 'bg-warm text-white hover:bg-warm-light active:bg-warm-light',
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
        'font-accent font-semibold rounded-[var(--radius-button)] transition-colors duration-200 cursor-pointer touch-manipulation',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
