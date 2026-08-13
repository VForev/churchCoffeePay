'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/Badge';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Switch from '@/components/ui/Switch';
import IOSSpinner from '@/components/ui/Spinner';
import { ListGroup } from '@/components/ui/List';
import { fadeUp, springLayout, springSheet, springSnappy, staggerParent } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { drinkTemperature, TEMP_LABEL, TEMP_EMOJI, type DrinkTemp } from '@/lib/temperature';
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

type Tab = 'orders' | 'stock' | 'history';
type ColumnKey = 'pending' | 'in_progress' | 'ready';
type ColumnColor = 'warning' | 'primary' | 'success';

const COLUMNS: { key: ColumnKey; title: string; color: ColumnColor }[] = [
  { key: 'pending', title: 'Pending', color: 'warning' },
  { key: 'in_progress', title: 'Making', color: 'primary' },
  { key: 'ready', title: 'Ready', color: 'success' },
];

const COLUMN_STYLES: Record<
  ColumnColor,
  { text: string; dot: string; activeBg: string; cardBg: string; cardRing: string; strip: string }
> = {
  warning: {
    text: 'text-warning',
    dot: 'bg-warning',
    activeBg: 'bg-warning',
    cardBg: 'bg-warning/5',
    cardRing: 'ring-2 ring-warning/40',
    strip: 'bg-warning',
  },
  primary: {
    text: 'text-primary',
    dot: 'bg-primary',
    activeBg: 'bg-primary',
    cardBg: 'bg-primary/5',
    cardRing: 'ring-2 ring-primary/40',
    strip: 'bg-primary',
  },
  success: {
    text: 'text-success',
    dot: 'bg-success',
    activeBg: 'bg-success',
    cardBg: 'bg-success/5',
    cardRing: 'ring-2 ring-success/40',
    strip: 'bg-success',
  },
};

/** Hot and cold read as opposites at a glance — warm vs cold, never subtle.
 *  Solid fills rather than tints: this is the one thing on the card that has to
 *  be legible from the other end of the bar. */
const TEMP_STYLES: Record<DrinkTemp, string> = {
  hot: 'bg-orange text-white',
  iced: 'bg-teal text-white',
};

/** The cups this order needs, in the order the barista should grab them. */
function cupSummary(order: FullOrder): { temp: DrinkTemp; count: number }[] {
  const counts: Record<DrinkTemp, number> = { hot: 0, iced: 0 };

  for (const item of order.order_items ?? []) {
    const temp = itemTemperature(item);
    if (temp) counts[temp] += item.quantity;
  }

  return (['hot', 'iced'] as DrinkTemp[])
    .filter((t) => counts[t] > 0)
    .map((temp) => ({ temp, count: counts[temp] }));
}

function itemTemperature(item: FullOrder['order_items'][number]): DrinkTemp | null {
  return drinkTemperature(
    item.menu_item?.name,
    (item.order_item_modifiers ?? []).map((m) => m.modifier?.name),
  );
}

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

  /**
   * Send an order to the printer by hand — the first print in manual mode, or a reprint
   * after a jam, a bad peel, or a dropped cup. Stamping label_print_requested_at is the
   * explicit "print now" signal the agent waits for; clearing label_printed_at lets it
   * print (and re-stamp) and flips the button back to "Reprint" once it's done.
   */
  async function reprintLabels(orderId: string) {
    const { error } = await supabase
      .from('orders')
      .update({ label_print_requested_at: new Date().toISOString(), label_printed_at: null })
      .eq('id', orderId);
    if (error) alert(`Could not send to the printer: ${error.message}`);
    fetchOrders();
  }

  /**
   * Quick-delete straight from the board — for a junk or offensive order that shouldn't
   * be on screen at all. Irreversible (order_items cascade), so it confirms first.
   */
  async function deleteOrder(order: FullOrder) {
    if (!confirm(`Delete ${order.customer_name}'s order? This can't be undone.`)) return;
    const { error } = await supabase.from('orders').delete().eq('id', order.id);
    if (error) {
      alert(
        error.code === '23503'
          ? 'Could not delete this order because other records still reference it. Run supabase-fix-delete-constraints.sql in the Supabase SQL editor, then try again.'
          : `Could not delete this order: ${error.message}`,
      );
      return;
    }
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
          color="warning"
          waitMinutes={calcWaitMinutes(orders, order)}
          onReprint={() => reprintLabels(order.id)}
          onDelete={() => deleteOrder(order)}
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
          color="primary"
          waitMinutes={calcWaitMinutes(orders, order)}
          onReprint={() => reprintLabels(order.id)}
          onDelete={() => deleteOrder(order)}
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
        color="success"
        waitMinutes={null}
        onReprint={() => reprintLabels(order.id)}
        onDelete={() => deleteOrder(order)}
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
      <div className="flex min-h-screen-safe items-center justify-center bg-bg">
        <IOSSpinner size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe bg-bg">
      {/* Frosted bar rather than a solid navy block: the board scrolls under it
          and the columns stay the only saturated things on screen, which is
          what lets status read at a glance. */}
      <header className="material-bar hairline-b sticky top-0 z-30 pt-safe">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3">
          <h1 className="text-ios-title2 text-label">Barista</h1>
          <div className="flex items-center gap-3">
            <span className="text-ios-footnote tnum text-label-secondary">
              {orders.length} order{orders.length !== 1 ? 's' : ''}
            </span>
            {totalItems > 0 && (
              <span className="text-ios-footnote tnum rounded-full bg-primary/12 px-3 py-1 font-semibold text-primary">
                {totalItems} drink{totalItems !== 1 ? 's' : ''} · ~{totalItems} min
              </span>
            )}
            <a
              href="/live"
              target="_blank"
              className="text-ios-footnote font-medium text-primary"
            >
              Live Screen ↗
            </a>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-2.5">
          <SegmentedControl
            segments={[
              { id: 'orders', label: 'Orders' },
              { id: 'stock', label: 'Sold Out / 86' },
              { id: 'history', label: 'History' },
            ]}
            activeId={tab}
            onSelect={(id) => setTab(id as Tab)}
          />
        </div>
      </header>

      {tab === 'stock' ? (
        <StockPanel />
      ) : tab === 'history' ? (
        <HistoryPanel />
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
              <div className="mb-4 grid grid-cols-3 gap-2 md:hidden">
                {COLUMNS.map((col) => {
                  const count = ordersByStatus[col.key].length;
                  const active = phoneColumn === col.key;
                  return (
                    <motion.button
                      key={col.key}
                      whileTap={{ scale: 0.95 }}
                      transition={springSnappy}
                      onClick={() => setPhoneColumn(col.key)}
                      className={cn(
                        'cursor-pointer touch-manipulation rounded-[var(--r-lg)] px-2 py-3',
                        'transition-colors duration-200 ease-[var(--ease-out-ios)]',
                        active
                          ? `${COLUMN_STYLES[col.color].activeBg} text-white shadow-sm`
                          : 'bg-surface text-label-secondary',
                      )}
                    >
                      <span className="tnum block text-[28px] font-bold leading-none">{count}</span>
                      <span className="mt-1 block text-[13px] font-semibold">{col.title}</span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="space-y-4 md:hidden">
                <AnimatePresence initial={false} mode="popLayout">
                  {ordersByStatus[phoneColumn].length === 0 ? (
                    <motion.p
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-ios-body py-12 text-center text-label-tertiary"
                    >
                      Nothing in {COLUMNS.find((c) => c.key === phoneColumn)!.title.toLowerCase()}
                    </motion.p>
                  ) : (
                    ordersByStatus[phoneColumn].map((order) => renderCard(order, phoneColumn))
                  )}
                </AnimatePresence>
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

      {/* Undo bar for an accidental "Picked Up" — an iOS toast that springs up
          from the bottom edge and drops back out, so it's noticed without
          stealing the tap that's already on its way to the next card. */}
      <AnimatePresence>
        {justCompleted && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={springSheet}
            className="fixed bottom-0 left-1/2 z-40 mb-4 flex -translate-x-1/2 items-center gap-4 rounded-full bg-label px-5 py-3 shadow-[var(--shadow-raised)]"
            style={{ marginBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <span className="text-ios-subhead text-plain">
              <strong className="font-semibold">{justCompleted.customer_name}</strong>&apos;s order
              picked up
            </span>
            <motion.button
              whileTap={{ scale: 0.94 }}
              transition={springSnappy}
              onClick={undoComplete}
              className="cursor-pointer touch-manipulation rounded-full bg-plain px-4 py-1.5 text-[15px] font-semibold text-label"
            >
              Undo
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
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
      <h2 className={cn('text-ios-headline mb-3 flex items-center gap-2', style.text)}>
        <span className="relative flex h-2.5 w-2.5">
          {pulse && (
            <motion.span
              animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
              className={cn('absolute inline-flex h-full w-full rounded-full', style.dot)}
            />
          )}
          <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', style.dot)} />
        </span>
        {title} <span className="tnum text-label-tertiary">({count})</span>
      </h2>
      {/* popLayout so a card leaving for the next column doesn't hold its slot
          open while the ones below it slide up. */}
      <motion.div layout className="space-y-4">
        <AnimatePresence initial={false} mode="popLayout">
          {children}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function OrderCard({
  order,
  actions,
  color,
  waitMinutes,
  onBack,
  backLabel,
  onReprint,
  onDelete,
}: {
  order: FullOrder;
  actions: React.ReactNode;
  /** Matches the column the card sits in, so status is readable from across the bar. */
  color: ColumnColor;
  waitMinutes: number | null;
  onBack?: () => void;
  backLabel?: string;
  onReprint?: () => void;
  /** Quick-remove a junk/offensive order from the board entirely. */
  onDelete?: () => void;
}) {
  const timeAgo = getTimeAgo(order.created_at);
  const itemCount = orderItemCount(order);
  const style = COLUMN_STYLES[color];
  const cups = cupSummary(order);

  // A plain div, not <Card> — the card carries its own padding and surface color,
  // and this one needs a full-bleed status strip and a status-tinted background.
  return (
    <motion.div
      layout
      // Shared across columns: advancing an order animates the card itself from
      // Pending into Making rather than deleting one card and inserting another.
      // On a board being watched from a few feet away, that movement is the
      // confirmation the tap registered.
      layoutId={order.id}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={springLayout}
      className={cn(
        'relative overflow-hidden rounded-[var(--r-lg)] shadow-sm',
        style.cardBg,
        style.cardRing,
      )}
    >
      <div className={cn('h-2 w-full', style.strip)} />

      {/* Corner delete — for a junk or offensive order you just want gone */}
      {onDelete && (
        <motion.button
          whileTap={{ scale: 0.85 }}
          transition={springSnappy}
          onClick={onDelete}
          title="Delete this order"
          aria-label="Delete this order"
          className="absolute right-2 top-3.5 z-10 flex h-7 w-7 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-fill text-label-secondary shadow-sm"
        >
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </motion.button>
      )}

      <div className="p-4">
        {/* Cups first — it's the first thing your hands do */}
        {cups.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {cups.map(({ temp, count }) => (
              <span
                key={temp}
                className={cn(
                  'flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[17px] font-bold uppercase tracking-wide',
                  TEMP_STYLES[temp],
                )}
              >
                <span aria-hidden>{TEMP_EMOJI[temp]}</span>
                <span className="tnum">{count}</span> × {TEMP_LABEL[temp]}
              </span>
            ))}
          </div>
        )}

        {/* Who it's for — the thing the barista shouts */}
        <div className={cn('mb-3 flex items-start justify-between gap-2', onDelete && 'pr-8')}>
          <div className="min-w-0">
            <h3 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-label">
              {order.customer_name}
            </h3>
            <p className="text-ios-subhead mt-0.5 font-medium text-label-secondary">
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
          {order.order_items?.map((item) => {
            const temp = itemTemperature(item);

            return (
              <div key={item.id} className="rounded-[var(--r-md)] bg-surface p-3 shadow-sm">
                {temp && (
                  <span
                    className={cn(
                      'mb-2 inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider',
                      TEMP_STYLES[temp],
                    )}
                  >
                    <span aria-hidden>{TEMP_EMOJI[temp]}</span>
                    {TEMP_LABEL[temp]}
                  </span>
                )}

                <div className="flex items-start gap-2.5">
                  <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-label text-[17px] font-bold text-plain">
                    {item.quantity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ios-title3 leading-snug text-label">
                      {item.menu_item?.name}
                    </p>

                    {item.order_item_modifiers?.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {item.order_item_modifiers.map((m) => (
                          <li
                            key={m.id}
                            className="flex items-center gap-1.5 text-[16px] font-semibold text-label"
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
                  <div className="mt-2 rounded-[var(--r-sm)] border-l-4 border-warm bg-warm/15 px-3 py-2">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-warm">Note</p>
                    <p className="text-[16px] font-semibold text-label">
                      {item.special_instructions}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions — big enough to hit with a wet hand */}
        <div className="space-y-2">
          {actions}
          <div className="flex gap-2">
            {onBack && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                onClick={onBack}
                className="flex-1 cursor-pointer touch-manipulation rounded-full bg-fill-tertiary py-2.5 text-[15px] font-semibold text-label"
              >
                ← {backLabel}
              </motion.button>
            )}
            {onReprint && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                onClick={onReprint}
                title={
                  order.label_printed_at
                    ? 'Print the cup labels again'
                    : 'Labels have not printed yet — is the shop PC on?'
                }
                className={cn(
                  'cursor-pointer touch-manipulation rounded-full py-2.5 text-[15px] font-semibold',
                  onBack ? 'shrink-0 px-4' : 'w-full',
                  order.label_printed_at
                    ? 'bg-fill-tertiary text-label'
                    : 'bg-warning/15 text-warning',
                )}
              >
                🖨 {order.label_printed_at ? 'Reprint' : 'Print labels'}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
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
        <IOSSpinner size={28} />
      </div>
    );
  }

  return (
    <motion.main
      variants={staggerParent}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-4xl space-y-6 p-4 pb-safe-4"
    >
      <motion.div
        variants={fadeUp}
        className="rounded-[var(--r-lg)] bg-primary/10 px-4 py-3.5"
      >
        <p className="text-ios-subhead text-label">
          Flip the switch on anything you&apos;ve run out of. Customers see it as{' '}
          <strong className="font-semibold text-danger">Sold Out</strong> immediately — no refresh
          needed.
        </p>
        <AnimatePresence>
          {soldOutCount > 0 && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={springSnappy}
              className="text-ios-footnote overflow-hidden font-semibold text-danger"
            >
              <span className="mt-1 block">
                {soldOutCount} item{soldOutCount !== 1 ? 's' : ''} currently sold out
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Drinks by category */}
      <h2 className="text-ios-title2 px-1 text-label">Drinks</h2>
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.category_id === cat.id);
        if (catItems.length === 0) return null;

        return (
          <motion.div variants={fadeUp} key={cat.id}>
            <ListGroup header={cat.name}>
              {catItems.map((item) => (
                <StockRow
                  key={item.id}
                  name={item.name}
                  soldOut={item.is_sold_out}
                  busy={saving === item.id}
                  onToggle={() => toggleItem(item)}
                />
              ))}
            </ListGroup>
          </motion.div>
        );
      })}

      {/* Add-ins by modifier group */}
      <h2 className="text-ios-title2 px-1 pt-2 text-label">Add-ins &amp; Options</h2>
      {groups.map((group) => {
        const groupMods = modifiers.filter((m) => m.group_id === group.id);
        if (groupMods.length === 0) return null;

        return (
          <motion.div variants={fadeUp} key={group.id}>
            <ListGroup header={group.name}>
              {groupMods.map((mod) => (
                <StockRow
                  key={mod.id}
                  name={mod.name}
                  soldOut={mod.is_sold_out}
                  busy={saving === mod.id}
                  onToggle={() => toggleModifier(mod)}
                />
              ))}
            </ListGroup>
          </motion.div>
        );
      })}
    </motion.main>
  );
}

/**
 * A settings-style row with a real toggle.
 *
 * The switch reads ON for "available" rather than ON for "sold out": a barista
 * scanning the list is looking for what they can still make, and a wall of
 * switches that are all off during normal service would read as broken.
 */
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
    <div
      className={cn(
        'relative flex min-h-[52px] items-center justify-between gap-3 px-4 py-2.5',
        'before:absolute before:bottom-0 before:left-4 before:right-0 before:h-px before:bg-separator last:before:hidden',
        busy && 'opacity-50',
      )}
    >
      <div className="min-w-0">
        <span
          className={cn(
            'text-ios-body block truncate',
            soldOut ? 'text-label-tertiary line-through' : 'text-label',
          )}
        >
          {name}
        </span>
        <AnimatePresence initial={false}>
          {soldOut && (
            <motion.span
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={springSnappy}
              className="text-ios-caption block overflow-hidden font-semibold text-danger"
            >
              Sold out
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <Switch checked={!soldOut} disabled={busy} onChange={onToggle} label={name} />
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────
// Finished orders, for looking one up after the fact or reprinting a lost label.
// Kept separate from the live board query so the kanban stays lean and realtime.

const HISTORY_SELECT = `
  *,
  order_items (
    *,
    menu_item:menu_items (name),
    order_item_modifiers (
      *,
      modifier:modifiers (*)
    )
  )
`;

function formatOrderTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function HistoryPanel() {
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = useCallback(async (search: string) => {
    setLoading(true);
    let q = supabase
      .from('orders')
      .select(HISTORY_SELECT)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(200);

    if (search.trim()) q = q.ilike('customer_name', `%${search.trim()}%`);

    const { data } = await q;
    setOrders((data as unknown as FullOrder[]) ?? []);
    setLoading(false);
  }, []);

  // Debounce so we're not firing a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => fetchHistory(query), 250);
    return () => clearTimeout(t);
  }, [query, fetchHistory]);

  async function reprint(orderId: string) {
    const { error } = await supabase
      .from('orders')
      .update({ label_print_requested_at: new Date().toISOString(), label_printed_at: null })
      .eq('id', orderId);
    if (error) alert(`Could not send to the printer: ${error.message}`);
    else fetchHistory(query);
  }

  return (
    <main className="mx-auto max-w-3xl p-4 pb-safe-4">
      <div className="mb-4">
        <div className="relative">
          <svg
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-label-tertiary"
            fill="none"
          >
            <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search past orders by name"
            className="w-full rounded-[var(--r-md)] bg-fill-tertiary py-3 pl-10 pr-4 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none focus:ring-[3px] focus:ring-primary/20"
          />
        </div>
        <p className="text-ios-footnote mt-2 px-1 text-label-secondary">
          Completed and cancelled orders — newest first. Tap one to see the drinks or reprint its
          labels.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <IOSSpinner size={28} />
        </div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-2 text-5xl">🗂️</p>
          <p className="text-ios-body text-label-secondary">
            {query.trim() ? `No past orders for “${query.trim()}”` : 'No completed orders yet'}
          </p>
        </div>
      ) : (
        <motion.div layout className="space-y-2">
          {orders.map((order) => {
            const expanded = expandedId === order.id;
            const itemCount = orderItemCount(order);
            return (
              <motion.div
                layout
                key={order.id}
                transition={springLayout}
                className="overflow-hidden rounded-[var(--r-lg)] bg-surface shadow-sm"
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : order.id)}
                  className="hover-row flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left active:bg-fill-tertiary"
                >
                  <div className="min-w-0">
                    <h3 className="text-ios-headline truncate text-label">
                      {order.customer_name}
                    </h3>
                    <p className="text-ios-footnote tnum mt-0.5 text-label-secondary">
                      {formatOrderTime(order.created_at)} · {itemCount} item
                      {itemCount !== 1 ? 's' : ''} · ${order.total.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <OrderStatusBadge status={order.status} />
                    {/* The chevron rotates rather than swapping ▲ for ▼ — the
                        rotation is what ties the arrow to the panel opening. */}
                    <motion.svg
                      animate={{ rotate: expanded ? 90 : 0 }}
                      transition={springSnappy}
                      viewBox="0 0 12 20"
                      className="h-[13px] w-[8px] text-label-tertiary"
                      fill="none"
                    >
                      <path
                        d="M2 2l8 8-8 8"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </motion.svg>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={springSnappy}
                      className="hairline-t overflow-hidden"
                    >
                      <div className="p-4">
                        <div className="mb-3 space-y-2">
                          {order.order_items?.map((item) => (
                            <div key={item.id} className="rounded-[var(--r-md)] bg-bg p-3">
                              <div className="flex items-start gap-2.5">
                                <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-label text-[15px] font-bold text-plain">
                                  {item.quantity}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-ios-callout font-semibold text-label">
                                    {item.menu_item?.name}
                                  </p>
                                  {item.order_item_modifiers?.length > 0 && (
                                    <ul className="mt-1 space-y-0.5">
                                      {item.order_item_modifiers.map((m) => (
                                        <li
                                          key={m.id}
                                          className="text-ios-subhead flex items-center gap-1.5 text-label-secondary"
                                        >
                                          <span className="text-primary">•</span>
                                          {m.modifier?.name}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {item.special_instructions && (
                                    <p className="text-ios-subhead mt-1 italic text-warm">
                                      Note: {item.special_instructions}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <PaymentBadge status={order.payment_status} />
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={springSnappy}
                            onClick={() => reprint(order.id)}
                            className="cursor-pointer touch-manipulation rounded-full bg-fill-tertiary px-4 py-2 text-[15px] font-semibold text-label"
                          >
                            🖨 Reprint labels
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </main>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}
