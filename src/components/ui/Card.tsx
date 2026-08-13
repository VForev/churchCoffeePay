'use client';

import { motion } from 'motion/react';
import { springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  /** Tappable: adds press feedback. Kept for API compatibility with callers
   *  that used it to mean "this card is interactive". */
  hover?: boolean;
}

/**
 * The grouped-list card. iOS separates a card from the page with lightness
 * and a soft wide shadow, not with a visible border — a 1px outline plus a
 * shadow reads as a web card. In dark mode the shadow does nothing and the
 * lighter surface does all the separating, which is handled by the tokens.
 */
export default function Card({ className, onClick, children, hover = false }: CardProps) {
  const interactive = hover || !!onClick;

  return (
    <motion.div
      whileTap={interactive ? { scale: 0.98 } : undefined}
      transition={springSnappy}
      className={cn(
        'bg-surface rounded-2xl shadow-sm p-4',
        // `hoverable` only does anything on a device with a real cursor, so a
        // tappable card lifts under the mouse and stays flat on a phone.
        interactive && 'cursor-pointer touch-manipulation hoverable',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}
