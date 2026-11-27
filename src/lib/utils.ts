import { extendTailwindMerge } from 'tailwind-merge';

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * tailwind-merge, taught this app's own names. Without them it can't tell that
 * `font-heading` is a typeface (not a weight) or that `text-text-dark` is a colour (not a
 * size), and would either drop a class it shouldn't or keep two that fight.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-family': [{ font: ['heading', 'body', 'accent'] }],
      shadow: [{ shadow: ['xs'] }],
    },
  },
});

/**
 * Joins class names, and when two set the same thing the LAST one wins.
 *
 * That second half is the point. Plain joining left it to the stylesheet's own sort
 * order, which knows nothing about who passed what: `<Card className="p-0">` stayed at
 * the card's built-in `p-4` (p-0 sorts first), a warning card's `bg-warning/10` could lose
 * to the card's `bg-surface`, and a button's custom text colour to its variant's. Now a
 * component's built-ins go first and the caller's `className` last, and the caller wins.
 */
export function cn(...classes: (string | false | undefined | null)[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
