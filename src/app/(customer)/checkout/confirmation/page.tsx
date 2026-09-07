'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import GivingBox from '@/components/GivingBox';
import { COFFEE_GIVING_LINK, COFFEE_GIFT_AMOUNT } from '@/lib/giving';
import { Suspense } from 'react';

function ConfirmationContent() {
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

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
      <Card className="text-center py-10 px-6">
        <div className="text-6xl mb-4">&#9989;</div>
        <h1 className="text-2xl font-heading font-bold text-text-dark mb-2">
          Order Placed!
        </h1>
        <p className="text-text-light font-body mb-1">
          Thanks, <strong className="text-text-dark">{name}</strong>!
        </p>
        {waitMinutes !== null && waitMinutes > 0 ? (
          <p className="text-text-light font-body mb-2">
            Your drink should be ready in about{' '}
            <strong className="text-primary font-accent">~{waitMinutes} min</strong>.
          </p>
        ) : (
          <p className="text-text-light font-body mb-2">
            Your drink is next up!
          </p>
        )}
        <p className="text-text-light font-body mb-8 text-sm">
          We&apos;ll call your name when it&apos;s ready.
        </p>
        <Button onClick={() => router.push('/yourlive')} fullWidth variant="secondary" className="mb-3">
          Track Your Order Live
        </Button>
        <Button onClick={() => router.push('/')} fullWidth variant="ghost">
          Order Another Drink
        </Button>
      </Card>

      {/* The $3 they asked for on the previous screen. It leads, because they already
          tapped a button that said they wanted to give it — anything else here is in the
          way. Their order is in and on the barista board regardless of what happens next. */}
      {wantsToGive && (
        <div className="rounded-2xl border-2 border-success/30 bg-success/5 px-5 py-5 text-center">
          <p className="mb-1 text-3xl leading-none">&#9749;</p>
          <h3 className="font-heading text-lg font-bold text-text-dark">
            One more step &mdash; your ${COFFEE_GIFT_AMOUNT} gift
          </h3>
          <p className="mx-auto mt-1 max-w-sm font-body text-sm text-text-light">
            {`Your order is already placed, so nothing depends on this. Tap below to give $${COFFEE_GIFT_AMOUNT} to the Coffee & Tea Ministry \u2014 the amount is filled in for you.`}
          </p>
          <a
            href={COFFEE_GIVING_LINK}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-success px-7 py-3 font-accent text-base font-bold text-white transition-colors hover:bg-success-light"
          >
            {`Give $${COFFEE_GIFT_AMOUNT} with Pushpay`}
          </a>
          <p className="mt-3 font-body text-xs text-text-light">
            Secure giving through Pushpay &middot; one-time, not recurring
          </p>
        </div>
      )}

      {/* Asked once the order is safely placed, never before — nothing about giving is
          allowed to sit between someone and their coffee. Hidden when they've already
          chosen the $3 above; two giving boxes on one screen is one too many. */}
      {!wantsToGive && <GivingBox />}
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><p>Loading...</p></div>}>
      <ConfirmationContent />
    </Suspense>
  );
}
