'use client';

import { PUSHPAY_LINK, pushpayLinkWithReturn } from '@/lib/giving';
import { cn } from '@/lib/utils';

/**
 * "Give to the church" — the Pushpay box shown after an order is placed and on the live
 * order screen, i.e. in the two moments someone is already standing there waiting.
 *
 * A link, not Pushpay's embedded widget: the widget is a third-party script, and church
 * wifi and strict mobile browsers block those often enough that it would sometimes show
 * nothing at all. Pushpay sends them back to /yourlive when they're done.
 */
export default function GivingBox({
  title = 'Give to Light of the Gospel',
  message = 'Your coffee is on its way. If you’d like to give to the church while you wait, you can do it right here.',
  className,
}: {
  title?: string;
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-primary/20 bg-primary/5 px-5 py-5 text-center',
        className,
      )}
    >
      <p className="mb-1 text-3xl leading-none">&#10084;&#65039;</p>
      <h3 className="font-heading text-lg font-bold text-text-dark">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm font-body text-sm text-text-light">{message}</p>

      {/* The plain link is the href so long-press and "open in new tab" still work; the
          return-to-/yourlive URL is added on a normal click, when window.location.origin
          is finally something real (it isn't during the server render). */}
      <a
        href={PUSHPAY_LINK}
        onClick={(e) => {
          e.preventDefault();
          window.location.href = pushpayLinkWithReturn(window.location.origin);
        }}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 font-accent text-base font-bold text-white transition-colors hover:bg-primary-light"
      >
        Give with Pushpay
      </a>

      <p className="mt-3 font-body text-xs text-text-light">
        Secure giving through Pushpay · you&apos;ll come back here when you&apos;re done
      </p>
    </div>
  );
}
