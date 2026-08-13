'use client';

import { motion } from 'motion/react';
import { fadeUp, springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { MenuItem } from '@/types';

interface MenuCardProps {
  item: MenuItem;
  eventFree?: boolean;
  effectivePrice?: number;
  /** Ordering is closed — the card still shows, but it can't be tapped. */
  orderingClosed?: boolean;
  onClick: () => void;
}

export default function MenuCard({
  item,
  eventFree,
  effectivePrice,
  orderingClosed,
  onClick,
}: MenuCardProps) {
  const price = effectivePrice ?? item.base_price;
  const isFree = eventFree || item.is_free || price === 0;
  const soldOut = item.is_sold_out;
  const disabled = soldOut || orderingClosed;

  return (
    <motion.button
      type="button"
      variants={fadeUp}
      // Participates in the parent grid's stagger on first paint.
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={springSnappy}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={cn(
        'group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface p-0 text-left shadow-sm',
        'touch-manipulation',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hoverable',
        soldOut && 'opacity-55',
      )}
    >
      {item.image_url && (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-fill-quaternary">
          <img
            src={item.image_url}
            alt={item.name}
            className={cn(
              'h-full w-full object-cover',
              // A slow, small zoom on press — the photo reacts to the touch
              // along with the card, which is what makes the tap feel physical.
              // Tailwind v4 wraps `hover:`/`group-hover:` in `(hover: hover)`
              // itself, so the mouse version can't stick on a phone after a tap.
              'transition-transform duration-500 ease-[var(--ease-out-ios)]',
              'group-active:scale-[1.04] group-hover:scale-[1.03]',
              soldOut && 'grayscale',
            )}
          />
          {soldOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35">
              <span className="rounded-full bg-danger px-3 py-1.5 text-[13px] font-bold uppercase tracking-wide text-white shadow-sm">
                Sold Out
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex-1">
          <h3 className="text-ios-headline text-label">{item.name}</h3>
          {item.description && (
            <p className="text-ios-subhead mt-1 line-clamp-2 text-label-secondary">
              {item.description}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {isFree ? (
            <span className="text-ios-headline text-success">Free</span>
          ) : (
            <span
              className={cn(
                'tnum text-ios-headline',
                soldOut ? 'text-label-tertiary line-through' : 'text-label',
              )}
            >
              ${price.toFixed(2)}
            </span>
          )}

          {/* No image means the sold-out state has nowhere to overlay, so it
              falls back to a chip on the price row. */}
          {soldOut && !item.image_url && (
            <span className="rounded-full bg-danger px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
              Sold Out
            </span>
          )}

          {!disabled && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white">
              <svg viewBox="0 0 14 14" className="h-3 w-3" fill="currentColor">
                <rect y="6" width="14" height="2" rx="1" />
                <rect x="6" width="2" height="14" rx="1" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
