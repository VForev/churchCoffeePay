/**
 * Inserting the `orders` row, on a database that may be a migration or two behind.
 *
 * Three columns on that row come from migrations a shop might not have run:
 * `giving_intent` (supabase-giving-intent.sql), `device_id`
 * (supabase-order-rate-limit.sql) and `event_id`. On the mobile checkout path the
 * insert happens *after* Stripe has taken the money, so a rejected column there is not
 * a missing metric — it is a charged customer with no order and no drink. None of these
 * three is ever worth that.
 *
 * So the insert walks down: it tries the full row, and each time PostgREST says a column
 * isn't there it drops that one column and tries again. A rejected insert inserts
 * nothing, which is what makes the retry safe — it can never double-order.
 *
 * Anything that is NOT one of those three is returned as the error it is. A failure to
 * write `total` must surface, not be papered over by dropping the price.
 */

import { supabase } from './supabase';

/** Columns an order can be placed without. Everything else is load-bearing. */
const OPTIONAL_COLUMNS = new Set(['giving_intent', 'device_id', 'event_id']);

/**
 * The column name in a "that column doesn't exist here" error, or null for any other
 * failure. Covers both spellings: PostgREST's schema-cache miss (PGRST204,
 * "Could not find the 'x' column of 'orders' in the schema cache") and Postgres'
 * own undefined_column (42703, `column "x" of relation "orders" does not exist`).
 */
export function missingColumnName(
  error: { code?: string; message?: string } | null | undefined,
): string | null {
  if (!error) return null;
  const message = error.message ?? '';
  const known = error.code === 'PGRST204' || error.code === '42703';
  if (!known && !/column .* (does not exist|in the schema cache)/i.test(message)) return null;

  const quoted = message.match(/'([^']+)'|"([^"]+)"/);
  return quoted ? (quoted[1] ?? quoted[2] ?? null) : null;
}

export interface OrderInsertResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
  /** Columns this database turned out not to have. Useful for a console note; never shown. */
  dropped: string[];
}

/** Inserts one order row, dropping optional columns this database doesn't have. */
export async function insertOrderRow<T = { id: string }>(
  row: Record<string, unknown>,
): Promise<OrderInsertResult<T>> {
  const attempt: Record<string, unknown> = { ...row };
  const dropped: string[] = [];

  // At most one pass per optional column, plus the first try.
  for (let i = 0; i <= OPTIONAL_COLUMNS.size; i++) {
    const { data, error } = await supabase.from('orders').insert(attempt).select().single();
    if (!error) return { data: data as T, error: null, dropped };

    const missing = missingColumnName(error);
    if (!missing || !OPTIONAL_COLUMNS.has(missing) || !(missing in attempt)) {
      return { data: null, error, dropped };
    }

    delete attempt[missing];
    dropped.push(missing);
  }

  return { data: null, error: { message: 'Failed to create order' }, dropped };
}
