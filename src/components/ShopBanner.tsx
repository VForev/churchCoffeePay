'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Coupon, ShopSettings } from '@/types';
import type { ShopStatus } from '@/lib/shop';
import { setActiveUnlock, type AccessUnlock } from '@/lib/access-code';
import { describeCode, isUnlockOnly, lookupCode } from '@/lib/codes';

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

/** Id of the code box, so the checkout's disabled button can scroll back to it. */
export const ORDER_CODE_BOX_ID = 'order-code-box';

/**
 * Full-width notice shown when ordering is closed, explaining what to do instead.
 *
 * On the menu it says "pick your drinks, the code comes at checkout" — nobody with a
 * code should have to find it before they've even chosen a drink. At checkout
 * (`atCheckout`) the code box is already open, because that is now the one moment it's
 * asked for.
 */
export function ClosedNotice({
  settings,
  status,
  onUnlock,
  onCode,
  atCheckout = false,
}: {
  settings: ShopSettings;
  status: ShopStatus;
  /** When provided, shows a code box so an approved group can unlock ordering. */
  onUnlock?: (unlock: AccessUnlock) => void;
  /** Receives a code's discount / priority, so one typed code does every job it has. */
  onCode?: (coupon: Coupon) => void;
  atCheckout?: boolean;
}) {
  const codesWork = !!onUnlock && !status.isLocked;
  return (
    <div className="rounded-2xl border-2 border-warning/40 bg-warning/10 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">☕</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold text-text-dark">
            We&apos;re not taking orders right now
          </h2>
          <p className="mt-1 font-body text-sm text-text">{settings.closed_message}</p>
          {status.nextOpensAt && (
            <p className="mt-2 font-accent text-sm font-bold text-text-dark">
              Ordering opens {status.nextOpensAt}.
            </p>
          )}
          <p className="mt-2 font-body text-xs text-text-light">
            {!codesWork
              ? 'You can still browse the menu below.'
              : atCheckout
                ? 'Have a code? Enter it here to place your order.'
                : 'You can still pick your drinks. Have a code? You’ll enter it when you place your order.'}
          </p>
          {/* A lock is deliberately absolute — no code gets past it, so we don't offer the
              box and send someone hunting for a code that won't work. */}
          {codesWork && onUnlock && (
            <AccessCodeBox onUnlock={onUnlock} onCode={onCode} startOpen={atCheckout} />
          )}
        </div>
      </div>
    </div>
  );
}

/** "Have a code?" — an approved group unlocks ordering while the shop is closed. */
function AccessCodeBox({
  onUnlock,
  onCode,
  startOpen,
}: {
  onUnlock: (unlock: AccessUnlock) => void;
  onCode?: (coupon: Coupon) => void;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setError('');
    const result = await lookupCode(code);
    setChecking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // The code's other jobs ride along whether or not it opens ordering. An unlock-only
    // code stays out of the cart's code box, so a discount code can still go in there.
    if (result.coupon && !isUnlockOnly(result.coupon)) onCode?.(result.coupon);
    if (!result.unlock) {
      setError(
        result.coupon && !isUnlockOnly(result.coupon)
          ? `That code is good for ${describeCode(result.coupon, 'customer').toLowerCase()}, but it doesn’t open ordering while we’re closed.`
          : 'That code doesn’t open ordering while we’re closed.',
      );
      return;
    }
    setActiveUnlock(result.unlock);
    onUnlock(result.unlock);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 cursor-pointer font-accent text-sm font-semibold text-text-dark underline underline-offset-2 hover:text-text"
      >
        Have a code?
      </button>
    );
  }

  return (
    <form id={ORDER_CODE_BOX_ID} onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <input
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (error) setError('');
          }}
          placeholder="Enter your code"
          className="w-full rounded-xl border-2 border-warning/50 bg-surface px-4 py-2.5 font-mono text-sm text-text-dark placeholder:font-body placeholder:text-text-light focus:border-warning focus:outline-none"
        />
        {error && <p className="mt-1.5 font-body text-xs text-danger">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={checking || !code.trim()}
        className="cursor-pointer rounded-xl bg-warm px-5 py-2.5 font-accent text-sm font-bold text-white transition-colors hover:bg-warm-light disabled:opacity-50"
      >
        {checking ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  );
}
