'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchShopConfig, getShopStatus, DEFAULT_SETTINGS } from '@/lib/shop';
import { safeDisplayName } from '@/lib/profanity';
import ShopBanner from '@/components/ShopBanner';
import GivingBox from '@/components/GivingBox';
import type { Order, OrderItem, ShopSettings, OrderingHours } from '@/types';

/**
 * The live order board, behind two routes that differ in exactly one thing.
 *
 *  - `/live` — the lobby TV and the shared QR code. No giving box: it's a public display,
 *    and an ask for money that nobody can act on from across the room is just clutter.
 *  - `/yourlive` — where a customer is sent after ordering, on their own phone. Same board,
 *    plus the Pushpay box, because here there is someone holding the screen.
 *
 * One component rather than two pages, so the queue maths and the wait countdown can't
 * drift between the screen on the wall and the screen in someone's hand.
 */

interface LiveOrder extends Order {
  order_items: (OrderItem & { menu_item: { name: string } })[];
}

// Wait time: 1 minute per item. For a given order:
// waitMinutes = (items in all pending/in_progress orders BEFORE this one) + (items in this order)
function calculateWaitMinutes(allOrders: LiveOrder[], currentOrder: LiveOrder): number {
  const sorted = [...allOrders]
    .filter((o) => o.status === 'pending' || o.status === 'in_progress')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const thisOrderItems = currentOrder.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 1;

  let itemsAhead = 0;
  for (const o of sorted) {
    if (o.id === currentOrder.id) break;
    itemsAhead += o.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 1;
  }

  return itemsAhead + thisOrderItems;
}

// Bold, saturated status colors — this screen is read from across the room.
const STATUS_CONFIG = {
  pending: {
    label: 'Up Next',
    card: 'bg-amber-50 border-amber-400',
    badge: 'bg-amber-500 text-white',
    dot: 'bg-white',
    numberChip: 'bg-amber-500 text-white',
    time: 'text-amber-900',
  },
  in_progress: {
    label: 'Being Made',
    card: 'bg-blue-50 border-primary',
    badge: 'bg-primary text-white',
    dot: 'bg-white animate-pulse',
    numberChip: 'bg-primary text-white',
    time: 'text-primary',
  },
  ready: {
    label: 'Ready!',
    card: 'bg-emerald-50 border-success',
    badge: 'bg-success text-white',
    dot: 'bg-white animate-pulse',
    numberChip: 'bg-success text-white',
    time: 'text-success',
  },
} as const;

/**
 * `twoColumn` is the lobby TV layout and nothing else.
 *
 * A 55" screen across the room has width to spare and no scrolling — the Ready
 * pile is what runs off the bottom, so it gets its own column. A phone has the
 * opposite problem, so `/yourlive` stays a single stack with Ready on top:
 * the only question someone holding their phone has is "is mine done yet".
 */
export default function LiveOrders({
  showGiving = false,
  twoColumn = false,
}: {
  showGiving?: boolean;
  twoColumn?: boolean;
}) {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [hours, setHours] = useState<OrderingHours[]>([]);

  const status = getShopStatus(settings, hours, new Date(now));

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(
        `
        *,
        order_items (
          *,
          menu_item:menu_items (name)
        )
      `,
      )
      .in('status', ['pending', 'in_progress', 'ready'])
      .order('created_at', { ascending: true });

    if (data) setOrders(data as unknown as LiveOrder[]);
    setLoading(false);
  }, []);

  const loadConfig = useCallback(async () => {
    const config = await fetchShopConfig();
    setSettings(config.settings);
    setHours(config.hours);
  }, []);

  useEffect(() => {
    fetchOrders();
    loadConfig();

    const channel = supabase
      .channel('live-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, loadConfig)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordering_hours' }, loadConfig)
      .subscribe();

    // Tick every 30s so countdowns and the open/closed state stay live
    const ticker = setInterval(() => setNow(Date.now()), 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(ticker);
    };
  }, [fetchOrders, loadConfig]);

  const readyOrders = orders.filter((o) => o.status === 'ready');
  const queueOrders = orders.filter((o) => o.status === 'pending' || o.status === 'in_progress');

  function queuePosition(order: LiveOrder): number {
    return queueOrders.indexOf(order) + 1;
  }

  // Built once and placed by whichever layout is active below, so the TV and the
  // phone can't drift into rendering a card differently.
  const queueCards = queueOrders.map((order) => (
    <OrderCard
      key={order.id}
      order={order}
      waitMinutes={calculateWaitMinutes(orders, order)}
      position={queuePosition(order)}
      now={now}
    />
  ));

  const readyCards = readyOrders.map((order) => (
    <OrderCard key={order.id} order={order} waitMinutes={null} position={null} now={now} />
  ));

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          <p className="font-body text-lg text-text-light">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className={`mx-auto max-w-2xl px-4 pt-3 ${twoColumn ? 'lg:max-w-[1500px]' : ''}`}>
        <ShopBanner settings={settings} status={status} compact />

        <div className="mt-2.5 flex items-center justify-between px-1">
          <h2 className="font-accent text-xs font-bold uppercase tracking-wide text-text-light">
            Live Order Status
          </h2>
          <p className="font-accent text-xs text-text-light">
            {orders.length} active order{orders.length !== 1 ? 's' : ''} ·{' '}
            {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <main
        className={`mx-auto max-w-2xl space-y-3 px-4 pb-6 pt-3 ${twoColumn ? 'lg:max-w-[1500px]' : ''}`}
      >
        {orders.length === 0 && (
          <div className="py-16 text-center">
            <p className="mb-4 text-6xl">&#9749;</p>
            <h2 className="mb-2 font-heading text-2xl font-bold text-text-dark">
              No orders right now
            </h2>
            <p className="font-body text-text-light">
              {status.isOpen ? 'Come grab a coffee!' : "We'll be back during service."}
            </p>
          </div>
        )}

        {twoColumn ? (
          /* Lobby TV. Left: everything still coming (Up Next + Being Made).
             Right: Ready. Ready is the column that piles up — nobody clears a
             card the second it's called — so its own full-height column is what
             lets the big screen show a dozen finished drinks instead of two.
             Columns are pinned with col-start so a lone Ready list stays right
             instead of sliding into the empty left cell. */
          <div className="grid items-start gap-x-6 gap-y-3 lg:grid-cols-2">
            {queueOrders.length > 0 && (
              <section className="space-y-3 lg:col-start-1">
                <h2 className="px-1 font-accent text-sm font-bold uppercase tracking-wide text-text-light lg:text-base">
                  In queue
                </h2>
                {queueCards}
              </section>
            )}

            {readyOrders.length > 0 && (
              <section className="space-y-3 lg:col-start-2">
                <h2 className="px-1 font-accent text-sm font-bold uppercase tracking-wide text-success lg:text-base">
                  Ready for pickup
                </h2>
                {readyCards}
              </section>
            )}
          </div>
        ) : (
          /* Phone (/yourlive) — one stack, Ready on top. Unchanged. */
          <>
            {readyOrders.length > 0 && (
              <div className="space-y-3">
                <h2 className="px-1 font-accent text-sm font-bold uppercase tracking-wide text-success">
                  Ready for pickup
                </h2>
                {readyCards}
              </div>
            )}

            {queueOrders.length > 0 && (
              <div className="space-y-3">
                {readyOrders.length > 0 && (
                  <h2 className="px-1 pt-2 font-accent text-sm font-bold uppercase tracking-wide text-text-light">
                    In queue
                  </h2>
                )}
                {queueCards}
              </div>
            )}
          </>
        )}

        {orders.length > 0 && (
          <p className="pb-2 pt-4 text-center font-body text-xs text-text-light">
            This page updates automatically · Est. 1 min per item
          </p>
        )}

        {/* Under the queue, not above it — someone opens this page to find their drink,
            and the ask only makes sense once they've found it. */}
        {showGiving && (
          <GivingBox
            className="mt-2"
            message="While you wait for your drink, you can give to the church right here."
          />
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  waitMinutes,
  position,
  now,
}: {
  order: LiveOrder;
  waitMinutes: number | null;
  position: number | null;
  now: number;
}) {
  const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG];
  if (!config) return null;

  const isReady = order.status === 'ready';
  const totalItems = order.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  // Live countdown: when this order should be done, minus time already elapsed
  let remainingMinutes: number | null = null;
  if (!isReady && waitMinutes !== null) {
    const estimatedDoneAt = new Date(order.created_at).getTime() + waitMinutes * 60000;
    remainingMinutes = Math.max(0, Math.ceil((estimatedDoneAt - now) / 60000));
  }

  return (
    <div
      className={`rounded-2xl border-2 p-4 transition-all ${config.card} ${
        isReady ? 'shadow-lg' : 'shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-heading text-lg font-bold shadow-sm ${config.numberChip}`}
          >
            {isReady ? '✓' : position}
          </div>

          <div className="min-w-0">
            {/* Never render the raw name — this is a TV in the church lobby. */}
            <h3 className="font-heading text-xl font-bold leading-tight text-text-dark">
              {safeDisplayName(order.customer_name)}
            </h3>
            <p className="mt-0.5 font-body text-sm text-text-light">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
              {order.order_items?.length > 0 && (
                <span className="ml-1">
                  ·{' '}
                  {order.order_items
                    .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.menu_item?.name}`)
                    .join(', ')}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <span
            className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-accent text-sm font-bold shadow-sm ${config.badge}`}
          >
            <span className={`h-2 w-2 rounded-full ${config.dot}`} />
            {config.label}
          </span>

          {isReady ? (
            <p className="font-accent text-xs font-bold text-success">Pick up at the counter!</p>
          ) : remainingMinutes !== null ? (
            remainingMinutes === 0 ? (
              <p className={`font-accent text-sm font-bold ${config.time}`}>Any moment!</p>
            ) : (
              <div>
                <p className={`font-heading text-xl font-bold ${config.time}`}>
                  ~{remainingMinutes} min
                </p>
                <p className="text-xs text-text-light">remaining</p>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
