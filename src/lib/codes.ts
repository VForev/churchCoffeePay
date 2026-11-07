'use client';

/**
 * Codes — one kind of thing, three possible jobs (see supabase-codes.sql):
 *
 *  - **Opens ordering** while the shop is closed (what access codes used to be)
 *  - **⚡ Priority** — the order goes to the front of the line (src/lib/priority.ts)
 *  - **A discount** — percentage, fixed amount, or a free order
 *
 * A code can do any mix of them. The customer types it into one box, wherever that box
 * is on screen, and gets everything the code does: `lookupCode()` is that box.
 *
 * Every code on every order is then written to `code_uses` by `recordCodeUses()`, which
 * is what /admin/coupons searches when someone asks "who used PASTOR last month?".
 */

import { supabase } from './supabase';
import {
  codeProblem,
  codesMigrated,
  unlockFromCoupon,
  verifyAccessCode,
  type AccessUnlock,
} from './access-code';
import type { Coupon, OrderSource } from '@/types';

export type CodeLookup =
  | {
      ok: true;
      /** The code as a coupon — its discount and priority. NULL only for a pre-merge access code. */
      coupon: Coupon | null;
      /** What it opens while the shop is closed, or null if it isn't an opens-ordering code. */
      unlock: AccessUnlock | null;
    }
  | { ok: false; error: string };

/** Everything a typed code does, or why it can't be used. */
export async function lookupCode(raw: string): Promise<CodeLookup> {
  const code = raw.trim().toUpperCase();
  if (!code) return { ok: false, error: 'Type your code first.' };

  const migrated = await codesMigrated();
  const { data } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (data) {
    const coupon = data as Coupon;
    const problem = codeProblem(coupon);
    if (problem) return { ok: false, error: problem };
    // Before the merge, the same text can still be an access code in the old table.
    const unlock = migrated ? await unlockFromCoupon(coupon) : await verifyAccessCode(code);
    return { ok: true, coupon, unlock };
  }

  if (!migrated) {
    const unlock = await verifyAccessCode(code);
    if (unlock) return { ok: true, coupon: null, unlock };
  }

  return {
    ok: false,
    error: 'That code isn’t valid. Double-check it with whoever gave it to you.',
  };
}

/**
 * What a code does, in words — "Opens ordering · Priority · 50% off".
 *
 * The customer is shown it without "Opens ordering": by the time they see this the shop
 * has either opened for them or was open anyway, and the phrase only raises questions.
 */
export function describeCode(coupon: Coupon, audience: 'admin' | 'customer' = 'admin'): string {
  const parts: string[] = [];
  if (audience === 'admin' && coupon.unlocks_ordering) parts.push('Opens ordering');
  if (coupon.is_priority) parts.push('Priority');
  if (coupon.discount_type === 'free_item') parts.push('Free order');
  else if (coupon.discount_value > 0) {
    parts.push(
      coupon.discount_type === 'percentage'
        ? `${coupon.discount_value}% off`
        : `$${Number(coupon.discount_value).toFixed(2)} off`,
    );
  }
  if (parts.length > 0) return parts.join(' · ');
  return audience === 'admin' ? 'Does nothing yet' : 'Code accepted';
}

/** A code that adds nothing to the cart — no discount, no priority. */
export function isUnlockOnly(coupon: Coupon): boolean {
  return !coupon.is_priority && coupon.discount_type !== 'free_item' && !(coupon.discount_value > 0);
}

/**
 * Writes down every code that touched this order — normally one, two when somebody
 * opened the shop with one code and then typed a discount code.
 *
 * Best-effort, like every other step after the order row is in: the drink is already on
 * the board (and on /checkout, already paid for), so a failure here is a missing line in
 * a report, never a lost order. Counting the use is the database's job — a trigger on
 * `code_uses` bumps `coupons.times_used`. On a database without supabase-codes.sql the
 * insert fails, and the count is bumped the old way so max-uses limits still hold.
 */
export async function recordCodeUses(use: {
  orderId: string;
  customerName: string;
  source: OrderSource;
  /** The code in the cart's code box (discount / priority). */
  coupon: Coupon | null;
  /** The code that opened ordering, if one did. */
  unlock: AccessUnlock | null;
  /** Whether the shop was closed when the order went in — i.e. whether the unlock did anything. */
  shopClosed: boolean;
  discountAmount: number;
}): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  const base = {
    order_id: use.orderId,
    customer_name: use.customerName.trim(),
    order_source: use.source,
  };

  if (use.coupon) {
    rows.push({
      ...base,
      coupon_id: use.coupon.id,
      code: use.coupon.code,
      unlocked: use.shopClosed && use.unlock?.code === use.coupon.code,
      priority: !!use.coupon.is_priority,
      discount_amount: use.discountAmount,
    });
  }
  if (use.unlock && use.unlock.code !== use.coupon?.code) {
    rows.push({
      ...base,
      coupon_id: use.unlock.couponId,
      code: use.unlock.code,
      unlocked: use.shopClosed,
      priority: use.unlock.isPriority,
      discount_amount: 0,
    });
  }
  if (rows.length === 0) return;

  const { error } = await supabase.from('code_uses').insert(rows);
  if (error && use.coupon) {
    await supabase
      .from('coupons')
      .update({ times_used: use.coupon.times_used + 1 })
      .eq('id', use.coupon.id);
  }
}
