'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { fetchShopConfig, getShopStatus, DEFAULT_SETTINGS } from '@/lib/shop';
import { safeDisplayName } from '@/lib/profanity';
import ShopBanner from '@/components/ShopBanner';
import GivingBox from '@/components/GivingBox';
import IOSSpinner from '@/components/ui/Spinner';
import { springLayout, springPop } from '@/lib/motion';
import { cn } from '@/lib/utils';
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

/**
 * Status colors as accent-on-tint rather than fixed pastels.
 *
 * This screen is read from across a room, so the accent itself carries the
 * status and the tint only has to separate the card from the page. That also
 * means it survives dark mode: a `bg-emerald-50` card would glow white on the
 * black background a TV in a dim lobby actually shows.
 */
const STATUS_CONFIG = {
  pending: {
    label: 'Up Next',
    card: 'bg-warning/10 ring-warning/30',
    chip: 'bg-warning text-white',
    accent: 'text-warning',
  },
  in_progress: {
    label: 'Being Made',
    card: 'bg-primary/10 ring-primary/30',
    chip: 'bg-primary text-white',
    accent: 'text-primary',
  },
  ready: {
    label: 'Ready!',
    card: 'bg-success/12 ring-success/40',
    chip: 'bg-success text-white',
    accent: 'text-success',
  },
} as const;

export default function LiveOrders({ showGiving = false }: { showGiving?: boolean }) {
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

  if (loading) {
    return (
      <div className="flex min-h-screen-safe items-center justify-center bg-bg">
        <div className="text-center">
          <IOSSpinner size={28} />
          <p className="text-ios-body mt-4 text-label-secondary">Loading orders…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe bg-bg">
      <div className="mx-auto max-w-2xl px-4 pt-3 pt-safe">
        <ShopBanner settings={settings} status={status} compact />

        <div className="mt-3 flex items-center justify-between px-1">
          <h2 className="text-ios-caption font-semibold uppercase tracking-wide text-label-secondary">
            Live Order Status
          </h2>
          <p className="text-ios-caption tnum text-label-tertiary">
            {orders.length} active order{orders.length !== 1 ? 's' : ''} ·{' '}
            {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 pb-6 pt-3 pb-safe-4">
        {orders.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-16 text-center"
          >
            <p className="mb-4 text-6xl">&#9749;</p>
            <h2 className="text-ios-title1 mb-2 text-label">No orders right now</h2>
            <p className="text-ios-body text-label-secondary">
              {status.isOpen ? 'Come grab a coffee!' : "We'll be back during service."}
            </p>
          </motion.div>
        )}

        {/* `layout` on the sections plus a shared card layout means an order
            promoted to Ready visibly travels from the queue up into the pickup
            list, instead of disappearing from one place and blinking into
            another. On a lobby TV that motion is what draws the eye to it. */}
        <motion.div layout className="space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {readyOrders.length > 0 && (
              <motion.h2
                key="ready-header"
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-ios-footnote px-1 font-semibold uppercase tracking-wide text-success"
              >
                Ready for pickup
              </motion.h2>
            )}

            {readyOrders.map((order) => (
              <OrderCard key={order.id} order={order} waitMinutes={null} position={null} now={now} />
            ))}

            {queueOrders.length > 0 && readyOrders.length > 0 && (
              <motion.h2
                key="queue-header"
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-ios-footnote px-1 pt-2 font-semibold uppercase tracking-wide text-label-secondary"
              >
                In queue
              </motion.h2>
            )}

            {queueOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                waitMinutes={calculateWaitMinutes(orders, order)}
                position={queuePosition(order)}
                now={now}
              />
            ))}
          </AnimatePresence>
        </motion.div>

        {orders.length > 0 && (
          <p className="text-ios-caption pb-2 pt-5 text-center text-label-tertiary">
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
    <motion.div
      layout
      // layoutId ties this card to itself across the section change, so Framer
      // interpolates its real position rather than cross-fading two cards.
      layoutId={order.id}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
      transition={springLayout}
      className={cn('rounded-[var(--r-lg)] p-4 shadow-sm ring-1', config.card)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <motion.div
            layout
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[19px] font-bold shadow-sm',
              config.chip,
            )}
          >
            {isReady ? (
              <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none">
                <path
                  d="M2.5 8.5l3.5 3.5 7.5-8"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <span className="tnum">{position}</span>
            )}
          </motion.div>

          <div className="min-w-0">
            {/* Never render the raw name — this is a TV in the church lobby. */}
            <h3 className="text-ios-title2 leading-tight text-label">
              {safeDisplayName(order.customer_name)}
            </h3>
            <p className="text-ios-subhead mt-0.5 text-label-secondary">
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
            className={cn(
              'mb-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[15px] font-semibold shadow-sm',
              config.chip,
            )}
          >
            <span className="relative flex h-2 w-2">
              {!isReady && order.status === 'pending' ? (
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              ) : (
                <>
                  <motion.span
                    animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                    className="absolute inline-flex h-full w-full rounded-full bg-white"
                  />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </>
              )}
            </span>
            {config.label}
          </span>

          {isReady ? (
            <p className="text-ios-footnote font-semibold text-success">
              Pick up at the counter!
            </p>
          ) : remainingMinutes !== null ? (
            remainingMinutes === 0 ? (
              <p className={cn('text-ios-callout font-semibold', config.accent)}>Any moment!</p>
            ) : (
              <div>
                {/* Keyed on the value so each tick of the countdown rolls over
                    rather than swapping in place. tnum stops the width jitter. */}
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.p
                    key={remainingMinutes}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={springPop}
                    className={cn('tnum text-ios-title2', config.accent)}
                  >
                    ~{remainingMinutes} min
                  </motion.p>
                </AnimatePresence>
                <p className="text-ios-caption text-label-tertiary">remaining</p>
              </div>
            )
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
