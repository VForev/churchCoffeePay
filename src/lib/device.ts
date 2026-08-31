/**
 * A stable id for this browser, so the spam limit can tell "the same phone again"
 * from "the next person in the queue".
 *
 * Deliberately not a fingerprint and not a login. It's a random string in
 * localStorage — it identifies nothing about the person, survives a page reload,
 * and is gone the moment they clear their site data. That last part is fine: the
 * database trigger also matches on the customer's name, so clearing storage doesn't
 * hand anyone a fresh allowance.
 *
 * Never let a missing id block an order. A private tab, a locked-down browser, or a
 * disabled-storage setting all throw here, and a customer who can't order coffee
 * because their browser wouldn't remember a random number is a far worse outcome
 * than a spammer getting through. Every failure path returns null.
 */

const STORAGE_KEY = 'lotg_device_id';

function randomId(): string {
  // crypto.randomUUID needs a secure context; plain http on the church LAN isn't one.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** This browser's id, creating one on first use. null when storage isn't usable. */
export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const fresh = randomId();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}
