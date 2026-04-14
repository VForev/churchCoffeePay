'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Status = {
  active: boolean;
  issuedAt?: string;
  expiresAt?: string;
  consumed?: boolean;
};

function format(msLeft: number): string {
  if (msLeft <= 0) return '0:00';
  const total = Math.floor(msLeft / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AccessCountdown() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/access/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: Status) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!status || !status.active || !status.expiresAt) return null;

  const msLeft = new Date(status.expiresAt).getTime() - now;

  if (msLeft <= 0) {
    return (
      <div className="bg-danger/10 border-b border-danger/20 py-2 px-4 text-center">
        <span className="font-accent text-sm text-danger font-semibold">
          Your ordering window has ended.
        </span>
        <button
          onClick={() => router.push('/access-denied')}
          className="ml-3 text-xs underline text-danger cursor-pointer"
        >
          Details
        </button>
      </div>
    );
  }

  const low = msLeft < 5 * 60 * 1000;

  return (
    <div
      className={`${
        low ? 'bg-warm/10 border-warm/30' : 'bg-primary/5 border-primary/20'
      } border-b py-2 px-4 text-center`}
    >
      <span className="font-accent text-sm text-text">
        Time remaining to place your order:{' '}
        <span
          className={`font-bold ${low ? 'text-warm' : 'text-primary'}`}
          aria-live="polite"
        >
          {format(msLeft)}
        </span>
      </span>
    </div>
  );
}
