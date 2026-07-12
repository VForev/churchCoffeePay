'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
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
    <Card
      hover={!disabled}
      onClick={disabled ? undefined : onClick}
      className={cn(
        'relative flex h-full flex-col justify-between',
        soldOut && 'opacity-60',
        disabled && 'cursor-not-allowed',
      )}
    >
      {item.image_url && (
        <div className="mb-3 h-32 w-full overflow-hidden rounded-xl bg-bg">
          <img
            src={item.image_url}
            alt={item.name}
            className={cn('h-full w-full object-cover', soldOut && 'grayscale')}
          />
        </div>
      )}

      <div className="flex-1">
        <h3 className="font-heading text-base font-bold leading-tight text-text-dark">
          {item.name}
        </h3>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-text-light">{item.description}</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {isFree ? (
          <Badge variant="success">Free</Badge>
        ) : (
          <span
            className={cn(
              'font-accent text-lg font-bold',
              soldOut ? 'text-text-light line-through' : 'text-primary',
            )}
          >
            ${price.toFixed(2)}
          </span>
        )}

        {soldOut && (
          <span className="inline-flex items-center rounded-full bg-danger px-3 py-1 font-accent text-xs font-bold uppercase tracking-wide text-white">
            Sold Out
          </span>
        )}
      </div>
    </Card>
  );
}
