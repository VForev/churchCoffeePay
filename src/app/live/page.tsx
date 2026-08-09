'use client';

import LiveOrders from '@/components/LiveOrders';

/**
 * The public order board — the lobby TV, and the URL / QR code shared with everyone.
 *
 * No giving box here on purpose: this screen is read from across the room, often by
 * people who aren't holding it, and an ask nobody can act on is just clutter. The
 * customer's own copy of this page is /yourlive, and that one has it.
 */
export default function LiveOrdersPage() {
  return <LiveOrders />;
}
