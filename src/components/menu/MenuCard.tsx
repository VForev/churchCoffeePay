'use client';

import { cn } from '@/lib/utils';
import { useSitePictures } from '@/lib/use-pictures';
import DrinkPicture from './DrinkPicture';
import type { MenuItem } from '@/types';

interface MenuCardProps {
  item: MenuItem;
  eventFree?: boolean;
  effectivePrice?: number;
  /** Ordering is closed — the card still shows, but it can't be tapped. */
  orderingClosed?: boolean;
  /** How many of this drink are already in the order — shown as a small count. */
  inCart?: number;
  /** Position in the list, so the cards arrive one after another rather than as a slab. */
  index?: number;
  onClick: () => void;
}

/**
 * One drink on the menu, as a row: picture (or a cup), name and blurb, price, and a "+"
 * that says "tap me" without needing to be read. A real <button>, so it works from a
 * keyboard and a screen reader says what it is.
 */
export default function MenuCard({
  item,
  eventFree,
  effectivePrice,
  orderingClosed,
  inCart = 0,
  index = 0,
  onClick,
}: MenuCardProps) {
  const price = effectivePrice ?? item.base_price;
  const isFree = eventFree || item.is_free || price === 0;
  const soldOut = item.is_sold_out;
  const disabled = soldOut || orderingClosed;
  const pictures = useSitePictures();

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={`${item.name}${soldOut ? ', sold out' : ''}${isFree ? ', free' : `, $${price.toFixed(2)}`}`}
      style={{ '--stagger': index } as React.CSSProperties}
      className={cn(
        'group relative flex h-full w-full animate-rise items-stretch gap-3.5 rounded-2xl border bg-surface p-3 text-left shadow-sm',
        'transition-[transform,box-shadow,border-color] duration-300 ease-snappy',
        disabled
          ? 'cursor-not-allowed border-gray-100/80'
          : 'cursor-pointer touch-manipulation border-gray-100/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:duration-100',
        inCart > 0 && !disabled && 'border-primary/30 ring-1 ring-primary/15',
      )}
    >
      {/* Its photo, the shop's default picture, a cup tile, or — with "No pictures" set
          at /admin/pictures — nothing, and the card becomes a names-only row. */}
      <DrinkPicture
        item={item}
        pictures={pictures}
        soldOut={soldOut}
        className="h-20 w-20 rounded-[0.875rem]"
      />

      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div>
          <h3
            className={cn(
              'font-heading text-[17px] font-semibold leading-tight text-text-dark',
              soldOut && 'text-text-light line-through',
            )}
          >
            {item.name}
          </h3>
          {item.description && (
            <p className="mt-1 line-clamp-2 font-body text-[14px] leading-snug text-text-light">
              {item.description}
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          {soldOut ? (
            <span className="inline-flex items-center rounded-full bg-danger/10 px-2.5 py-1 font-accent text-xs font-semibold text-danger">
              Sold out
            </span>
          ) : isFree ? (
            <span className="font-accent text-[15px] font-semibold text-success">
              Free
            </span>
          ) : (
            <span className="font-accent text-[15px] font-semibold tabular-nums text-text-dark">
              ${price.toFixed(2)}
            </span>
          )}

          {!disabled && (
            <span
              aria-hidden
              className={cn(
                'flex h-8 min-w-8 items-center justify-center rounded-full px-2 font-accent text-sm font-semibold transition-[background-color,color,transform] duration-300 ease-snappy',
                inCart > 0
                  ? 'animate-check bg-primary text-white'
                  : 'bg-primary/10 text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-white',
              )}
            >
              {inCart > 0 ? `${inCart} ✓` : (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z" />
                </svg>
              )}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** The same row's shape in grey, while the menu loads. */
export function MenuCardSkeleton() {
  return (
    <div aria-hidden className="flex gap-3.5 rounded-2xl border border-gray-100/80 bg-surface p-3 shadow-sm">
      <div className="h-20 w-20 shrink-0 animate-shimmer rounded-[0.875rem] bg-gray-200/60" />
      <div className="flex flex-1 flex-col justify-between py-1">
        <div className="space-y-2">
          <div className="h-4 w-2/3 animate-shimmer rounded-md bg-gray-200/60" />
          <div className="h-3 w-full animate-shimmer rounded-md bg-gray-100" />
        </div>
        <div className="h-4 w-14 animate-shimmer rounded-md bg-gray-200/60" />
      </div>
    </div>
  );
}
