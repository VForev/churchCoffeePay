'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type {
  Order,
  OrderItem,
  OrderItemModifier,
  Modifier,
  MenuItem,
  Category,
  ModifierGroup,
  OrderStatus,
} from '@/types';

interface FullOrder extends Order {
  order_items: (OrderItem & {
    menu_item: { name: string };
    order_item_modifiers: (OrderItemModifier & { modifier: Modifier })[];
  })[];
}

/** Where "go back" sends an order that was advanced by mistake. */
const PREVIOUS_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  in_progress: 'pending',
  ready: 'in_progress',
  completed: 'ready',
};

function orderItemCount(order: FullOrder): number {
  return order.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 1;
}

// Wait time for a given order: items in orders placed before it + items in this order
function calcWaitMinutes(allOrders: FullOrder[], targetOrder: FullOrder): number {
  const active = allOrders
    .filter((o) => o.status === 'pending' || o.status === 'in_progress')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let itemsAhead = 0;
  for (const o of active) {
    if (o.id === targetOrder.id) break;
    itemsAhead += orderItemCount(o);
  }
  return itemsAhead + orderItemCount(targetOrder);
}

type Tab = 'orders' | 'stock';
type ColumnKey = 'pending' | 'in_progress' | 'ready';
type ColumnColor = 'warning' | 'primary' | 'success';

const COLUMNS: { key: ColumnKey; title: string; color: ColumnColor }[] = [
  { key: 'pending', title: 'Pending', color: 'warning' },
  { key: 'in_progress', title: 'Making', color: 'primary' },
  { key: 'ready', title: 'Ready', color: 'success' },
];

const COLUMN_STYLES: Record<ColumnColor, { text: string; dot: string; activeBg: string }> = {
  warning: { text: 'text-warning', dot: 'bg-warning', activeBg: 'bg-warning' },
  primary: { text: 'text-primary', dot: 'bg-primary', activeBg: 'bg-primary' },
  success: { text: 'text-success', dot: 'bg-success', activeBg: 'bg-success' },
};

export default function BaristaPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [phoneColumn, setPhoneColumn] = useState<ColumnKey>('pending');
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);
  /** Lets a barista undo a "Picked Up" tap that closed the wrong order. */
  const [justCompleted, setJustCompleted] = useState<FullOrder | null>(null);
  const prevCountRef = useRef(0);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(
        `
        *,
        order_items (
          *,
          menu_item:menu_items (name),
          order_item_modifiers (
            *,
            modifier:modifiers (*)
          )
        )
      `,
      )
      .in('status', ['pending', 'in_progress', 'ready'])
      .order('created_at', { ascending: true });

    if (data) {
      setOrders(data as unknown as FullOrder[]);
      if (data.length > prevCountRef.current && prevCountRef.current > 0) {
        playNotification();
      }
      prevCountRef.current = data.length;
    }
    setLoading(false);
  }, []);

  function playNotification() {
    try {
      const audio = new Audio(
        'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH+Jj4+IfGhaaXaAioyMh3xpXGl3g4uOjoh7aFtteoSMj42He2ZbbHqEjI+NiHtnW2x5hIyPjYh7Z1xse4ONj42Ie2dcbHuDjY+NiHtnXGx7g42PjYh7Z1xse4ONj42Ie2dcbHuDjY+NiHtnXGx7g42PjYh7Z1xse4ONj42Ie2dcbHuDjY+NiHtnXGx7',
      );
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel('barista-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, [fetchOrders]);

  async function updateStatus(orderId: string, newStatus: OrderStatus) {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    fetchOrders();
  }

  /** Completing removes the order from the board, so offer a brief window to take it back. */
  async function completeOrder(order: FullOrder) {
    await updateStatus(order.id, 'completed');
    setJustCompleted(order);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setJustCompleted(null), 12000);
  }

  async function undoComplete() {
    if (!justCompleted) return;
    await updateStatus(justCompleted.id, 'ready');
    setJustCompleted(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  const ordersByStatus: Record<ColumnKey, FullOrder[]> = {
    pending: orders.filter((o) => o.status === 'pending'),
    in_progress: orders.filter((o) => o.status === 'in_progress'),
    ready: orders.filter((o) => o.status === 'ready'),
  };

  const totalItems = orders
    .filter((o) => o.status === 'pending' || o.status === 'in_progress')
    .reduce((s, o) => s + orderItemCount(o), 0);

  /** One card definition per column, so phone and kanban layouts never drift apart. */
  function renderCard(order: FullOrder, column: ColumnKey) {
    if (column === 'pending') {
      return (
        <OrderCard
          key={order.id}
          order={order}
          waitMinutes={calcWaitMinutes(orders, order)}
          actions={
            <Button size="lg" fullWidth onClick={() => updateStatus(order.id, 'in_progress')}>
              Start Making
            </Button>
          }
        />
      );
    }

    if (column === 'in_progress') {
      return (
        <OrderCard
          key={order.id}
          order={order}
          waitMinutes={calcWaitMinutes(orders, order)}
          onBack={() => updateStatus(order.id, PREVIOUS_STATUS.in_progress!)}
          backLabel="Back to Pending"
          actions={
            <Button size="lg" fullWidth variant="success" onClick={() => updateStatus(order.id, 'ready')}>
              Mark Ready
            </Button>
          }
        />
      );
    }

    return (
      <OrderCard
        key={order.id}
        order={order}
        waitMinutes={null}
        highlight
        onBack={() => updateStatus(order.id, PREVIOUS_STATUS.ready!)}
        backLabel="Back to Making"
        actions={
          <Button size="lg" fullWidth variant="success" onClick={() => completeOrder(order)}>
            Order Picked Up ✓
          </Button>
        }
      />
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 bg-primary text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h1 className="font-heading text-xl font-bold">Barista Dashboard</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="opacity-75">
              {orders.length} order{orders.length !== 1 ? 's' : ''}
            </span>
            {totalItems > 0 && (
              <span className="rounded-full bg-white/20 px-3 py-1 font-accent">
                {totalItems} drink{totalItems !== 1 ? 's' : ''} · ~{totalItems} min queue
              </span>
            )}
            <a
              href="/live"
              target="_blank"
              className="font-accent text-xs underline opacity-75 hover:opacity-100"
            >
              Live Screen ↗
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto flex max-w-7xl gap-1 px-4">
          {(
            [
              ['orders', 'Orders'],
              ['stock', "Sold Out / 86"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'cursor-pointer touch-manipulation rounded-t-xl px-5 py-2.5 font-accent text-sm font-semibold transition-colors',
                tab === key ? 'bg-bg text-primary' : 'text-white/70 hover:bg-white/10',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'stock' ? (
        <StockPanel />
      ) : (
        <main className="mx-auto max-w-7xl p-4">
          {orders.length === 0 ? (
            <div className="py-20 text-center">
              <p className="mb-4 text-6xl">&#9749;</p>
              <h2 className="mb-2 font-heading text-2xl font-bold text-text-dark">No Orders</h2>
              <p className="text-text-light">Waiting for customers...</p>
            </div>
          ) : (
            <>
              {/* Phone: one column at a time. Stacking all three means scrolling
                  past every pending order to reach the one you're making. */}
              <div className="mb-4 flex gap-2 md:hidden">
                {COLUMNS.map((col) => {
                  const count = ordersByStatus[col.key].length;
                  const active = phoneColumn === col.key;
                  return (
                    <button
                      key={col.key}
                      onClick={() => setPhoneColumn(col.key)}
                      className={cn(
                        'flex-1 cursor-pointer touch-manipulation rounded-xl border-2 px-2 py-3 transition-all active:scale-95',
                        active
                          ? `${COLUMN_STYLES[col.color].activeBg} border-transparent text-white`
                          : 'border-gray-200 bg-surface text-text-light',
                      )}
                    >
                      <span className="block font-heading text-2xl font-bold leading-none">
                        {count}
                      </span>
                      <span className="mt-1 block font-accent text-xs font-semibold">
                        {col.title}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4 md:hidden">
                {ordersByStatus[phoneColumn].length === 0 ? (
                  <p className="py-12 text-center font-body text-text-light">
                    Nothing in {COLUMNS.find((c) => c.key === phoneColumn)!.title.toLowerCase()}
                  </p>
                ) : (
                  ordersByStatus[phoneColumn].map((order) => renderCard(order, phoneColumn))
                )}
              </div>

              {/* Tablet and up: full kanban */}
              <div className="hidden gap-6 md:grid md:grid-cols-3">
                {COLUMNS.map((col) => (
                  <Column
                    key={col.key}
                    title={col.title}
                    count={ordersByStatus[col.key].length}
                    color={col.color}
                    pulse={col.key === 'in_progress'}
                  >
                    {ordersByStatus[col.key].map((order) => renderCard(order, col.key))}
                  </Column>
                ))}
              </div>
            </>
          )}
        </main>
      )}

      {/* Undo bar for an accidental "Picked Up" */}
      {justCompleted && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-text-dark px-5 py-3 text-white shadow-xl">
          <span className="font-body text-sm">
            <strong className="font-heading">{justCompleted.customer_name}</strong>&apos;s order
            marked picked up
          </span>
          <button
            onClick={undoComplete}
            className="cursor-pointer touch-manipulation rounded-full bg-white px-4 py-1.5 font-accent text-sm font-bold text-text-dark transition-colors hover:bg-gray-100"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function Column({
  title,
  count,
  color,
  pulse,
  children,
}: {
  title: string;
  count: number;
  color: ColumnColor;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  const style = COLUMN_STYLES[color];

  return (
    <div>
      <h2 className={cn('mb-3 flex items-center gap-2 font-heading text-lg font-bold', style.text)}>
        <span className={cn('h-3 w-3 rounded-full', style.dot, pulse && 'animate-pulse')} />
        {title} ({count})
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function OrderCard({
  order,
  actions,
  highlight,
  waitMinutes,
  onBack,
  backLabel,
}: {
  order: FullOrder;
  actions: React.ReactNode;
  highlight?: boolean;
  waitMinutes: number | null;
  onBack?: () => void;
  backLabel?: string;
}) {
  const timeAgo = getTimeAgo(order.created_at);
  const itemCount = orderItemCount(order);

  return (
    <Card className={cn('p-4', highlight && 'bg-success/5 ring-2 ring-success/30')}>
      {/* Who it's for — the thing the barista shouts */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-2xl font-bold leading-tight text-text-dark">
            {order.customer_name}
          </h3>
          <p className="mt-0.5 font-accent text-sm text-text-light">
            {timeAgo} · {itemCount} item{itemCount !== 1 ? 's' : ''}
            {waitMinutes !== null && ` · ~${waitMinutes} min`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OrderStatusBadge status={order.status} />
          <PaymentBadge status={order.payment_status} />
        </div>
      </div>

      {/* What to make */}
      <div className="mb-4 space-y-2">
        {order.order_items?.map((item) => (
          <div key={item.id} className="rounded-xl bg-bg p-3">
            <div className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary font-accent text-sm font-bold text-white">
                {item.quantity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg font-bold leading-snug text-text-dark">
                  {item.menu_item?.name}
                </p>

                {item.order_item_modifiers?.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {item.order_item_modifiers.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-1.5 font-body text-base text-text"
                      >
                        <span className="text-primary">•</span>
                        {m.modifier?.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Special requests get their own loud box — easiest thing to miss */}
            {item.special_instructions && (
              <div className="mt-2 rounded-lg border-l-4 border-warm bg-warm/10 px-3 py-2">
                <p className="font-accent text-xs font-bold uppercase tracking-wide text-warm">
                  Note
                </p>
                <p className="font-body text-base font-semibold text-text-dark">
                  {item.special_instructions}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions — big enough to hit with a wet hand */}
      <div className="space-y-2">
        {actions}
        {onBack && (
          <button
            onClick={onBack}
            className="w-full cursor-pointer touch-manipulation rounded-full border border-gray-200 py-2.5 font-accent text-sm font-semibold text-text-light transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-text"
          >
            ← {backLabel}
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── Sold Out / 86 panel ──────────────────────────────────────────────────────

function StockPanel() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [catRes, itemRes, groupRes, modRes] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('display_order'),
      supabase.from('menu_items').select('*').eq('is_available', true).order('display_order'),
      supabase.from('modifier_groups').select('*').order('display_order'),
      supabase.from('modifiers').select('*').eq('is_available', true).order('display_order'),
    ]);
    if (catRes.data) setCategories(catRes.data);
    if (itemRes.data) setItems(itemRes.data);
    if (groupRes.data) setGroups(groupRes.data);
    if (modRes.data) setModifiers(modRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function toggleItem(item: MenuItem) {
    setSaving(item.id);
    const { error } = await supabase
      .from('menu_items')
      .update({ is_sold_out: !item.is_sold_out })
      .eq('id', item.id);
    if (error) alert(`Could not update: ${error.message}`);
    else
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_sold_out: !i.is_sold_out } : i)),
      );
    setSaving(null);
  }

  async function toggleModifier(mod: Modifier) {
    setSaving(mod.id);
    const { error } = await supabase
      .from('modifiers')
      .update({ is_sold_out: !mod.is_sold_out })
      .eq('id', mod.id);
    if (error) alert(`Could not update: ${error.message}`);
    else
      setModifiers((prev) =>
        prev.map((m) => (m.id === mod.id ? { ...m, is_sold_out: !m.is_sold_out } : m)),
      );
    setSaving(null);
  }

  const soldOutCount =
    items.filter((i) => i.is_sold_out).length + modifiers.filter((m) => m.is_sold_out).length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-4">
      <div className="mb-5 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
        <p className="font-body text-sm text-text">
          Tap anything you&apos;ve run out of. Customers see it as{' '}
          <strong className="font-accent text-danger">Sold Out</strong> immediately — no refresh
          needed.
        </p>
        {soldOutCount > 0 && (
          <p className="mt-1 font-accent text-xs font-semibold text-danger">
            {soldOutCount} item{soldOutCount !== 1 ? 's' : ''} currently sold out
          </p>
        )}
      </div>

      {/* Drinks by category */}
      <h2 className="mb-3 font-heading text-lg font-bold text-text-dark">Drinks</h2>
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.category_id === cat.id);
        if (catItems.length === 0) return null;

        return (
          <div key={cat.id} className="mb-5">
            <h3 className="mb-2 font-accent text-xs font-semibold uppercase tracking-wide text-text-light">
              {cat.name}
            </h3>
            <div className="space-y-2">
              {catItems.map((item) => (
                <StockRow
                  key={item.id}
                  name={item.name}
                  soldOut={item.is_sold_out}
                  busy={saving === item.id}
                  onToggle={() => toggleItem(item)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Add-ins by modifier group */}
      <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-text-dark">
        Add-ins &amp; Options
      </h2>
      {groups.map((group) => {
        const groupMods = modifiers.filter((m) => m.group_id === group.id);
        if (groupMods.length === 0) return null;

        return (
          <div key={group.id} className="mb-5">
            <h3 className="mb-2 font-accent text-xs font-semibold uppercase tracking-wide text-text-light">
              {group.name}
            </h3>
            <div className="space-y-2">
              {groupMods.map((mod) => (
                <StockRow
                  key={mod.id}
                  name={mod.name}
                  soldOut={mod.is_sold_out}
                  busy={saving === mod.id}
                  onToggle={() => toggleModifier(mod)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </main>
  );
}

function StockRow({
  name,
  soldOut,
  busy,
  onToggle,
}: {
  name: string;
  soldOut: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      className={cn(
        'flex w-full cursor-pointer touch-manipulation items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all active:scale-[0.99]',
        busy && 'opacity-50',
        soldOut
          ? 'border-danger/40 bg-danger/5'
          : 'border-gray-100 bg-surface hover:border-gray-200',
      )}
    >
      <span
        className={cn(
          'font-body font-semibold',
          soldOut ? 'text-danger line-through' : 'text-text-dark',
        )}
      >
        {name}
      </span>

      <span
        className={cn(
          'shrink-0 rounded-full px-3 py-1.5 font-accent text-xs font-bold uppercase tracking-wide',
          soldOut ? 'bg-danger text-white' : 'bg-success/10 text-success',
        )}
      >
        {soldOut ? 'Sold Out — tap to restock' : 'Available'}
      </span>
    </button>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}
