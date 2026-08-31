/**
 * The customer-facing half of the spam-order limit.
 *
 * The limit itself is enforced by a Postgres trigger (supabase-order-rate-limit.sql),
 * because orders are inserted straight from the browser with the public anon key —
 * anything checked only in JavaScript is bypassed by clearing site data. This file
 * does two things around that trigger:
 *
 *   1. Checks BEFORE the card is charged. The trigger fires on insert, and in the
 *      checkout flow the insert happens *after* Stripe has taken the money. Being
 *      refused at that point would mean a charged customer with no order — so the
 *      count is read up front and the pre-check is what customers actually hit.
 *   2. Turns the trigger's Postgres error into a sentence. If the pre-check is ever
 *      raced (two tabs, submitted together), the raw error must not reach the screen.
 *
 * The pre-check is a convenience, not the enforcement. Never "fix" a failure here by
 * removing the trigger.
 */

import { supabase } from './supabase';
import { getDeviceId } from './device';

/** The marker the trigger puts in its message so this file can recognise it. */
const TRIGGER_MARKER = 'ORDER_RATE_LIMIT';

export interface SpamLimitSettings {
  spam_limit_enabled: boolean;
  spam_max_orders: number;
  spam_window_minutes: number;
}

/**
 * Off, until the settings say otherwise.
 *
 * A shop that hasn't run the migration has no columns to read, and defaulting to ON
 * there would mean this file inventing a limit the database isn't enforcing —
 * refusing real orders on a Sunday morning over a rule nobody set. The trigger is
 * the thing that says no; this only echoes it.
 */
export const DEFAULT_SPAM_SETTINGS: SpamLimitSettings = {
  spam_limit_enabled: false,
  spam_max_orders: 3,
  spam_window_minutes: 10,
};

/** Reads the admin's limits. Falls back to "no limit" on any error — see above. */
export async function fetchSpamSettings(): Promise<SpamLimitSettings> {
  const { data, error } = await supabase
    .from('shop_settings')
    .select('spam_limit_enabled, spam_max_orders, spam_window_minutes')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return DEFAULT_SPAM_SETTINGS;

  return {
    spam_limit_enabled: data.spam_limit_enabled !== false,
    spam_max_orders: Number(data.spam_max_orders) || DEFAULT_SPAM_SETTINGS.spam_max_orders,
    spam_window_minutes:
      Number(data.spam_window_minutes) || DEFAULT_SPAM_SETTINGS.spam_window_minutes,
  };
}

/** What the customer is told when they're over the limit. */
export function spamBlockMessage(settings: SpamLimitSettings): string {
  const { spam_max_orders: max, spam_window_minutes: mins } = settings;
  return (
    `You've already placed ${max} order${max === 1 ? '' : 's'} in the last ${mins} minutes. ` +
    `Give us a few minutes to catch up, then order again — or come and see the barista at the counter.`
  );
}

/**
 * "Is this person already over the limit?" — asked before charging a card.
 *
 * Counts the same way the trigger does: same window, same exclusion of counter orders
 * and cancelled ones, matched on this device OR this name. If the two ever disagree
 * the trigger wins, which is why it exists; this just spares the customer a charge.
 *
 * Returns a message to show, or null to go ahead. Any error returns null: a failed
 * count must never be the reason a paying customer can't order.
 */
export async function checkSpamLimit(customerName: string): Promise<string | null> {
  let settings: SpamLimitSettings;
  try {
    settings = await fetchSpamSettings();
  } catch {
    return null;
  }

  if (!settings.spam_limit_enabled || settings.spam_max_orders <= 0) return null;

  const deviceId = getDeviceId();
  const name = customerName.trim();
  if (!deviceId && !name) return null;

  const since = new Date(
    Date.now() - Math.max(settings.spam_window_minutes, 1) * 60_000,
  ).toISOString();

  // PostgREST `or` takes a comma-separated filter list, so a name is double-quoted —
  // "Sarah K" contains a space, and an unquoted comma or bracket would be read as more
  // filters. ilike with no wildcards is a case-insensitive equality, which is what the
  // trigger's lower(btrim(...)) does; the % and _ that ilike treats as wildcards are
  // stripped so a name can't widen its own match.
  const safeName = name.replace(/["\\%_,()]/g, ' ').trim();
  const clauses = [
    deviceId ? `device_id.eq.${deviceId.replace(/[^A-Za-z0-9_-]/g, '')}` : null,
    safeName ? `customer_name.ilike."${safeName}"` : null,
  ].filter(Boolean) as string[];

  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
    .neq('order_source', 'counter')
    .neq('status', 'cancelled')
    .or(clauses.join(','));

  if (error || count === null) return null;

  return count >= settings.spam_max_orders ? spamBlockMessage(settings) : null;
}

/** True when this insert error is the spam trigger firing rather than a real fault. */
export function isSpamLimitError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes(TRIGGER_MARKER));
}

/**
 * The message for a failed order insert — the trigger's rejection said plainly, or
 * the original error for anything else. Callers show this and don't inspect further.
 */
export function orderInsertError(
  error: { message?: string } | null | undefined,
  settings: SpamLimitSettings = DEFAULT_SPAM_SETTINGS,
): string {
  if (isSpamLimitError(error)) {
    return settings.spam_limit_enabled
      ? spamBlockMessage(settings)
      : "That's a lot of orders in a short time — give us a few minutes to catch up, then try again.";
  }
  return error?.message ? `Failed to create order: ${error.message}` : 'Failed to create order';
}
