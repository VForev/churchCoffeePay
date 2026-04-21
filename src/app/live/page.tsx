'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Order, OrderItem } from '@/types';

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

const STATUS_CONFIG = {
  pending: {
    label: 'Up Next',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    dot: 'bg-warning',
    text: 'text-amber-700',
    badge: 'bg-warning/20 text-amber-800',
  },
  in_progress: {
    label: 'Being Made',
    bg: 'bg-primary/5',
    border: 'border-primary/20',
    dot: 'bg-primary animate-pulse',
    text: 'text-primary',
    badge: 'bg-primary/10 text-primary',
  },
  ready: {
    label: 'Ready!',
    bg: 'bg-success/10',
    border: 'border-success/40',
    dot: 'bg-success',
    text: 'text-success',
    badge: 'bg-success/20 text-success font-bold',
  },
} as const;

export default function LiveOrdersPage() {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  // Track orders that just became "ready" to briefly highlight them
  const prevOrdersRef = useRef<LiveOrder[]>([]);

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          menu_item:menu_items (name)
        )
      `)
      .in('status', ['pending', 'in_progress', 'ready'])
      .order('created_at', { ascending: true });

    if (data) {
      prevOrdersRef.current = orders;
      setOrders(data as unknown as LiveOrder[]);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('live-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Separate ready orders (pinned top) from queue orders
  const readyOrders = orders.filter((o) => o.status === 'ready');
  const queueOrders = orders.filter((o) => o.status === 'pending' || o.status === 'in_progress');

  // Queue position: 1-indexed among pending+in_progress, sorted by created_at
  function queuePosition(order: LiveOrder): number {
    return queueOrders.indexOf(order) + 1;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-light font-body text-lg">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="bg-primary text-white sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold">LOTG Coffee</h1>
            <p className="text-sm opacity-75 mt-0.5">Live Order Status</p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-75">
              {orders.length} active order{orders.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs opacity-50 mt-0.5">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {/* Empty state */}
        {orders.length === 0 && (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">&#9749;</p>
            <h2 className="text-2xl font-heading font-bold text-text-dark mb-2">
              No orders right now
            </h2>
            <p className="text-text-light font-body">Come grab a coffee!</p>
          </div>
        )}

        {/* Ready orders — pinned at top */}
        {readyOrders.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-accent font-semibold text-success uppercase tracking-wide px-1">
              Ready for pickup
            </h2>
            {readyOrders.map((order) => (
              <OrderCard key={order.id} order={order} waitMinutes={null} position={null} />
            ))}
          </div>
        )}

        {/* Queue */}
        {queueOrders.length > 0 && (
          <div className="space-y-3">
            {readyOrders.length > 0 && (
              <h2 className="text-sm font-accent font-semibold text-text-light uppercase tracking-wide px-1 pt-2">
                In queue
              </h2>
            )}
            {queueOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                waitMinutes={calculateWaitMinutes(orders, order)}
                position={queuePosition(order)}
              />
            ))}
          </div>
        )}

        {/* Footer note */}
        {orders.length > 0 && (
          <p className="text-center text-xs text-text-light pt-4 pb-2 font-body">
            This page updates automatically · Est. 1 min per item
          </p>
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  waitMinutes,
  position,
}: {
  order: LiveOrder;
  waitMinutes: number | null;
  position: number | null;
}) {
  const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG];
  if (!config) return null;

  const isReady = order.status === 'ready';
  const totalItems = order.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div
      className={`rounded-2xl border-2 p-4 transition-all ${config.bg} ${config.border} ${
        isReady ? 'shadow-lg' : 'shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left side */}
        <div className="flex items-start gap-3 min-w-0">
          {/* Position number or checkmark */}
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-heading font-bold shrink-0 ${
              isReady
                ? 'bg-success text-white text-xl'
                : 'bg-surface text-text-dark border-2 border-gray-200'
            }`}
          >
            {isReady ? '✓' : position}
          </div>

          {/* Name and items */}
          <div className="min-w-0">
            <h3
              className={`font-heading font-bold text-xl leading-tight ${
                isReady ? 'text-success' : 'text-text-dark'
              }`}
            >
              {order.customer_name}
            </h3>
            <p className="text-sm text-text-light mt-0.5 font-body">
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

        {/* Right side — status + time */}
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end mb-1">
            <span className={`w-2 h-2 rounded-full ${config.dot}`} />
            <span className={`text-sm font-accent font-semibold ${config.text}`}>
              {config.label}
            </span>
          </div>
          {isReady ? (
            <p className="text-xs text-success font-body">Pick up at the counter!</p>
          ) : waitMinutes !== null ? (
            <div>
              <p className="text-lg font-heading font-bold text-text-dark">
                ~{waitMinutes} min
              </p>
              <p className="text-xs text-text-light">estimated</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
