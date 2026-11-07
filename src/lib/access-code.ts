'use client';

import { supabase } from './supabase';
import type { AccessCode, Coupon } from '@/types';

/**
 * Access-code unlock: when the shop is closed, a valid code lets one group order
 * anyway. A code can be limited to a single menu category — e.g. a brothers' meeting
 * that may order teas but nothing else.
 *
 * Since supabase-codes.sql an "access code" is just a code in `coupons` with
 * `unlocks_ordering` ticked — the same code can also be priority and carry a discount.
 * Before it runs, unlocks still come from the old `access_codes` table.
 *
 * The unlock is held in module memory, not sessionStorage, on purpose:
 *  - It survives client-side navigation (menu → checkout) so nobody is re-prompted
 *    in the middle of an order.
 *  - It is wiped by a full page reload / reopen, so restarting the ordering page
 *    always asks for the code again. It never lingers for the next person.
 *
 * It is always re-verified against the database before an order is actually placed,
 * so a code disabled mid-service can't ride a stale unlock through checkout.
 */

/**
 * Fixed id of the hidden "Custom Order" menu item (see supabase-access-codes.sql).
 * A write-in order attaches to it, with the typed request as its special instructions.
 */
export const CUSTOM_ORDER_ITEM_ID = 'c0570000-0000-4000-8000-000000000002';

export interface AccessUnlock {
  code: string;
  /** The code's row in `coupons`, for recording the use. NULL for a pre-merge access code. */
  couponId: string | null;
  /** e.g. "Brothers Meeting" — shown back to the customer so they know it worked. */
  label: string;
  /** When set, only this category can be ordered. NULL = the whole menu. */
  allowedCategoryId: string | null;
  /** e.g. "Tea" — for telling the customer what they're limited to. */
  allowedCategoryName: string | null;
  /** When true, a free-text "write your own order" box is offered. */
  allowCustomOrder: boolean;
  /** Fine print shown beside the write-in box. */
  customOrderNote: string | null;
  /** The same code is also a priority code — a write-in placed with it jumps the line. */
  isPriority: boolean;
}

let activeUnlock: AccessUnlock | null = null;

/**
 * Whether supabase-codes.sql has run — i.e. whether unlocks live in `coupons` (the
 * merged codes) or still in the old `access_codes` table. Asked once per page load.
 *
 * It matters for more than convenience: after the merge the old table is left in place,
 * still holding every code as it was. Reading it then would let a code the admin has
 * since switched off at /admin/coupons keep opening the shop.
 */
let migrated: boolean | null = null;
export async function codesMigrated(): Promise<boolean> {
  if (migrated !== null) return migrated;
  const { error } = await supabase.from('coupons').select('unlocks_ordering').limit(1);
  // Only a genuinely missing column means "not migrated". Anything else — church wifi
  // dropping for a second — answers "migrated" without remembering it: wrongly falling
  // back to the old table is the dangerous direction, so a blip must never cause it.
  if (!error) migrated = true;
  // A select names it unquoted ("column coupons.unlocks_ordering does not exist").
  else if (error.code === '42703' || /unlocks_ordering/.test(error.message ?? '')) migrated = false;
  else return true;
  return migrated;
}

/** Why a code can't be used right now, or null if it can. */
export function codeProblem(row: Pick<Coupon, 'expires_at' | 'max_uses' | 'times_used'>): string | null {
  if (row.expires_at && new Date(row.expires_at) < new Date()) return 'That code has expired.';
  if (row.max_uses && row.times_used >= row.max_uses) return 'That code has been used up.';
  return null;
}

/** The unlock a code grants, or null if it isn't an opens-ordering code. */
export async function unlockFromCoupon(row: Coupon): Promise<AccessUnlock | null> {
  if (!row.unlocks_ordering) return null;
  let categoryName: string | null = null;
  if (row.allowed_category_id) {
    const { data } = await supabase
      .from('categories')
      .select('name')
      .eq('id', row.allowed_category_id)
      .maybeSingle();
    categoryName = data?.name ?? null;
  }
  return {
    code: row.code,
    couponId: row.id,
    label: row.label ?? '',
    allowedCategoryId: row.allowed_category_id ?? null,
    allowedCategoryName: categoryName,
    allowCustomOrder: row.allow_custom_order ?? false,
    customOrderNote: row.custom_order_note ?? null,
    isPriority: row.is_priority ?? false,
  };
}

/**
 * Looks up a code; returns the unlock only if it exists, is active, and opens ordering.
 * This is the re-check run right before an order is placed, so it also refuses a code
 * that has expired or been used up since it was typed in.
 */
export async function verifyAccessCode(raw: string): Promise<AccessUnlock | null> {
  const code = raw.trim().toUpperCase();
  if (!code) return null;

  if (await codesMigrated()) {
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (!data || codeProblem(data as Coupon)) return null;
    return unlockFromCoupon(data as Coupon);
  }

  return verifyLegacyAccessCode(code);
}

/** The old access_codes table, for a database that hasn't run supabase-codes.sql. */
async function verifyLegacyAccessCode(code: string): Promise<AccessUnlock | null> {
  const { data } = await supabase
    .from('access_codes')
    .select(
      'code, label, is_active, allowed_category_id, allow_custom_order, custom_order_note, category:categories(name)',
    )
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) return null;

  const row = data as Pick<
    AccessCode,
    'code' | 'label' | 'allowed_category_id' | 'allow_custom_order' | 'custom_order_note'
  > & {
    category: { name: string } | { name: string }[] | null;
  };
  // PostgREST can hand back the embedded row as an object or a single-element array.
  const category = Array.isArray(row.category) ? row.category[0] : row.category;

  return {
    code: row.code,
    couponId: null,
    label: row.label,
    allowedCategoryId: row.allowed_category_id,
    allowedCategoryName: category?.name ?? null,
    allowCustomOrder: row.allow_custom_order ?? false,
    customOrderNote: row.custom_order_note ?? null,
    isPriority: false,
  };
}

/** Whether this unlock permits ordering an item in the given category. */
export function unlockAllowsCategory(
  unlock: AccessUnlock | null,
  categoryId: string | null | undefined,
): boolean {
  if (!unlock) return false;
  if (!unlock.allowedCategoryId) return true; // whole menu
  return categoryId === unlock.allowedCategoryId;
}

export function getActiveUnlock(): AccessUnlock | null {
  return activeUnlock;
}

export function setActiveUnlock(unlock: AccessUnlock): void {
  activeUnlock = unlock;
}

export function clearActiveUnlock(): void {
  activeUnlock = null;
}
