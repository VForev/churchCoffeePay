'use client';

import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  hover?: boolean;
}

export default function Card({ className, onClick, children, hover = false }: CardProps) {
  const interactive = !!onClick;

  return (
    <div
      className={cn(
        'bg-surface rounded-2xl shadow-sm border border-gray-100/80 p-4',
        hover &&
          'cursor-pointer transition-[transform,box-shadow,border-color] duration-300 ease-snappy hover:-translate-y-0.5 hover:shadow-md hover:border-primary/15',
        // A tappable card squeezes slightly under the finger, like the buttons do.
        interactive && 'pressable cursor-pointer',
        className,
      )}
      onClick={onClick}
      // A clickable div is invisible to the keyboard and to screen readers unless it says
      // it's a button and answers Enter / Space like one.
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

/**
 * A grey placeholder block for loading states — same shape as what's coming, with a soft
 * sheen passing over it (iOS-style) rather than the whole block blinking.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-shimmer rounded-xl bg-gray-200/60', className)}
    />
  );
}
