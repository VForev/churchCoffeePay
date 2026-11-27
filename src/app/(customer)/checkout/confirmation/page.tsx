'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import GivingBox from '@/components/GivingBox';
import LiveOrders from '@/components/LiveOrders';
import PageBackdrop, { pageBg } from '@/components/PageBackdrop';
import { safeImageUrl } from '@/lib/pictures';
import { useSitePictures } from '@/lib/use-pictures';
import { COFFEE_GIVING_LINK, COFFEE_GIFT_AMOUNT } from '@/lib/giving';
import { Suspense, useEffect, useState } from 'react';

/**
 * Short on purpose. They already tapped a button that said they wanted to give, so this
 * is a handoff, not a second ask — the only job of the wait is to let "we've got your
 * order" register before the screen changes. Any longer and it reads as a page that has
 * stalled.
 */
const REDIRECT_SECONDS = 3;

/** The big green tick — draws itself in, so "it worked" lands before any words are read. */
function DoneMark({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  // The circle springs in, the tick draws itself once it has landed, and one soft ring
  // spreads out behind it — the "it worked" beat, so nobody wonders whether to tap again.
  return (
    <div
      aria-hidden
      className={`relative mx-auto ${size === 'lg' ? 'mb-5 h-20 w-20' : 'mb-3 h-12 w-12'}`}
    >
      <span className="absolute inset-0 animate-ripple rounded-full bg-success" />
      <div className="relative flex h-full w-full animate-check items-center justify-center rounded-full bg-success text-white shadow-lg shadow-success/30">
        <svg
          className={size === 'lg' ? 'h-10 w-10' : 'h-6 w-6'}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path className="animate-draw" pathLength={24} d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>
    </div>
  );
}

function ConfirmationContent() {
  const backdrop = safeImageUrl(useSitePictures().page_background_image);
  const searchParams = useSearchParams();
  const router = useRouter();
  const name = searchParams.get('name') || 'there';
  const waitParam = searchParams.get('wait');
  const waitMinutes = waitParam ? parseInt(waitParam, 10) : null;
  // Set by the "Place Order & Give $3" button on /checkout. The order is already placed by
  // the time this renders, which is the only reason it's safe to send anyone to Pushpay:
  // Pushpay takes money only on its own site, won't be framed, and this merchant has its
  // return button switched off, so whoever goes there isn't coming back.
  const wantsToGive = searchParams.get('give') === '1';

  /**
   * Auto-hand-off to Pushpay, on a short visible countdown rather than instantly.
   *
   * `location.href` rather than `window.open`: a redirect on a timer has no user gesture
   * behind it, and mobile Safari blocks popups opened that way. Top-level navigation is
   * always allowed.
   */
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  const [cancelled, setCancelled] = useState(false);
  const redirecting = wantsToGive && !cancelled;

  useEffect(() => {
    if (!redirecting) return;
    if (secondsLeft <= 0) {
      window.location.href = COFFEE_GIVING_LINK;
      return;
    }
    const t = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [redirecting, secondsLeft]);

  const thanks = (
    <p className="text-text-light font-body mb-1">
      Thanks, <strong className="text-text-dark">{name}</strong>!
    </p>
  );

  /**
   * The wait, as it was when the order went in. Shown only where nothing else on the
   * screen is reporting it: the giving path carries the live board underneath, whose
   * pinned card recomputes the same estimate against the real queue. Two numbers for one
   * drink, differing by a minute because one of them is frozen in a URL, is worse than
   * one number in one place.
   */
  const waitLine =
    waitMinutes !== null && waitMinutes > 0 ? (
      <p className="text-text-light font-body mb-2">
        Your drink should be ready in about{' '}
        <strong className="text-primary font-accent">~{waitMinutes} min</strong>.
      </p>
    ) : (
      <p className="text-text-light font-body mb-2">Your drink is next up!</p>
    );

  /**
   * The giving path is laid out the other way up from the normal one.
   *
   * Pushpay goes at the top, because in three seconds the screen belongs to Pushpay and
   * the one thing that must be read before then is *why* it changed — a redirect nobody
   * saw coming reads as the site having crashed with their money in it. Underneath it,
   * in the order someone would want them: their own order, then the live queue. The queue
   * is here for the person who taps "Not now"; anyone who lets the countdown run sees it
   * again on /yourlive.
   */
  if (wantsToGive) {
    return (
      <div className={`min-h-screen pb-6 ${pageBg(!!backdrop)}`}>
        <PageBackdrop url={backdrop} />
        <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-6">
          <div className="animate-rise rounded-3xl border border-success/30 bg-success/10 px-5 py-6 text-center">
            <p className="mb-1 text-3xl leading-none">&#9749;</p>
            <h1 className="font-heading text-[1.375rem] font-bold tabular-nums text-text-dark">
              {redirecting
                ? `Taking you to Pushpay in ${secondsLeft}…`
                : `Your $${COFFEE_GIFT_AMOUNT} gift`}
            </h1>
            <p className="mx-auto mt-1 max-w-sm font-body text-sm text-text-light">
              {`Your order is placed and already on the barista board — nothing below depends on this. $${COFFEE_GIFT_AMOUNT} for the Coffee & Tea Ministry is filled in for you.`}
            </p>

            <a
              href={COFFEE_GIVING_LINK}
              className="pressable mt-4 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full bg-success px-7 py-3 font-accent text-[17px] font-semibold text-white shadow-md shadow-success/25 hover:brightness-110"
            >
              {redirecting ? 'Go now' : `Give $${COFFEE_GIFT_AMOUNT} with Pushpay`}
            </a>

            {/* A way out, because the redirect is one-way — Pushpay's return button is
                switched off on this merchant. Without this the only escape from a
                countdown someone didn't want is the back button. */}
            {redirecting && (
              <button
                type="button"
                onClick={() => setCancelled(true)}
                className="mt-3 block w-full cursor-pointer font-accent text-sm text-text-light underline hover:text-danger"
              >
                Not now &mdash; stay on this page
              </button>
            )}

            <p className="mt-3 font-body text-xs text-text-light">
              Secure giving through Pushpay &middot; one-time, not recurring
            </p>
          </div>

          <Card className="animate-rise px-6 py-5 text-center [--stagger:2]">
            <DoneMark size="sm" />
            <h2 className="mb-1 font-heading text-lg font-bold text-text-dark">Order placed</h2>
            {thanks}
            <p className="mb-4 font-body text-sm text-text-light">
              We&apos;ll call your name when it&apos;s ready — it&apos;s at the top of the board
              below.
            </p>
            <Button onClick={() => router.push('/')} fullWidth variant="ghost">
              Order another drink
            </Button>
          </Card>
        </div>

        {/* The queue, underneath everything else. No giving box on it — the ask is
            already at the top of this page, and twice is nagging. */}
        <div className="mt-2">
          <LiveOrders embedded highlightMine />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen items-center justify-center p-4 ${pageBg(!!backdrop)}`}>
      <PageBackdrop url={backdrop} />
      <div className="w-full max-w-md space-y-4 animate-rise">
        <Card className="text-center py-10 px-6 rounded-3xl">
          <DoneMark />
          <h1 className="mb-2 font-heading text-[2rem] font-bold tracking-[-0.03em] text-text-dark">Order placed!</h1>
          {thanks}
          {waitLine}
          <p className="text-text-light font-body mb-8 text-sm">
            We&apos;ll call your name when it&apos;s ready.
          </p>
          <Button
            onClick={() => router.push('/yourlive')}
            fullWidth
            size="lg"
            className="mb-3"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-success-light" />
            Track Your Order Live
          </Button>
          <Button onClick={() => router.push('/')} fullWidth variant="tinted">
            Order Another Drink
          </Button>
        </Card>

        {/* Asked once the order is safely placed, never before — nothing about giving is
            allowed to sit between someone and their coffee. */}
        <GivingBox />
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
