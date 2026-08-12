'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import Button from '@/components/ui/Button';
import GivingBox from '@/components/GivingBox';
import IOSSpinner from '@/components/ui/Spinner';
import { fadeUp, springPop, staggerParent } from '@/lib/motion';
import { Suspense } from 'react';

/**
 * The success checkmark, drawn rather than typed.
 *
 * The circle wipes round and the tick draws itself in behind it — the same
 * two-beat confirmation iOS uses for a completed payment. An emoji ✅ can't
 * animate, and a static mark makes the screen feel like it was already there
 * when you arrived rather than something that just happened.
 */
function SuccessMark() {
  return (
    <motion.svg
      viewBox="0 0 52 52"
      className="mx-auto h-20 w-20 text-success"
      initial="hidden"
      animate="show"
    >
      <motion.circle
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          show: {
            pathLength: 1,
            opacity: 1,
            transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
          },
        }}
      />
      <motion.path
        d="M14 27l8 8 16-16"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          hidden: { pathLength: 0 },
          show: {
            pathLength: 1,
            // Starts just before the circle finishes, so the two strokes
            // overlap instead of reading as two separate animations.
            transition: { duration: 0.35, delay: 0.35, ease: [0.16, 1, 0.3, 1] },
          },
        }}
      />
    </motion.svg>
  );
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const name = searchParams.get('name') || 'there';
  const waitParam = searchParams.get('wait');
  const waitMinutes = waitParam ? parseInt(waitParam, 10) : null;

  return (
    <div className="flex min-h-screen-safe items-center justify-center bg-bg p-4">
      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="w-full max-w-md space-y-4"
      >
        <motion.div
          variants={fadeUp}
          className="rounded-[var(--r-xl)] bg-surface px-6 py-10 text-center shadow-sm"
        >
          <SuccessMark />

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springPop, delay: 0.5 }}
            className="text-ios-title1 mt-5 text-label"
          >
            Order Placed
          </motion.h1>

          <p className="text-ios-body mt-2 text-label-secondary">
            Thanks, <strong className="font-semibold text-label">{name}</strong>!
          </p>

          {waitMinutes !== null && waitMinutes > 0 ? (
            <p className="text-ios-body mt-1 text-label-secondary">
              Ready in about{' '}
              <strong className="tnum font-semibold text-primary">~{waitMinutes} min</strong>.
            </p>
          ) : (
            <p className="text-ios-body mt-1 text-label-secondary">Your drink is next up!</p>
          )}

          <p className="text-ios-footnote mt-2 text-label-tertiary">
            We&apos;ll call your name when it&apos;s ready.
          </p>

          <div className="mt-8 space-y-2.5">
            <Button onClick={() => router.push('/yourlive')} fullWidth size="lg">
              Track Your Order Live
            </Button>
            <Button onClick={() => router.push('/')} fullWidth size="lg" variant="ghost">
              Order Another Drink
            </Button>
          </div>
        </motion.div>

        {/* Asked once the order is safely placed, never before — nothing about giving is
            allowed to sit between someone and their coffee. */}
        <motion.div variants={fadeUp}>
          <GivingBox />
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen-safe items-center justify-center bg-bg">
          <IOSSpinner />
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
