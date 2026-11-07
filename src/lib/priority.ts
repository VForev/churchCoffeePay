/**
 * Priority orders — the one definition of "who is next in line".
 *
 * A priority code (a coupon with `is_priority`, see supabase-codes.sql) stamps
 * `orders.is_priority`, and the order goes ahead of every order that hasn't been started.
 * It never goes ahead of a drink that is already being made: that cup is physically in
 * front of it, and pretending otherwise would quote the person whose drink is half-poured
 * a longer wait than they actually have.
 *
 * /barista and /live both sort with `compareQueue`, and both wait-time calculations walk
 * the queue in this order — so the card the barista reaches for next, the wait on that
 * card and the position on the lobby TV can never disagree.
 */

import type { Order } from '@/types';

type QueueOrder = Pick<Order, 'status' | 'created_at' | 'is_priority'>;

/** 0 = being made, 1 = priority and waiting, 2 = everyone else. */
function queueRank(order: QueueOrder): number {
  if (order.status === 'in_progress') return 0;
  return order.is_priority ? 1 : 2;
}

/** Sort comparator for the active queue: being made, then priority, then oldest first. */
export function compareQueue(a: QueueOrder, b: QueueOrder): number {
  return (
    queueRank(a) - queueRank(b) ||
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}
