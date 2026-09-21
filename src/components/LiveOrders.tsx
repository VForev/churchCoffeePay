'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchShopConfig, getShopStatus, DEFAULT_SETTINGS } from '@/lib/shop';
import { safeDisplayName } from '@/lib/profanity';
import { getMyOrderIds } from '@/lib/my-order';
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
 *
 * `highlightMine` is the third difference, and it only makes sense on a phone: the orders
 * this browser placed are pinned to the top as one big card, because the board is
 * otherwise a public list that answers everyone's question except the holder's own.
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

/**
 * Minutes left on an order, from the same estimate the queue was built with.
 *
 * Both cards below ask for it here rather than each doing the subtraction: the pinned
 * card and the row for the same order sit one above the other on a phone, and two
 * different countdowns for one drink is worse than no countdown at all.
 */
function countdownMinutes(
  order: LiveOrder,
  waitMinutes: number | null,
  now: number,
): number | null {
  if (order.status === 'ready' || waitMinutes === null) return null;
  const doneAt = new Date(order.created_at).getTime() + waitMinutes * 60000;
  return Math.max(0, Math.ceil((doneAt - now) / 60000));
}

// Bold, saturated status colors — this screen is read from across the room.
const STATUS_CONFIG = {
  pending: {
    label: 'Up Next',
    card: 'bg-warning/10 border-warning',
    badge: 'bg-warning text-white',
    dot: 'bg-white',
    numberChip: 'bg-warning text-white',
    time: 'text-text-dark',
  },
  in_progress: {
    label: 'Being Made',
    card: 'bg-primary/10 border-primary',
    badge: 'bg-primary text-white',
    dot: 'bg-white animate-pulse',
    numberChip: 'bg-primary text-white',
    time: 'text-primary',
  },
  ready: {
    label: 'Ready!',
    card: 'bg-success/10 border-success',
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
  embedded = false,
  highlightMine = false,
}: {
  showGiving?: boolean;
  twoColumn?: boolean;
  /**
   * Dropped into the bottom of another page (the confirmation screen) rather than being
   * the page. Loses the full-height background and the shop banner — that page has
   * already said whether the shop is open — and keeps the queue itself identical, which
   * is the whole reason this is a prop and not a second copy of the board.
   */
  embedded?: boolean;
  /**
   * Pin the orders this browser placed to the top of the board (see the file comment).
   * Never on the lobby TV: nobody owns that screen, and a "your order" card there would
   * belong to whoever last ordered from the shop PC.
   */
  highlightMine?: boolean;
}) {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  /**
   * Read once, on the first client render — which paints the loading spinner, so the
   * server and the client agree and nothing flashes. Placing an order remounts the page,
   * which is when a new id needs picking up.
   */
  const [myIds] = useState<string[]>(() => (highlightMine ? getMyOrderIds() : []));
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
  const isMine = (order: LiveOrder) => myIds.includes(order.id);

  const queueCards = queueOrders.map((order) => (
    <OrderCard
      key={order.id}
      order={order}
      waitMinutes={calculateWaitMinutes(orders, order)}
      position={queuePosition(order)}
      now={now}
      mine={isMine(order)}
    />
  ));

  const readyCards = readyOrders.map((order) => (
    <OrderCard
      key={order.id}
      order={order}
      waitMinutes={null}
      position={null}
      now={now}
      mine={isMine(order)}
    />
  ));

  /**
   * Ready first, then position in the queue — the same order they'd want to be told
   * them out loud. Newest-remembered-first would put a second coffee above a drink
   * that is already sitting on the counter going cold.
   */
  const myOrders = orders
    .filter(isMine)
    .sort((a, b) =>
      a.status === b.status
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : a.status === 'ready'
          ? -1
          : b.status === 'ready'
            ? 1
            : 0,
    );

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-bg ${embedded ? 'py-16' : 'min-h-screen'}`}
      >
        <div className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          <p className="font-body text-lg text-text-light">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'bg-bg' : 'min-h-screen bg-bg'}>
      <div className={`mx-auto max-w-2xl px-4 pt-3 ${twoColumn ? 'lg:max-w-[1500px]' : ''}`}>
        {!embedded && <ShopBanner settings={settings} status={status} compact />}

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

        {/* The whole point of /yourlive: the board is a public list, and this is the one
            row on it that belongs to the person holding the phone. Above everything,
            including Ready — their own drink outranks a stranger's. */}
        {myOrders.length > 0 && (
          <section className="space-y-3">
            {myOrders.map((order) => (
              <MyOrderCard
                key={order.id}
                order={order}
                waitMinutes={
                  order.status === 'ready' ? null : calculateWaitMinutes(orders, order)
                }
                position={order.status === 'ready' ? null : queuePosition(order)}
                now={now}
              />
            ))}
            {/* Their order stays in the list below as well, marked "You". The card says
                how long; the list says who is in front of them, which is the other half
                of the question. */}
            <h2 className="px-1 pt-2 font-accent text-sm font-bold uppercase tracking-wide text-text-light">
              The line right now
            </h2>
          </section>
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
  mine = false,
}: {
  order: LiveOrder;
  waitMinutes: number | null;
  position: number | null;
  now: number;
  /** This browser placed it — ringed and labelled, so it's findable in a long list. */
  mine?: boolean;
}) {
  const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG];
  if (!config) return null;

  const isReady = order.status === 'ready';
  const totalItems = order.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const remainingMinutes = countdownMinutes(order, waitMinutes, now);

  return (
    <div
      className={`rounded-2xl border-2 p-4 transition-all ${config.card} ${
        isReady ? 'shadow-lg' : 'shadow-sm'
      } ${mine ? 'ring-2 ring-primary ring-offset-2' : ''}`}
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
            <h3 className="flex flex-wrap items-center gap-2 font-heading text-xl font-bold leading-tight text-text-dark">
              {safeDisplayName(order.customer_name)}
              {mine && (
                <span className="rounded-full bg-primary px-2 py-0.5 font-accent text-xs font-bold uppercase tracking-wide text-white">
                  You
                </span>
              )}
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

/**
 * The pinned card: this phone's own order, above everything else on the board.
 *
 * It answers the three things the person holding the phone is actually asking — is it
 * mine, how far along is it, how long — in that order and at that size. The queue below
 * answers a different question (who is in front of me), which is why the same order
 * still appears down there marked "You" rather than being lifted out of the list.
 *
 * Green the moment it's ready: this is the one card on the page allowed to change colour
 * to get someone's attention, because it's the only one that's about them.
 */
function MyOrderCard({
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
  const isReady = order.status === 'ready';
  const isMaking = order.status === 'in_progress';
  const remaining = countdownMinutes(order, waitMinutes, now);

  const drinks = (order.order_items ?? [])
    .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.menu_item?.name ?? 'Drink'}`)
    .join(', ');

  // Deliberately never invents a time. A queue estimate that hasn't been computed yet
  // says what's happening instead of guessing a number that would then change.
  const headline = isReady
    ? 'Come and grab it!'
    : remaining === null
      ? isMaking
        ? 'Being made now'
        : 'In the queue'
      : remaining === 0
        ? 'Any moment now'
        : position === 1
          ? `You're up next — about ${remaining} min`
          : `About ${remaining} min`;

  const steps = ['Sent', 'Being made', 'Ready'];
  const reached = isReady ? 3 : isMaking ? 2 : 1;

  return (
    <div
      className={`rounded-3xl px-5 py-6 text-white shadow-xl transition-colors ${
        isReady ? 'bg-success' : 'bg-primary'
      }`}
    >
      <p className="text-center font-accent text-xs font-bold uppercase tracking-[0.2em] text-white/70">
        Your order
      </p>

      <p className="mt-1.5 text-center font-heading text-5xl font-bold leading-none">
        {isReady ? '✓' : (position ?? '—')}
      </p>
      <p className="mt-1 text-center font-accent text-xs font-semibold uppercase tracking-wide text-white/60">
        {isReady ? 'Ready' : 'in line'}
      </p>

      <h2 className="mt-3 text-center font-heading text-2xl font-bold leading-tight">
        {safeDisplayName(order.customer_name)}
      </h2>
      {drinks && <p className="mt-1 text-center font-body text-sm text-white/75">{drinks}</p>}

      <div className="mt-5 flex gap-1.5">
        {steps.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i < reached ? 'bg-white' : 'bg-white/25'}`} />
            <p
              className={`mt-1.5 text-center font-accent text-[10px] font-semibold uppercase tracking-wide ${
                i < reached ? 'text-white' : 'text-white/50'
              }`}
            >
              {label}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center font-heading text-lg font-bold">{headline}</p>
    </div>
  );
}
