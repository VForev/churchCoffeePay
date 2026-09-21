'use client';

/**
 * "One tap, one order."
 *
 * The bug this exists to prevent, in full, because it reached a real customer: the
 * checkout buttons were disabled with a React state flag, and state only greys a button
 * on the *next render*. The submit handler did two network round trips first — the shop
 * config, then the spam count — so on slow church wifi there was a second or more in
 * which the buttons were still completely live. Someone whose first tap appeared to do
 * nothing tapped twice more and placed three separate orders, each one a real charge and
 * a real card on the barista board.
 *
 * A ref is the fix because it is written **synchronously, inside the tap**, before any
 * await. The browser cannot deliver a second tap in between. `processing` state is still
 * used to change what the button *says*; this is what makes the second tap a no-op.
 *
 * ── The contract ─────────────────────────────────────────────────────────────
 *
 * `run(work)` calls `work` unless the lock is already held, and afterwards releases it
 * only if `work` returns `'try-again'`. Anything else — including a throw — holds the
 * lock. That default is deliberate and it is the money-safe direction: a button stuck
 * down is a customer who talks to the barista, a button handed back too early is a
 * customer charged twice. Callers that genuinely want a retry (a declined card, a name
 * that needs fixing) catch their own error and say `'try-again'`.
 */

import { useState } from 'react';

export type SubmitOutcome =
  /** Don't hand the button back: the work succeeded, or failed in a way retrying can't fix. */
  | 'finished'
  /** Hand the button back: nothing irreversible happened and the customer can correct it. */
  | 'try-again';

export interface SubmitLock {
  /** True while a submit is in flight, or after one claimed the lock for good. */
  readonly busy: boolean;
  /** Returns false when this tap was swallowed because the lock was already held. */
  run(work: () => Promise<SubmitOutcome>): Promise<boolean>;
  /**
   * Arms the button again for a genuinely NEW transaction — `/tablet` calling this when
   * the barista starts the next customer's order, and nothing else. It is not an error
   * handler: releasing after a charge to "let them try again" is the duplicate-charge
   * bug this file exists to stop. If you are reaching for this inside a catch, you want
   * `'try-again'` instead.
   */
  release(): void;
}

export function createSubmitLock(): SubmitLock {
  let busy = false;

  return {
    get busy() {
      return busy;
    },

    async run(work: () => Promise<SubmitOutcome>): Promise<boolean> {
      // Synchronous, and the whole point of the file. Every line from here to the first
      // `await` runs inside the tap that called it.
      if (busy) return false;
      busy = true;

      let outcome: SubmitOutcome = 'finished';
      try {
        outcome = await work();
      } finally {
        // A throw leaves `outcome` as 'finished' and so holds the lock — see the contract
        // above. That is the safe direction, not an oversight.
        if (outcome === 'try-again') busy = false;
      }
      return true;
    },

    release() {
      busy = false;
    },
  };
}

/**
 * One lock per mounted component, created once and never replaced.
 *
 * `useState` with an initialiser rather than `useRef`, because a ref read during render
 * is what React's own lint rule (and the docs) tell you not to do. Nothing ever calls the
 * setter — this is "create this object once for this component" and nothing more. The
 * mutable state lives inside the lock, where re-rendering can't disturb it.
 */
export function useSubmitLock(): SubmitLock {
  const [lock] = useState(createSubmitLock);
  return lock;
}
