'use client';

import { buildSummary, type SpecialtyState } from '@/lib/specialty';

/**
 * The drink of the day, at the top of the customer menu.
 *
 * Two layouts, chosen at /admin/specialty, because the top of that menu is contested:
 *
 *  - **Big** — the featured card. Use it when the special is the point of the morning.
 *  - **Small** — one line. Use it the rest of the time. Regulars outnumber browsers, and
 *    a full-width card pushes the drink someone actually came for below the fold.
 *
 * And a third state nobody picks: **sold out**. Shown rather than hidden, because a card
 * that silently vanishes makes the person who came in for it think they imagined it, and
 * they ask the barista mid-rush instead. It can't be tapped, so nothing gets ordered that
 * can't be made.
 */
export default function SpecialtyDrink({
  state,
  onOrder,
}: {
  state: SpecialtyState;
  /** Opens the normal customization sheet with the special's build already chosen. */
  onOrder: () => void;
}) {
  if (state.kind === 'off') return null;

  const { settings, item, modifiers, soldOutName } = state;
  const soldOut = state.kind === 'sold_out';

  // ── Sold out ───────────────────────────────────────────────────────────────
  if (soldOut) {
    return (
      <div className="rounded-2xl bg-text-light/90 px-5 py-5 text-white">
        <span className="inline-block rounded-md bg-white/25 px-2.5 py-1 font-accent text-[10px] font-bold uppercase tracking-[0.09em]">
          Sold out
        </span>
        <h3 className="mt-3 font-heading text-2xl font-bold leading-tight text-white/70 line-through decoration-2">
          {settings.name}
        </h3>
        <p className="mt-1.5 font-body text-sm text-white/75">
          {soldOutName ? `We ran out of ${soldOutName.toLowerCase()}.` : 'We ran out of this one.'}
        </p>
        <p className="mt-3 rounded-xl bg-white/15 px-3 py-2.5 text-center font-heading text-sm font-bold">
          {settings.sold_out_note}
        </p>
      </div>
    );
  }

  // ── One line ───────────────────────────────────────────────────────────────
  if (settings.display_style === 'small') {
    return (
      <button
        type="button"
        onClick={onOrder}
        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-gray-100 border-l-4 border-l-primary bg-surface px-4 py-3 text-left transition-shadow hover:shadow-md"
      >
        <div className="min-w-0 flex-1">
          <span className="font-accent text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
            {settings.ribbon}
          </span>
          <h3 className="font-heading text-base font-bold text-text-dark">{settings.name}</h3>
          {settings.tagline && (
            <p className="font-body text-xs text-text-light">{settings.tagline}</p>
          )}
        </div>
        <span
          aria-hidden
          className="mr-1 h-2.5 w-2.5 shrink-0 rotate-[-45deg] border-b-2 border-r-2 border-primary"
        />
      </button>
    );
  }

  // ── The featured card ──────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-warm px-5 py-5 text-white">
      <span className="inline-block rounded-md bg-primary px-2.5 py-1 font-accent text-[10px] font-bold uppercase tracking-[0.09em] text-white">
        {settings.ribbon}
      </span>

      <h3 className="mt-3 font-heading text-2xl font-bold leading-tight">{settings.name}</h3>
      {settings.tagline && (
        <p className="mt-1.5 font-body text-sm leading-relaxed text-white/75">{settings.tagline}</p>
      )}

      <p className="mt-3 border-t border-white/15 pt-3 font-body text-xs leading-relaxed text-white/70">
        Built on a <strong className="font-bold text-white">{item.name}</strong>
        {modifiers.length > 0 && (
          <>
            {' '}
            with{' '}
            <strong className="font-bold text-white">
              {modifiers.map((m) => m.name).join(', ')}
            </strong>
          </>
        )}
        <span className="sr-only">{buildSummary(item, modifiers)}</span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onOrder}
          className="cursor-pointer rounded-full bg-surface px-6 py-2.5 font-accent text-sm font-bold text-warm transition-opacity hover:opacity-90"
        >
          Order this
        </button>
        <span className="font-body text-xs leading-snug text-white/60">
          You can still change
          <br />
          the milk and the shots
        </span>
      </div>
    </div>
  );
}
