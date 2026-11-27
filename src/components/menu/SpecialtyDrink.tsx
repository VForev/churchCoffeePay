'use client';

import { buildSummary, type SpecialtyState } from '@/lib/specialty';
import { cssImage } from '@/lib/pictures';
import { cn } from '@/lib/utils';
import { Photo } from './DrinkPicture';

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
  picture,
}: {
  state: SpecialtyState;
  /** Opens the normal customization sheet with the special's build already chosen. */
  onOrder: () => void;
  /**
   * Its picture, from specialtyPicture() — the special's own, else the drink it's built
   * on. With one, the big card becomes a full-bleed photo; without, it's as it always was.
   */
  picture?: string | null;
}) {
  if (state.kind === 'off') return null;

  const { settings, item, modifiers, soldOutName } = state;
  const soldOut = state.kind === 'sold_out';

  // ── Sold out ───────────────────────────────────────────────────────────────
  if (soldOut) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-text-light/90 px-5 py-5 text-white">
        {picture && (
          <>
            <div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center opacity-35 grayscale"
              style={{ backgroundImage: cssImage(picture) }}
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/50 to-black/20" />
          </>
        )}
        <div className="relative">
        <span className="inline-block rounded-md bg-white/25 px-2.5 py-1 font-accent text-[10px] font-bold uppercase tracking-[0.09em]">
          Sold out
        </span>
        <h3 className="mt-3 font-heading text-2xl font-bold leading-tight text-white/70 line-through decoration-2">
          {settings.name}
        </h3>
        <p className="mt-1.5 font-body text-sm text-white/75">
          {soldOutName ? `We ran out of ${soldOutName.toLowerCase()}.` : 'We ran out of this one.'}
        </p>
        <p className="mt-3 rounded-xl bg-white/15 px-3 py-2.5 text-center font-heading text-sm font-bold backdrop-blur-sm">
          {settings.sold_out_note}
        </p>
        </div>
      </div>
    );
  }

  // ── One line ───────────────────────────────────────────────────────────────
  if (settings.display_style === 'small') {
    return (
      <button
        type="button"
        onClick={onOrder}
        className={cn(
          'group pressable flex w-full animate-rise cursor-pointer items-center gap-3 rounded-2xl border border-gray-100/80 bg-surface py-3 pr-4 text-left shadow-sm hover:shadow-md',
          picture ? 'pl-3' : 'border-l-4 border-l-primary pl-4',
        )}
      >
        {picture && <Photo url={picture} className="h-14 w-14 rounded-xl" />}
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

  // ── The featured card, with a picture ──────────────────────────────────────
  // The photo fills the card and the words sit on a dark fade at the bottom, so they
  // read on any picture — a pale latte or a dark mocha.
  if (picture) {
    return (
      <div className="group relative isolate min-h-[17rem] animate-rise overflow-hidden rounded-3xl bg-warm text-white shadow-lg shadow-warm/25 sm:min-h-[19rem]">
        <Photo url={picture} alt={settings.name} eager className="absolute inset-0 -z-10 h-full w-full" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/0"
        />
        <div className="flex min-h-[17rem] flex-col justify-between px-5 py-5 sm:min-h-[19rem]">
          <span className="self-start rounded-md bg-primary px-2.5 py-1 font-accent text-[10px] font-bold uppercase tracking-[0.09em] text-white shadow-sm">
            {settings.ribbon}
          </span>

          <div className="mt-16">
            <h3 className="font-heading text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-white drop-shadow-sm">
              {settings.name}
            </h3>
            {settings.tagline && (
              <p className="mt-1 font-body text-[15px] leading-snug text-white/85">{settings.tagline}</p>
            )}
            <p className="mt-2 font-body text-xs text-white/70">
              Built on a <strong className="font-semibold text-white">{item.name}</strong>
              {modifiers.length > 0 && (
                <>
                  {' '}with{' '}
                  <strong className="font-semibold text-white">{modifiers.map((m) => m.name).join(', ')}</strong>
                </>
              )}
              <span className="sr-only">{buildSummary(item, modifiers)}</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOrder}
                className="pressable cursor-pointer rounded-full bg-white px-6 py-2.5 font-accent text-sm font-semibold text-warm shadow-md hover:brightness-95"
              >
                Order this
              </button>
              <span className="font-body text-xs leading-snug text-white/70">
                You can still change
                <br />
                the milk and the shots
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── The featured card ──────────────────────────────────────────────────────
  return (
    <div className="relative animate-rise overflow-hidden rounded-3xl bg-gradient-to-br from-warm to-warm-light px-5 py-5 text-white shadow-lg shadow-warm/25 ring-1 ring-inset ring-white/10">
      <span className="inline-block rounded-md bg-primary px-2.5 py-1 font-accent text-[10px] font-bold uppercase tracking-[0.09em] text-white">
        {settings.ribbon}
      </span>

      <h3 className="mt-3 font-heading text-2xl font-bold leading-tight text-white">{settings.name}</h3>
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
          className="pressable cursor-pointer rounded-full bg-white px-6 py-2.5 font-accent text-sm font-semibold text-warm shadow-sm hover:brightness-95"
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
