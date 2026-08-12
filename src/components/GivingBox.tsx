'use client';

import { motion } from 'motion/react';
import { PUSHPAY_LINK, pushpayLinkWithReturn } from '@/lib/giving';
import { springSnappy } from '@/lib/motion';
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
        'rounded-[var(--r-xl)] bg-surface px-5 py-6 text-center shadow-sm',
        className,
      )}
    >
      <p className="mb-2 text-3xl leading-none">&#10084;&#65039;</p>
      <h3 className="text-ios-headline text-label">{title}</h3>
      <p className="text-ios-subhead mx-auto mt-1.5 max-w-sm text-label-secondary">{message}</p>

      {/* The plain link is the href so long-press and "open in new tab" still work; the
          return-to-/yourlive URL is added on a normal click, when window.location.origin
          is finally something real (it isn't during the server render). */}
      <motion.a
        whileTap={{ scale: 0.97 }}
        transition={springSnappy}
        href={PUSHPAY_LINK}
        onClick={(e) => {
          e.preventDefault();
          window.location.href = pushpayLinkWithReturn(window.location.origin);
        }}
        className="mt-5 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-primary px-7 text-[17px] font-semibold text-white shadow-sm"
      >
        Give with Pushpay
      </motion.a>

      <p className="text-ios-caption mt-3 text-label-tertiary">
        Secure giving through Pushpay · you&apos;ll come back here when you&apos;re done
      </p>
    </div>
  );
}
