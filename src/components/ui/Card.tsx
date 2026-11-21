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
        'bg-surface rounded-2xl shadow-sm border border-gray-100 p-4',
        hover &&
          'hover:shadow-md hover:border-secondary/30 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer',
        // A tappable card squeezes slightly under the finger, like the buttons do.
        interactive && 'cursor-pointer touch-manipulation active:scale-[0.985] transition-transform',
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

/** A grey placeholder block for loading states — same shape as what's coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-xl bg-gray-200/70', className)} />;
}
