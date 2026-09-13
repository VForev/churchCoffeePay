'use client';

import LiveOrders from '@/components/LiveOrders';

/**
 * The customer's own copy of the order board — where they land after placing an order,
 * and what the "Track Order" button opens.
 *
 * Two things /live doesn't have, and both for the same reason — someone is holding this
 * screen rather than looking at it across a room:
 *
 *  - `highlightMine` pins the orders this browser placed to the top of the board.
 *  - `showGiving` asks for a gift under the queue.
 */
export default function YourLiveOrdersPage() {
  return <LiveOrders showGiving highlightMine />;
}
