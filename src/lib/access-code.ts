'use client';

import { supabase } from './supabase';
import type { AccessCode } from '@/types';

/**
 * Access-code unlock: when the shop is closed, a valid code lets one group order
 * anyway (see supabase-access-codes.sql). The unlock is remembered per browser tab
 * so it carries from the menu to checkout, but it is always re-verified against the
 * database before an order is actually placed — a code disabled mid-service can't
 * ride a stale sessionStorage entry through checkout.
 */

const STORAGE_KEY = 'lotg_access_unlock';

export interface AccessUnlock {
  code: string;
  /** e.g. "Brothers Meeting" — shown back to the customer so they know it worked. */
  label: string;
}

/** Looks up a code; returns the unlock only if it exists and is active. */
export async function verifyAccessCode(raw: string): Promise<AccessUnlock | null> {
  const code = raw.trim().toUpperCase();
  if (!code) return null;

  const { data } = await supabase
    .from('access_codes')
    .select('code, label, is_active')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) return null;
  const row = data as Pick<AccessCode, 'code' | 'label' | 'is_active'>;
  return { code: row.code, label: row.label };
}

export function storeUnlock(unlock: AccessUnlock): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(unlock));
  } catch {
    /* private mode / storage disabled — the unlock just won't persist across pages */
  }
}

export function readUnlock(): AccessUnlock | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AccessUnlock) : null;
  } catch {
    return null;
  }
}

export function clearUnlock(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
