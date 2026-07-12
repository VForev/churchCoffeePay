'use client';

import { cn } from '@/lib/utils';
import type { ShopSettings } from '@/types';
import type { ShopStatus } from '@/lib/shop';

interface ShopBannerProps {
  settings: ShopSettings;
  status: ShopStatus;
  className?: string;
}

/**
 * The big "who we are / when we're open" header. This is the first thing a
 * customer sees, so it has to answer: what is this, and can I order right now?
 */
export default function ShopBanner({ settings, status, className }: ShopBannerProps) {
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
export function ClosedNotice({ settings, status }: { settings: ShopSettings; status: ShopStatus }) {
  return (
    <div className="rounded-2xl border-2 border-warning/40 bg-warning/10 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">☕</span>
        <div className="min-w-0">
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
        </div>
      </div>
    </div>
  );
}
