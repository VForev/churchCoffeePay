'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ShopSettings } from '@/types';
import type { ShopStatus } from '@/lib/shop';
import { verifyAccessCode, setActiveUnlock, type AccessUnlock } from '@/lib/access-code';

interface ShopBannerProps {
  settings: ShopSettings;
  status: ShopStatus;
  /** Single-line bar instead of the tall hero — for the TV screen, where vertical space is orders. */
  compact?: boolean;
  className?: string;
}

/**
 * The big "who we are / when we're open" header. This is the first thing a
 * customer sees, so it has to answer: what is this, and can I order right now?
 */
export default function ShopBanner({ settings, status, compact, className }: ShopBannerProps) {
  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl bg-gradient-to-r from-primary to-primary-light px-5 py-3 text-white shadow-md',
          className,
        )}
      >
        <h1 className="font-heading text-xl font-bold leading-none tracking-tight">
          {settings.service_title}
        </h1>

        {settings.service_subtitle && (
          <span className="font-body text-sm text-white/80">{settings.service_subtitle}</span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {status.isOpen ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 font-accent text-xs font-bold">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                Open
              </span>
              {status.closesAt && (
                <span className="font-accent text-sm text-white/90">
                  until <strong className="font-bold">{status.closesAt}</strong>
                </span>
              )}
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-accent text-xs font-bold ring-1 ring-white/25">
                <span className="h-2 w-2 rounded-full bg-white/60" />
                Closed
              </span>
              {status.nextOpensAt && (
                <span className="font-accent text-sm text-white/90">
                  opens <strong className="font-bold">{status.nextOpensAt}</strong>
                </span>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-light px-6 py-7 text-white shadow-lg sm:px-8 sm:py-8',
        className,
      )}
    >
      {/* Soft decorative glow, purely visual */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-secondary/20 blur-3xl" />

      <div className="relative">
        <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {settings.service_title}
        </h1>

        {settings.service_subtitle && (
          <p className="mt-1.5 font-body text-base text-white/85 sm:text-lg">
            {settings.service_subtitle}
          </p>
        )}

        {/* Open / closed state */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {status.isOpen ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-success px-4 py-2 font-accent text-sm font-bold shadow-sm">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              Open — ordering now
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 font-accent text-sm font-bold ring-1 ring-white/25">
              <span className="h-2.5 w-2.5 rounded-full bg-white/60" />
              Closed
            </span>
          )}

          {status.isOpen && status.closesAt && (
            <span className="font-accent text-sm text-white/90">
              Serving until <strong className="font-bold">{status.closesAt}</strong>
            </span>
          )}

          {!status.isOpen && status.nextOpensAt && (
            <span className="font-accent text-sm text-white/90">
              Opens <strong className="font-bold">{status.nextOpensAt}</strong>
            </span>
          )}
        </div>

        {/* Weekly schedule */}
        <div className="mt-4 flex items-start gap-2 border-t border-white/15 pt-4">
          <span className="text-base leading-none">🕒</span>
          <p className="font-body text-sm text-white/80">{status.scheduleSummary}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-width notice shown when ordering is closed, explaining what to do instead.
 */
export function ClosedNotice({
  settings,
  status,
  onUnlock,
}: {
  settings: ShopSettings;
  status: ShopStatus;
  /** When provided, shows an access-code box so an approved group can unlock ordering. */
  onUnlock?: (unlock: AccessUnlock) => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-warning/40 bg-warning/10 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">☕</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold text-amber-900">
            We&apos;re not taking orders right now
          </h2>
          <p className="mt-1 font-body text-sm text-amber-800">{settings.closed_message}</p>
          {status.nextOpensAt && (
            <p className="mt-2 font-accent text-sm font-bold text-amber-900">
              Ordering opens {status.nextOpensAt}.
            </p>
          )}
          <p className="mt-2 font-body text-xs text-amber-800/80">
            You can still browse the menu below.
          </p>
          {/* A lock is deliberately absolute — no access code gets past it, so we don't
              offer the box and send someone hunting for a code that won't work. */}
          {onUnlock && !status.isLocked && <AccessCodeBox onUnlock={onUnlock} />}
        </div>
      </div>
    </div>
  );
}

/** "Have an access code?" — an approved group unlocks ordering while the shop is closed. */
function AccessCodeBox({ onUnlock }: { onUnlock: (unlock: AccessUnlock) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setError('');
    const unlock = await verifyAccessCode(code);
    setChecking(false);
    if (!unlock) {
      setError('That code isn’t valid. Double-check it with whoever gave it to you.');
      return;
    }
    setActiveUnlock(unlock);
    onUnlock(unlock);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 cursor-pointer font-accent text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
      >
        Have an access code?
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <input
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (error) setError('');
          }}
          placeholder="Enter access code"
          className="w-full rounded-xl border-2 border-amber-300 bg-white px-4 py-2.5 font-mono text-sm text-amber-950 placeholder:font-body placeholder:text-amber-800/50 focus:border-amber-500 focus:outline-none"
        />
        {error && <p className="mt-1.5 font-body text-xs text-danger">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={checking || !code.trim()}
        className="cursor-pointer rounded-xl bg-amber-900 px-5 py-2.5 font-accent text-sm font-bold text-white transition-colors hover:bg-amber-950 disabled:opacity-50"
      >
        {checking ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  );
}
