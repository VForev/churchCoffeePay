'use client';

import { PUSHPAY_LINK, pushpayLinkWithReturn } from '@/lib/giving';
import { cn } from '@/lib/utils';

/**
 * "Give to the church" — the Pushpay box. Two shapes, one component so the styling can't
 * drift between them:
 *
 *  - The default: shown after an order is placed and on the live order screen, i.e. in the
 *    two moments someone is already standing there waiting. Amount and fund are theirs to
 *    pick, and Pushpay sends them back to /yourlive when they're done.
 *  - The $3 Coffee & Tea box on /checkout (`newTab`, with a fixed `href`) — see
 *    COFFEE_GIVING_LINK in src/lib/giving.ts for why it's a link and not Pushpay's
 *    embedded widget.
 *
 * A link, not Pushpay's embedded widget: the widget is a third-party script, and church
 * wifi and strict mobile browsers block those often enough that it would sometimes show
 * nothing at all.
 */
export default function GivingBox({
  title = 'Give to Light of the Gospel',
  message = 'Your coffee is on its way. If you’d like to give to the church while you wait, you can do it right here.',
  href = PUSHPAY_LINK,
  buttonLabel = 'Give with Pushpay',
  note = 'Secure giving through Pushpay · you’ll come back here when you’re done',
  /**
   * Open Pushpay in a new tab and leave this page alone.
   *
   * Required on /checkout. The cart lives in memory only (src/lib/cart-store.ts — no
   * localStorage), so navigating away mid-checkout throws the whole order away and the
   * customer comes back to an empty cart. A giving ask that costs someone their coffee is
   * worse than no giving ask.
   */
  newTab = false,
  icon = '❤️',
  className,
}: {
  title?: string;
  message?: string;
  href?: string;
  buttonLabel?: string;
  note?: string;
  newTab?: boolean;
  icon?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-primary/20 bg-primary/5 px-5 py-5 text-center',
        className,
      )}
    >
      <p className="mb-1 text-3xl leading-none">{icon}</p>
      <h3 className="font-heading text-lg font-bold text-text-dark">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm font-body text-sm text-text-light">{message}</p>

      {/* The plain link is always the href so long-press and "open in new tab" still work.
          In the default (same-tab) shape the return-to-/yourlive URL is added on a normal
          click, when window.location.origin is finally something real — it isn't during
          the server render. The new-tab shape needs no origin, so it stays a plain anchor
          and can't be popup-blocked. */}
      <a
        href={href}
        {...(newTab
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                window.location.href = pushpayLinkWithReturn(window.location.origin);
              },
            })}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 font-accent text-base font-bold text-white transition-colors hover:bg-primary-light"
      >
        {buttonLabel}
      </a>

      <p className="mt-3 font-body text-xs text-text-light">{note}</p>
    </div>
  );
}
