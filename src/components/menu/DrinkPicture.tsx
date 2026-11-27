'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { drinkPicture, type SitePictures } from '@/lib/pictures';
import { drinkTemperature } from '@/lib/temperature';
import type { MenuItem } from '@/types';

/**
 * A drink's picture tile: its photo, the shop's default picture, a cup icon, or nothing —
 * whichever `drinkPicture()` says (see src/lib/pictures.ts for the rules).
 *
 * Renders `null` for "No pictures", so a card built around it simply loses its tile and
 * becomes a names-only row. Size and corners come from `className`.
 */
export default function DrinkPicture({
  item,
  pictures,
  soldOut,
  className,
  iconClassName = 'text-4xl',
}: {
  item: Pick<MenuItem, 'image_url' | 'name'>;
  pictures: SitePictures;
  soldOut?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const picture = drinkPicture(item, pictures);
  if (picture.kind === 'none') return null;

  if (picture.kind === 'icon') {
    const iced = drinkTemperature(item.name, []) === 'iced';
    return (
      <div
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden',
          iced ? 'bg-gradient-to-br from-secondary/25 to-secondary/10' : 'bg-gradient-to-br from-primary/15 to-primary/5',
          soldOut && 'opacity-60',
          className,
        )}
      >
        <span className={cn('leading-none', iconClassName)}>{iced ? '🧊' : '☕'}</span>
      </div>
    );
  }

  return <Photo url={picture.url} soldOut={soldOut} className={className} />;
}

/**
 * A photo that fades in once it has arrived, over a soft placeholder, instead of popping
 * in half-drawn. A broken link falls back to the placeholder rather than the browser's
 * torn-picture icon.
 */
export function Photo({
  url,
  soldOut,
  className,
  alt = '',
  eager,
}: {
  url: string;
  soldOut?: boolean;
  className?: string;
  alt?: string;
  /** Above the fold (the sheet's header): don't wait for it to scroll into view. */
  eager?: boolean;
}) {
  // Keyed on the address, so switching pictures fades the new one in too.
  const [state, setState] = useState<{ url: string; status: 'loading' | 'loaded' | 'broken' }>({
    url,
    status: 'loading',
  });
  const status = state.url === url ? state.status : 'loading';

  return (
    <div className={cn('relative shrink-0 overflow-hidden bg-gray-100', className)}>
      {status !== 'broken' && (
        // A plain <img>: admins paste links from anywhere, and next/image would need every
        // one of those hosts allow-listed before it would load.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          // A picture already in the browser's cache can finish before React attaches
          // onLoad; checking `complete` on mount catches that one.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0 && status === 'loading') {
              queueMicrotask(() => setState({ url, status: 'loaded' }));
            }
          }}
          onLoad={() => setState({ url, status: 'loaded' })}
          onError={() => setState({ url, status: 'broken' })}
          className={cn(
            // group-hover: a gentle zoom when the card it sits in is hovered.
            'h-full w-full object-cover transition-[opacity,transform,filter] duration-500 ease-snappy group-hover:scale-[1.04]',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            soldOut && 'grayscale',
          )}
        />
      )}
    </div>
  );
}
