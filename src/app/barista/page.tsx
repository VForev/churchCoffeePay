'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import type { Order, OrderItem, OrderItemModifier, Modifier } from '@/types';

interface FullOrder extends Order {
  order_items: (OrderItem & {
    menu_item: { name: string };
    order_item_modifiers: (OrderItemModifier & { modifier: Modifier })[];
  })[];
}

export default function BaristaPage() {
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevCountRef = useRef(0);

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          menu_item:menu_items (name),
          order_item_modifiers (
            *,
            modifier:modifiers (*)
          )
        )
      `)
      .in('status', ['pending', 'in_progress', 'ready'])
      .order('created_at', { ascending: true });

    if (data) {
      setOrders(data as unknown as FullOrder[]);
      // Play sound if new orders arrived
      if (data.length > prevCountRef.current && prevCountRef.current > 0) {
        playNotification();
      }
      prevCountRef.current = data.length;
    }
    setLoading(false);
  }

  function playNotification() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH+Jj4+IfGhaaXaAioyMh3xpXGl3g4uOjoh7aFtteoSMj42He2ZbbHqEjI+NiHtnW2x5hIyPjYh7Z1xse4ONj42Ie2dcbHuDjY+NiHtnXGx7g42PjYh7Z1xse4ONj42Ie2dcbHuDjY+NiHtnXGx7g42PjYh7Z1xse4ONj42Ie2dcbHuDjY+NiHtnXGx7');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }

  useEffect(() => {
    fetchOrders();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('barista-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function updateStatus(orderId: string, newStatus: string) {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    fetchOrders();
  }

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const inProgressOrders = orders.filter((o) => o.status === 'in_progress');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-primary text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Barista Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-75">
              {orders.length} active order{orders.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {orders.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">&#9749;</p>
            <h2 className="text-2xl font-heading font-bold text-text-dark mb-2">No Orders</h2>
            <p className="text-text-light">Waiting for customers...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pending Column */}
            <div>
              <h2 className="font-heading font-bold text-lg text-warning mb-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-warning" />
                Pending ({pendingOrders.length})
              </h2>
              <div className="space-y-3">
                {pendingOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    actions={
                      <Button size="sm" onClick={() => updateStatus(order.id, 'in_progress')}>
                        Start Making
                      </Button>
                    }
                  />
                ))}
              </div>
            </div>

            {/* In Progress Column */}
            <div>
              <h2 className="font-heading font-bold text-lg text-primary mb-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary" />
                Making ({inProgressOrders.length})
              </h2>
              <div className="space-y-3">
                {inProgressOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    actions={
                      <Button size="sm" variant="success" onClick={() => updateStatus(order.id, 'ready')}>
                        Mark Ready
                      </Button>
                    }
                  />
                ))}
              </div>
            </div>

            {/* Ready Column */}
            <div>
              <h2 className="font-heading font-bold text-lg text-success mb-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-success" />
                Ready ({readyOrders.length})
              </h2>
              <div className="space-y-3">
                {readyOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    highlight
                    actions={
                      <Button size="sm" variant="ghost" className="border border-gray-200" onClick={() => updateStatus(order.id, 'completed')}>
                        Complete
                      </Button>
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function OrderCard({ order, actions, highlight }: { order: FullOrder; actions: React.ReactNode; highlight?: boolean }) {
  const timeAgo = getTimeAgo(order.created_at);

  return (
    <Card className={highlight ? 'ring-2 ring-success/30 bg-success/5' : ''}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-heading font-bold text-lg text-text-dark">
            {order.customer_name}
          </h3>
          <p className="text-xs text-text-light">{timeAgo} &middot; {order.order_source}</p>
        </div>
        <div className="flex gap-1.5">
          <OrderStatusBadge status={order.status} />
          <PaymentBadge status={order.payment_status} />
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        {order.order_items?.map((item) => (
          <div key={item.id} className="text-sm">
            <div className="flex justify-between">
              <span className="font-body font-semibold">
                {item.quantity}x {item.menu_item?.name}
              </span>
            </div>
            {item.order_item_modifiers?.length > 0 && (
              <p className="text-xs text-text-light pl-4">
                {item.order_item_modifiers.map((m) => m.modifier?.name).filter(Boolean).join(', ')}
              </p>
            )}
            {item.special_instructions && (
              <p className="text-xs text-warm pl-4 italic">
                &ldquo;{item.special_instructions}&rdquo;
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end">{actions}</div>
    </Card>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}
