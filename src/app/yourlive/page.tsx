'use client';

import LiveOrders from '@/components/LiveOrders';

/**
 * The customer's own copy of the order board — where they land after placing an order,
 * and what the "Track Order" button opens.
 *
 * Identical to /live except that it asks for a gift under the queue. That's the whole
 * reason the two routes exist: the giving box belongs on a phone someone is holding,
 * not on the TV in the lobby.
 */
export default function YourLiveOrdersPage() {
  return <LiveOrders showGiving />;
}
