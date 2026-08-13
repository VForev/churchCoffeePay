/**
 * Shared iOS motion vocabulary.
 *
 * Everything that animates imports from here. The point is not convenience —
 * it is that a sheet on /checkout and a sheet on /tablet must settle with the
 * same physics, or the app stops feeling like one app. Tuning a spring inline
 * in a component is how that consistency rots.
 *
 * These are springs, not durations. iOS almost never animates on a fixed
 * curve: motion is interruptible and velocity-aware, which is why an iPhone
 * sheet you fling feels connected to your finger and a CSS transition does
 * not. Framer Motion's `duration` + `bounce` form maps directly onto Apple's
 * own `response` / `dampingFraction` model, so these numbers mean the same
 * thing they'd mean in SwiftUI.
 *
 * `bounce: 0` is critically damped — settles with no overshoot at all. Use it
 * for anything the user is tracking with their eyes (sheets, drawers). Save
 * overshoot for small things appearing (badges, chips), where it reads as
 * liveliness rather than sloppiness.
 */

import type { Transition, Variants } from 'motion/react';

/** Sheets, drawers, anything large entering or leaving. Apple's own curve. */
export const springSheet: Transition = { type: 'spring', duration: 0.5, bounce: 0 };

/** Default for most UI: quick, settles clean. */
export const springSnappy: Transition = { type: 'spring', duration: 0.35, bounce: 0.12 };

/** Small elements appearing — badges, chips, the cart count. */
export const springPop: Transition = { type: 'spring', duration: 0.4, bounce: 0.32 };

/** Layout shifts: a card moving columns, a list reordering. */
export const springLayout: Transition = { type: 'spring', duration: 0.45, bounce: 0.15 };

/** Non-spring fallback for opacity-only fades, where physics adds nothing. */
export const easeIOS: Transition = { duration: 0.3, ease: [0.16, 1, 0.3, 1] };

/** The tap-down scale every pressable surface shares. */
export const pressable = {
  whileTap: { scale: 0.96 },
  transition: springSnappy,
} as const;

/** Softer press for large targets, where 0.96 looks like a glitch. */
export const pressableLarge = {
  whileTap: { scale: 0.98 },
  transition: springSnappy,
} as const;

/* ---------------------------------------------------------------- variants */

/** Content rising into place. The workhorse for page sections. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, y: 8, transition: easeIOS },
};

/**
 * Parent for a list that should cascade. Children use `fadeUp`.
 *
 * 0.03s is deliberately short: long stagger looks like a website intro, and
 * iOS uses just enough offset to imply the list assembled itself.
 *
 * The delay is capped by `staggerCap` below rather than left to multiply out.
 * A 30-drink menu at 0.04s each means the last card starts 1.2s after the
 * first — the grid is still visibly assembling well after it should be usable,
 * and on a slower machine every one of those cards is a live animation
 * competing for the same frame budget.
 */
export const staggerParent: Variants = {
  hidden: { opacity: 1 },
  show: { opacity: 1, transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

/**
 * Stagger settings for a list whose length comes from the database.
 *
 * Past `max` items the per-child delay collapses to zero, so a long menu fades
 * in as one block instead of a slow ripple. Short lists keep the cascade, which
 * is where it actually reads as intentional.
 */
export function staggerCap(count: number, max = 12): Variants {
  const step = count > max ? 0 : 0.03;
  return {
    hidden: { opacity: 1 },
    show: { opacity: 1, transition: { staggerChildren: step, delayChildren: 0.02 } },
  };
}

/** Modal scrim. */
export const scrim: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: easeIOS },
  exit: { opacity: 0, transition: easeIOS },
};

/** Bottom sheet, iPhone-style. */
export const sheetUp: Variants = {
  hidden: { y: '100%' },
  show: { y: 0, transition: springSheet },
  exit: { y: '100%', transition: { type: 'spring', duration: 0.4, bounce: 0 } },
};

/** Right-hand drawer (the cart). */
export const drawerRight: Variants = {
  hidden: { x: '100%' },
  show: { x: 0, transition: springSheet },
  exit: { x: '100%', transition: { type: 'spring', duration: 0.4, bounce: 0 } },
};

/** Centered alert — iOS scales these up from slightly small, never from zero. */
export const alertPop: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: springPop },
  exit: { opacity: 0, scale: 0.96, transition: easeIOS },
};

/**
 * How far a sheet must be dragged before release dismisses it.
 * Below this it springs back. iOS also dismisses on a fast flick regardless
 * of distance — see `shouldDismiss`.
 */
export const DISMISS_DISTANCE = 120;
export const DISMISS_VELOCITY = 500;

/** Drag-release test shared by every dismissible sheet. */
export function shouldDismiss(offset: number, velocity: number): boolean {
  return offset > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY;
}
