'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import GivingBox from '@/components/GivingBox';
import { Suspense } from 'react';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const name = searchParams.get('name') || 'there';
  const waitParam = searchParams.get('wait');
  const waitMinutes = waitParam ? parseInt(waitParam, 10) : null;

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
        <Button onClick={() => router.push('/live')} fullWidth variant="secondary" className="mb-3">
          Track Your Order Live
        </Button>
        <Button onClick={() => router.push('/')} fullWidth variant="ghost">
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
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><p>Loading...</p></div>}>
      <ConfirmationContent />
    </Suspense>
  );
}
