'use client';

import { cssImage, safeImageUrl } from '@/lib/pictures';

/**
 * The veil of page colour over the picture. Shared with the preview at /admin/pictures,
 * so what an admin sees there is what the page gets.
 */
export const BACKDROP_VEIL = {
  soft: 'bg-gradient-to-b from-bg/90 via-bg/80 to-bg/90',
  bold: 'bg-gradient-to-b from-bg/80 via-bg/65 to-bg/75',
} as const;

/**
 * A picture behind a whole page — the customer pages and the lobby TV.
 *
 * It sits fixed behind everything, under a veil of the page colour, so a busy photo
 * reads as atmosphere rather than competing with the menu: cards stay legible on any
 * picture, light or dark scheme. Fixed, so it stays put while the menu scrolls over it.
 *
 * The page using it must not paint its own `bg-bg` over the top — use `pageBg()` below
 * for the page's own background class.
 */
export default function PageBackdrop({
  url,
  strength = 'soft',
}: {
  url: string | null | undefined;
  /** 'soft' for pages people read (heavy veil); 'bold' for the TV, read from across a room. */
  strength?: 'soft' | 'bold';
}) {
  if (!safeImageUrl(url)) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 animate-fade-in">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center"
        style={{ backgroundImage: cssImage(url) }}
      />
      {/* The veil: the page colour over the photo, heavier at the top where the text is. */}
      <div
        className={`absolute inset-0 ${BACKDROP_VEIL[strength]} ${strength === 'soft' ? 'backdrop-blur-[2px]' : ''}`}
      />
    </div>
  );
}

/** The page's own background: transparent when a backdrop picture is showing through. */
export function pageBg(hasBackdrop: boolean): string {
  return hasBackdrop ? 'bg-transparent' : 'bg-bg';
}
