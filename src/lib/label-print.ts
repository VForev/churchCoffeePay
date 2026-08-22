/**
 * The website's half of cup-label printing.
 *
 * The website never talks to the printer — it writes columns on `orders` and the
 * print agent on the shop PC reacts. Two of those columns come from a migration a
 * shop may not have run yet (supabase-label-cups.sql), so everything here degrades
 * instead of failing: an order must still go through on a database that's a
 * migration behind.
 */

import { supabase } from './supabase';

/** Postgres/PostgREST for "that column doesn't exist here". */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' || // undefined_column
    error.code === 'PGRST204' || // column not in the schema cache
    /column .* does not exist|item_count|label_print_cups/i.test(error.message ?? '')
  );
}

export const CUP_PRINT_MIGRATION =
  'Per-cup printing needs one more database column. Run supabase-label-cups.sql in the ' +
  'Supabase SQL editor, then try again.';

/**
 * "Every drink on this order is now in the database."
 *
 * Call it once, after the last order_item insert. The print agent waits for this
 * before printing, which is what stops a three-drink order printing a single cup —
 * the agent's realtime event otherwise arrives mid-way through the item inserts.
 *
 * Best-effort by design: the order has already been paid for and placed by the time
 * this runs, so a failure here must never surface to the customer. Without it the
 * agent falls back to waiting for the item count to stop changing.
 */
export async function markOrderItemsComplete(orderId: string, itemCount: number): Promise<void> {
  try {
    await supabase.from('orders').update({ item_count: itemCount }).eq('id', orderId);
  } catch {
    /* the agent has a fallback — never block an order on this */
  }
}

/**
 * Ask the shop PC to print an order's labels.
 *
 * `cups` is null for the whole order, or a list of cup numbers (as numbered by
 * orderCups() in src/lib/cups.ts) for a single remade drink. Stamping
 * label_print_requested_at is the explicit "print now" signal the agent waits for;
 * clearing label_printed_at is what lets it print and re-stamp.
 *
 * Returns an error message to show the barista, or null on success.
 */
export async function requestLabelPrint(
  orderId: string,
  cups: number[] | null,
): Promise<string | null> {
  const base = {
    label_print_requested_at: new Date().toISOString(),
    label_printed_at: null,
  };

  const { error } = await supabase
    .from('orders')
    .update({ ...base, label_print_cups: cups })
    .eq('id', orderId);

  if (!error) return null;

  if (isMissingColumn(error)) {
    // A single cup genuinely can't be asked for without the column — say which
    // migration adds it rather than quietly printing the whole order instead.
    if (cups && cups.length > 0) return CUP_PRINT_MIGRATION;

    // Whole-order printing worked before that migration and must keep working.
    const { error: fallbackError } = await supabase.from('orders').update(base).eq('id', orderId);
    return fallbackError ? `Could not send to the printer: ${fallbackError.message}` : null;
  }

  return `Could not send to the printer: ${error.message}`;
}
