'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { fadeUp, springSnappy } from '@/lib/motion';
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

/** The pulsing dot that says "this is live", not a static badge. */
function StatusDot({ open }: { open: boolean }) {
  if (!open) return <span className="h-2 w-2 rounded-full bg-white/60" />;
  return (
    <span className="relative flex h-2 w-2">
      <motion.span
        // A ring expanding and fading out of the dot — the same idle pulse
        // iOS uses for live indicators. Cheaper and calmer than a blink.
        animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        className="absolute inline-flex h-full w-full rounded-full bg-white"
      />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
    </span>
  );
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
          'flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[var(--r-lg)] px-5 py-3 text-white',
          'bg-gradient-to-r from-primary to-indigo shadow-sm',
          className,
        )}
      >
        <h1 className="text-ios-title3 leading-none text-white">{settings.service_title}</h1>

        {settings.service_subtitle && (
          <span className="text-ios-subhead text-white/80">{settings.service_subtitle}</span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {status.isOpen ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-[13px] font-semibold">
                <StatusDot open />
                Open
              </span>
              {status.closesAt && (
                <span className="text-ios-subhead text-white/90">
                  until <strong className="font-semibold">{status.closesAt}</strong>
                </span>
              )}
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold ring-1 ring-white/25">
                <StatusDot open={false} />
                Closed
              </span>
              {status.nextOpensAt && (
                <span className="text-ios-subhead text-white/90">
                  opens <strong className="font-semibold">{status.nextOpensAt}</strong>
                </span>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className={cn(
        'relative overflow-hidden rounded-[var(--r-xl)] px-6 py-7 text-white shadow-md sm:px-8 sm:py-8',
        'bg-gradient-to-br from-primary to-indigo',
        className,
      )}
    >
      {/* Soft decorative glow, purely visual */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-teal/30 blur-3xl" />

      <div className="relative">
        <h1 className="text-ios-title1 text-white sm:text-[34px] sm:leading-[41px]">
          {settings.service_title}
        </h1>

        {settings.service_subtitle && (
          <p className="text-ios-body mt-1.5 text-white/85">{settings.service_subtitle}</p>
        )}

        {/* Open / closed state */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {status.isOpen ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-success px-4 py-2 text-[15px] font-semibold shadow-sm">
              <StatusDot open />
              Open — ordering now
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[15px] font-semibold ring-1 ring-white/25">
              <StatusDot open={false} />
              Closed
            </span>
          )}

          {status.isOpen && status.closesAt && (
            <span className="text-ios-subhead text-white/90">
              Serving until <strong className="font-semibold">{status.closesAt}</strong>
            </span>
          )}

          {!status.isOpen && status.nextOpensAt && (
            <span className="text-ios-subhead text-white/90">
              Opens <strong className="font-semibold">{status.nextOpensAt}</strong>
            </span>
          )}
        </div>

        {/* Weekly schedule */}
        <div className="mt-4 flex items-start gap-2 border-t border-white/15 pt-4">
          <span className="text-base leading-none">🕒</span>
          <p className="text-ios-subhead text-white/80">{status.scheduleSummary}</p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Full-width notice shown when ordering is closed, explaining what to do instead.
 *
 * Uses the orange accent on a tint of itself rather than fixed amber shades,
 * so it stays legible on a black page in dark mode.
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
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="rounded-[var(--r-lg)] bg-warning/12 px-5 py-4 ring-1 ring-warning/25"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">☕</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-ios-headline text-label">
            We&apos;re not taking orders right now
          </h2>
          <p className="text-ios-subhead mt-1 text-label-secondary">{settings.closed_message}</p>
          {status.nextOpensAt && (
            <p className="text-ios-subhead mt-2 font-semibold text-warning">
              Ordering opens {status.nextOpensAt}.
            </p>
          )}
          <p className="text-ios-footnote mt-2 text-label-tertiary">
            You can still browse the menu below.
          </p>
          {/* A lock is deliberately absolute — no access code gets past it, so we don't
              offer the box and send someone hunting for a code that won't work. */}
          {onUnlock && !status.isLocked && <AccessCodeBox onUnlock={onUnlock} />}
        </div>
      </div>
    </motion.div>
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

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!open ? (
        <motion.button
          key="trigger"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          whileTap={{ scale: 0.97 }}
          transition={springSnappy}
          onClick={() => setOpen(true)}
          className="mt-3 cursor-pointer text-[15px] font-semibold text-primary"
        >
          Have an access code?
        </motion.button>
      ) : (
        <motion.form
          key="form"
          // Height animation so the notice grows into the form rather than
          // jumping — the layout shift is what would otherwise feel webby.
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={springSnappy}
          onSubmit={submit}
          className="overflow-hidden"
        >
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <input
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (error) setError('');
                }}
                placeholder="Enter access code"
                className="w-full rounded-[var(--r-md)] bg-fill-tertiary px-4 py-3 font-mono text-[17px] tracking-[0.08em] text-label placeholder:font-body placeholder:tracking-normal placeholder:text-label-tertiary focus:outline-none focus:ring-[3px] focus:ring-primary/25"
              />
              {error && <p className="text-ios-footnote mt-1.5 text-danger">{error}</p>}
            </div>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              disabled={checking || !code.trim()}
              className="min-h-[48px] cursor-pointer rounded-full bg-primary px-6 text-[17px] font-semibold text-white disabled:opacity-40"
            >
              {checking ? 'Checking…' : 'Unlock'}
            </motion.button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
