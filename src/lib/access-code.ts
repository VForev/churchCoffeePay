'use client';

import { supabase } from './supabase';
import type { AccessCode } from '@/types';

/**
 * Access-code unlock: when the shop is closed, a valid code lets one group order
 * anyway (see supabase-access-codes.sql). A code can be limited to a single menu
 * category — e.g. a brothers' meeting that may order teas but nothing else.
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

export interface AccessUnlock {
  code: string;
  /** e.g. "Brothers Meeting" — shown back to the customer so they know it worked. */
  label: string;
  /** When set, only this category can be ordered. NULL = the whole menu. */
  allowedCategoryId: string | null;
  /** e.g. "Tea" — for telling the customer what they're limited to. */
  allowedCategoryName: string | null;
}

let activeUnlock: AccessUnlock | null = null;

/** Looks up a code; returns the unlock only if it exists and is active. */
export async function verifyAccessCode(raw: string): Promise<AccessUnlock | null> {
  const code = raw.trim().toUpperCase();
  if (!code) return null;

  const { data } = await supabase
    .from('access_codes')
    .select('code, label, is_active, allowed_category_id, category:categories(name)')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) return null;

  const row = data as Pick<AccessCode, 'code' | 'label' | 'allowed_category_id'> & {
    category: { name: string } | { name: string }[] | null;
  };
  // PostgREST can hand back the embedded row as an object or a single-element array.
  const category = Array.isArray(row.category) ? row.category[0] : row.category;

  return {
    code: row.code,
    label: row.label,
    allowedCategoryId: row.allowed_category_id,
    allowedCategoryName: category?.name ?? null,
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
