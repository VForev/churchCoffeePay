'use client';

import { supabase } from './supabase';

/**
 * How many drinks are waiting or being made right now — the "~N min current wait" on the
 * menu and at checkout (one minute per drink; see "Wait time calculation" in CLAUDE.md).
 *
 * One round trip: the drinks come embedded in the orders query rather than being fetched
 * by id afterwards. Returns null if the query fails, so a page shows no estimate rather
 * than a confident "No wait".
 */
export async function fetchQueueDrinkCount(): Promise<number | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('order_items(quantity)')
    .in('status', ['pending', 'in_progress'])
    .is('archived_at', null);

  if (error || !data) return null;

  return (data as { order_items: { quantity: number }[] | null }[]).reduce(
    (sum, order) => sum + (order.order_items ?? []).reduce((s, i) => s + i.quantity, 0),
    0,
  );
}
