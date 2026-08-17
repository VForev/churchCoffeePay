'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { drinkTemperature, TEMP_LABEL, TEMP_EMOJI, type DrinkTemp } from '@/lib/temperature';
import {
  ISSUE_REASONS,
  hasIssue,
  issueSaveError,
  formatIssueTime,
} from '@/lib/order-issues';
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

/** Hot and cold read as opposites at a glance — red-warm vs blue-cold, never subtle. */
const TEMP_STYLES: Record<DrinkTemp, string> = {
  hot: 'bg-warm text-white',
  iced: 'bg-secondary text-text-dark',
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

/**
 * Everything a search box should be able to find an order by: the name the barista
 * shouts, but also the drink ("who ordered the cold brew?"), an add-in, or a note.
 */
function orderHaystack(order: FullOrder): string {
  const parts: string[] = [order.customer_name ?? ''];
  for (const item of order.order_items ?? []) {
    parts.push(item.menu_item?.name ?? '', item.special_instructions ?? '');
    for (const m of item.order_item_modifiers ?? []) parts.push(m.modifier?.name ?? '');
  }
  return parts.join(' ').toLowerCase();
}

/** Every word has to appear somewhere — "iced sarah" finds Sarah's iced drink. */
function orderMatches(order: FullOrder, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = orderHaystack(order);
  return terms.every((t) => hay.includes(t));
}

/** The statuses the live board holds, used to drop an order the moment it's completed. */
const LIVE_STATUSES: OrderStatus[] = ['pending', 'in_progress', 'ready'];

/** Column names as a barista says them, for the "another screen moved it" message. */
const STATUS_WORDS: Record<OrderStatus, string> = {
  pending: 'Pending',
  in_progress: 'Making',
  ready: 'Ready',
  completed: 'Picked up',
  cancelled: 'Cancelled',
};

export default function BaristaPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [phoneColumn, setPhoneColumn] = useState<ColumnKey>('pending');
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  /** Live-feed health, so a stale board is never mistaken for a quiet morning. */
  const [connected, setConnected] = useState(false);
  /** Another screen got to this order first — say so instead of silently fighting it. */
  const [conflict, setConflict] = useState<string | null>(null);
  /** The order whose issue is being written up, if any. */
  const [issueFor, setIssueFor] = useState<FullOrder | null>(null);
  /** Lets a barista undo a "Picked Up" tap that closed the wrong order. */
  const [justCompleted, setJustCompleted] = useState<FullOrder | null>(null);
  const prevCountRef = useRef(0);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against a slow early query landing on top of a newer one. */
  const fetchSeqRef = useRef(0);

  const fetchOrders = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const { data, error } = await supabase
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
      .in('status', LIVE_STATUSES)
      .order('created_at', { ascending: true });

    // With several screens firing refetches at once, responses can come back out of
    // order. Anything but the newest request is stale by definition — drop it.
    if (seq !== fetchSeqRef.current) return;

    if (data && !error) {
      setOrders(data as unknown as FullOrder[]);
      if (data.length > prevCountRef.current && prevCountRef.current > 0) {
        playNotification();
      }
      prevCountRef.current = data.length;
    }
    setLoading(false);
  }, []);

  /**
   * One order arriving is several realtime events in the same instant — the order row,
   * then a row per drink, then a row per add-in. Coalesce them into a single refetch so
   * a busy Sunday doesn't have every screen running a dozen queries a second.
   */
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      fetchOrders();
    }, 120);
  }, [fetchOrders]);

  function showConflict(message: string) {
    setConflict(message);
    if (conflictTimerRef.current) clearTimeout(conflictTimerRef.current);
    conflictTimerRef.current = setTimeout(() => setConflict(null), 6000);
  }

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

    // Every table an order is spread across, so a screen that loaded the order row a
    // split second before its drinks existed fills itself in without anyone refreshing.
    const channel = supabase
      .channel('barista-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, scheduleRefetch)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_item_modifiers' },
        scheduleRefetch,
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    // A tablet that slept, lost church wifi, or was backgrounded comes back with a
    // websocket that looks connected and isn't. Refetch the moment it's looked at again.
    function refetchIfVisible() {
      if (document.visibilityState === 'visible') fetchOrders();
    }
    document.addEventListener('visibilitychange', refetchIfVisible);
    window.addEventListener('focus', refetchIfVisible);
    window.addEventListener('online', fetchOrders);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', refetchIfVisible);
      window.removeEventListener('focus', refetchIfVisible);
      window.removeEventListener('online', fetchOrders);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (conflictTimerRef.current) clearTimeout(conflictTimerRef.current);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, [fetchOrders, scheduleRefetch]);

  /**
   * The websocket is the fast path, not the only path. Poll underneath it so a screen
   * whose subscription quietly died still catches up — quickly while disconnected,
   * gently once the feed is healthy.
   */
  useEffect(() => {
    const id = setInterval(fetchOrders, connected ? 15000 : 4000);
    return () => clearInterval(id);
  }, [connected, fetchOrders]);

  /**
   * Move an order along. Two things matter with several screens on the same board:
   *
   *  - the card moves *here* immediately, before the round trip, so a tap never feels lost
   *  - the write only lands if the order is still where this screen thought it was, so
   *    two baristas tapping the same card don't drag it backwards past each other
   */
  async function updateStatus(order: FullOrder, newStatus: OrderStatus, expected?: OrderStatus) {
    const from = expected ?? order.status;

    setOrders((prev) =>
      prev
        .map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
        .filter((o) => LIVE_STATUSES.includes(o.status)),
    );

    const { data, error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', order.id)
      .eq('status', from)
      .select('id');

    if (error) {
      showConflict(`Could not update ${order.customer_name}'s order: ${error.message}`);
    } else if (!data || data.length === 0) {
      // No row matched. Either another screen moved it, or this one was tapped twice —
      // check where it actually ended up before crying conflict at an impatient barista.
      const { data: current } = await supabase
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      if (current && current.status !== newStatus) {
        showConflict(
          `${order.customer_name}'s order was already moved on another screen — it's in ${
            STATUS_WORDS[current.status as OrderStatus] ?? current.status
          } now.`,
        );
      }
    }
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
    setJustCompleted(order);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setJustCompleted(null), 12000);
    await updateStatus(order, 'completed', 'ready');
  }

  async function undoComplete() {
    if (!justCompleted) return;
    const order = justCompleted;
    setJustCompleted(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // The card is off the board, so 'completed' is what the row actually says now.
    await updateStatus(order, 'ready', 'completed');
  }

  /**
   * Mark an order as having gone wrong. The flag outlives the order on the board — the
   * whole point is being able to pull up every problem order after service, in History
   * or at /admin/orders, instead of trying to remember them.
   */
  async function saveIssue(order: FullOrder, note: string) {
    const { error } = await supabase
      .from('orders')
      .update({ issue_flagged_at: new Date().toISOString(), issue_note: note.trim() || null })
      .eq('id', order.id);
    if (error) {
      alert(issueSaveError(error));
      return;
    }
    setIssueFor(null);
    fetchOrders();
  }

  /** Flagged the wrong card, or the problem turned out to be nothing. */
  async function clearIssue(order: FullOrder) {
    const { error } = await supabase
      .from('orders')
      .update({ issue_flagged_at: null, issue_note: null })
      .eq('id', order.id);
    if (error) {
      alert(issueSaveError(error));
      return;
    }
    fetchOrders();
  }

  // Search narrows what's on screen only. Wait times stay calculated against the whole
  // queue below — a filtered board must never quote a shorter wait than the real one.
  const searching = search.trim().length > 0;
  const matching = searching ? orders.filter((o) => orderMatches(o, search)) : orders;

  const ordersByStatus: Record<ColumnKey, FullOrder[]> = {
    pending: matching.filter((o) => o.status === 'pending'),
    in_progress: matching.filter((o) => o.status === 'in_progress'),
    ready: matching.filter((o) => o.status === 'ready'),
  };

  const totalItems = orders
    .filter((o) => o.status === 'pending' || o.status === 'in_progress')
    .reduce((s, o) => s + orderItemCount(o), 0);

  const issueCount = orders.filter(hasIssue).length;

  /** One card definition per column, so phone and kanban layouts never drift apart. */
  function renderCard(order: FullOrder, column: ColumnKey) {
    const shared = {
      key: order.id,
      order,
      onReprint: () => reprintLabels(order.id),
      onDelete: () => deleteOrder(order),
      onFlagIssue: () => setIssueFor(order),
      onClearIssue: () => clearIssue(order),
    };

    if (column === 'pending') {
      return (
        <OrderCard
          {...shared}
          color="warning"
          waitMinutes={calcWaitMinutes(orders, order)}
          actions={
            <Button size="lg" fullWidth onClick={() => updateStatus(order, 'in_progress')}>
              Start Making
            </Button>
          }
        />
      );
    }

    if (column === 'in_progress') {
      return (
        <OrderCard
          {...shared}
          color="primary"
          waitMinutes={calcWaitMinutes(orders, order)}
          onBack={() => updateStatus(order, PREVIOUS_STATUS.in_progress!)}
          backLabel="Back to Pending"
          actions={
            <Button size="lg" fullWidth variant="success" onClick={() => updateStatus(order, 'ready')}>
              Mark Ready
            </Button>
          }
        />
      );
    }

    return (
      <OrderCard
        {...shared}
        color="success"
        waitMinutes={null}
        onBack={() => updateStatus(order, PREVIOUS_STATUS.ready!)}
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
            {/* Several screens run this board at once — say plainly whether this one is
                still hearing about new orders, so a dead feed looks different to a lull. */}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-accent text-xs font-semibold',
                connected ? 'bg-white/15' : 'bg-danger',
              )}
              title={
                connected
                  ? 'Updating instantly from every till and phone'
                  : 'Reconnecting — the board is refreshing every few seconds until it is back'
              }
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  connected ? 'animate-pulse bg-success-light' : 'bg-white',
                )}
              />
              {connected ? 'Live' : 'Reconnecting…'}
            </span>
            <span className="opacity-75">
              {orders.length} order{orders.length !== 1 ? 's' : ''}
            </span>
            {totalItems > 0 && (
              <span className="rounded-full bg-white/20 px-3 py-1 font-accent">
                {totalItems} drink{totalItems !== 1 ? 's' : ''} · ~{totalItems} min queue
              </span>
            )}
            {issueCount > 0 && (
              <span className="rounded-full bg-danger px-3 py-1 font-accent font-bold">
                ⚠ {issueCount} flagged
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
              ['history', 'History'],
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
              {/* Find one order in a rush — a name being asked about at the counter, or
                  "who had the oat latte?". Searches drinks and notes, not just names. */}
              <div className="mb-4 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-light">
                    🔍
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    type="search"
                    inputMode="search"
                    placeholder="Search name, drink or note…"
                    aria-label="Search the orders on the board"
                    className="w-full rounded-2xl border border-gray-200 bg-surface py-3 pl-11 pr-4 font-body text-text-dark shadow-sm focus:border-primary focus:outline-none"
                  />
                </div>
                {searching && (
                  <button
                    onClick={() => setSearch('')}
                    className="shrink-0 cursor-pointer touch-manipulation rounded-2xl border border-gray-200 bg-surface px-4 py-3 font-accent text-sm font-bold text-text transition-colors hover:bg-gray-50"
                  >
                    Clear
                  </button>
                )}
              </div>

              {searching && (
                <p className="mb-3 px-1 font-accent text-sm font-semibold text-text-light">
                  {matching.length === 0
                    ? `Nothing on the board matches “${search.trim()}”`
                    : `Showing ${matching.length} of ${orders.length} order${
                        orders.length !== 1 ? 's' : ''
                      } · wait times still count the whole queue`}
                </p>
              )}

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
                    {searching ? 'No match in ' : 'Nothing in '}
                    {COLUMNS.find((c) => c.key === phoneColumn)!.title.toLowerCase()}
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

      {/* Two screens, one order — tell whoever lost the race what happened */}
      {conflict && (
        <div className="fixed bottom-20 left-1/2 z-40 w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl bg-warning px-5 py-3 text-white shadow-xl">
          <p className="font-body text-sm font-semibold">{conflict}</p>
        </div>
      )}

      {/* Write up what went wrong */}
      <IssueModal
        key={issueFor?.id ?? 'none'}
        order={issueFor}
        onClose={() => setIssueFor(null)}
        onSave={async (note) => {
          if (issueFor) await saveIssue(issueFor, note);
        }}
      />

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
  color,
  waitMinutes,
  onBack,
  backLabel,
  onReprint,
  onDelete,
  onFlagIssue,
  onClearIssue,
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
  /** Mark something as having gone wrong with this order. */
  onFlagIssue?: () => void;
  onClearIssue?: () => void;
}) {
  const timeAgo = getTimeAgo(order.created_at);
  const itemCount = orderItemCount(order);
  const style = COLUMN_STYLES[color];
  const cups = cupSummary(order);
  const flagged = hasIssue(order);

  // One definition, two homes: the card corner normally, the issue banner when flagged.
  const deleteButton = onDelete ? (
    <button
      onClick={onDelete}
      title="Delete this order"
      aria-label="Delete this order"
      className="flex h-7 w-7 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-white/70 text-lg font-bold leading-none text-text-light shadow-sm transition-colors hover:bg-danger hover:text-white"
    >
      ×
    </button>
  ) : null;

  // A plain div, not <Card> — the card carries its own padding and surface color,
  // and this one needs a full-bleed status strip and a status-tinted background.
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-gray-100 shadow-sm',
        style.cardBg,
        // A flagged order outranks its column color: red ring, so the one card with a
        // problem is the one you spot first on a full board.
        flagged ? 'ring-2 ring-danger' : style.cardRing,
      )}
    >
      <div className={cn('h-2 w-full', flagged ? 'bg-danger' : style.strip)} />

      {/* Delete — for a junk or offensive order you just want gone. On a flagged card it
          moves into the banner row beside "Clear", because the corner it normally sits in
          is where the banner's own button lives, and one would sit on top of the other. */}
      {onDelete && !flagged && (
        <div className="absolute right-2 top-3.5 z-10">{deleteButton}</div>
      )}

      {flagged && (
        <div className="flex items-start justify-between gap-3 bg-danger/10 px-4 py-2.5">
          <div className="min-w-0">
            <p className="font-accent text-xs font-extrabold uppercase tracking-wider text-danger">
              ⚠ Issue flagged
              {order.issue_flagged_at ? ` · ${formatIssueTime(order.issue_flagged_at)}` : ''}
            </p>
            {order.issue_note && (
              <p className="mt-0.5 font-body text-sm font-bold text-text-dark">
                {order.issue_note}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onClearIssue && (
              <button
                onClick={onClearIssue}
                className="cursor-pointer touch-manipulation rounded-full border border-danger/40 px-3 py-1.5 font-accent text-xs font-bold text-danger transition-colors hover:bg-danger hover:text-white"
              >
                Clear issue
              </button>
            )}
            {deleteButton}
          </div>
        </div>
      )}

      <div className="p-4">
        {/* Cups first — it's the first thing your hands do, and it has to be readable
            from the other end of the bar without leaning in. */}
        {cups.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {cups.map(({ temp, count }) => (
              <span
                key={temp}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2.5 font-accent text-2xl font-extrabold uppercase leading-none tracking-wide',
                  TEMP_STYLES[temp],
                )}
              >
                <span aria-hidden className="text-3xl leading-none">
                  {TEMP_EMOJI[temp]}
                </span>
                {count} × {TEMP_LABEL[temp]}
              </span>
            ))}
          </div>
        )}

        {/* Who it's for — the thing the barista shouts */}
        {/* Only leave room for the corner × when it's actually in the corner */}
        <div
          className={cn('mb-3 flex items-start justify-between gap-2', onDelete && !flagged && 'pr-8')}
        >
          <div className="min-w-0">
            <h3 className="font-heading text-2xl font-extrabold leading-tight text-text-dark">
              {order.customer_name}
            </h3>
            <p className="mt-0.5 font-accent text-sm font-semibold text-text">
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
              <div key={item.id} className="rounded-xl bg-surface p-3 shadow-sm">
                {temp && (
                  <span
                    className={cn(
                      'mb-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-accent text-lg font-extrabold uppercase leading-none tracking-wider',
                      TEMP_STYLES[temp],
                    )}
                  >
                    <span aria-hidden className="text-xl leading-none">
                      {TEMP_EMOJI[temp]}
                    </span>
                    {TEMP_LABEL[temp]}
                  </span>
                )}

                <div className="flex items-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-text-dark font-accent text-base font-extrabold text-white">
                    {item.quantity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-xl font-extrabold leading-snug text-text-dark">
                      {item.menu_item?.name}
                    </p>

                    {item.order_item_modifiers?.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {item.order_item_modifiers.map((m) => (
                          <li
                            key={m.id}
                            className="flex items-center gap-1.5 font-body text-base font-bold text-text-dark"
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
                  <div className="mt-2 rounded-lg border-l-4 border-warm bg-warm/15 px-3 py-2">
                    <p className="font-accent text-xs font-extrabold uppercase tracking-wide text-warm">
                      Note
                    </p>
                    <p className="font-body text-base font-bold text-text-dark">
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
              <button
                onClick={onBack}
                className="flex-1 cursor-pointer touch-manipulation rounded-full border border-gray-300 bg-surface py-2.5 font-accent text-sm font-bold text-text transition-colors hover:bg-gray-50"
              >
                ← {backLabel}
              </button>
            )}
            {onReprint && (
              <button
                onClick={onReprint}
                title={
                  order.label_printed_at
                    ? 'Print the cup labels again'
                    : 'Labels have not printed yet — is the shop PC on?'
                }
                className={cn(
                  'cursor-pointer touch-manipulation rounded-full border py-2.5 font-accent text-sm font-bold transition-colors hover:bg-gray-50',
                  onBack ? 'shrink-0 px-4' : 'w-full',
                  order.label_printed_at
                    ? 'border-gray-300 bg-surface text-text'
                    : 'border-warning bg-warning/10 text-warning',
                )}
              >
                🖨 {order.label_printed_at ? 'Reprint' : 'Print labels'}
              </button>
            )}
          </div>
          {onFlagIssue && (
            <button
              onClick={onFlagIssue}
              className={cn(
                'w-full cursor-pointer touch-manipulation rounded-full border py-2.5 font-accent text-sm font-bold transition-colors',
                flagged
                  ? 'border-danger bg-danger/10 text-danger hover:bg-danger/20'
                  : 'border-gray-300 bg-surface text-text-light hover:border-danger/40 hover:text-danger',
              )}
            >
              ⚠ {flagged ? 'Edit issue note' : 'Flag an issue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Flag an issue ────────────────────────────────────────────────────────────
// Deliberately two taps at most: a reason chip, then Save. Anything longer and it
// won't get used mid-rush, which makes the whole record worthless.

function IssueModal({
  order,
  onClose,
  onSave,
}: {
  order: FullOrder | null;
  onClose: () => void;
  onSave: (note: string) => Promise<void> | void;
}) {
  // Keyed on the order id by its parent, so opening a different card remounts this and
  // starts from that order's own note — editing never carries one problem onto the next.
  const [note, setNote] = useState(order?.issue_note ?? '');
  const [saving, setSaving] = useState(false);

  if (!order) return null;

  function addReason(reason: string) {
    setNote((prev) => {
      const current = prev.trim();
      if (!current) return reason;
      if (current.toLowerCase().includes(reason.toLowerCase())) return current;
      return `${current}, ${reason}`;
    });
  }

  async function save() {
    setSaving(true);
    await onSave(note);
    setSaving(false);
  }

  return (
    <Modal isOpen onClose={onClose} title="What went wrong?" size="md">
      <p className="mb-4 font-body text-sm text-text-light">
        Flagging <strong className="font-heading text-text-dark">{order.customer_name}</strong>
        &apos;s order. It stays on the order for good, so you can find every problem order
        afterwards in History or on the admin Order History page.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {ISSUE_REASONS.map((reason) => (
          <button
            key={reason}
            onClick={() => addReason(reason)}
            className="cursor-pointer touch-manipulation rounded-full border border-gray-200 bg-surface px-3.5 py-2 font-accent text-sm font-semibold text-text transition-colors hover:border-danger/40 hover:text-danger"
          >
            {reason}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Anything else worth knowing later…"
        className="w-full rounded-xl border border-gray-200 bg-surface px-4 py-3 font-body text-text-dark focus:border-primary focus:outline-none"
      />

      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1 border border-gray-200" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" className="flex-1" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : '⚠ Flag this order'}
        </Button>
      </div>
    </Modal>
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

  // Whoever runs out of oat milk flips it on whichever screen is nearest. Everyone
  // else's 86 list has to agree straight away, or two baristas will fight over it.
  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('barista-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modifiers' }, fetchAll)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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
  /** "Show me everything that went wrong today" — the whole reason the flag exists. */
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = useCallback(async (search: string, onlyIssues: boolean) => {
    setLoading(true);
    let q = supabase
      .from('orders')
      .select(HISTORY_SELECT)
      .order('created_at', { ascending: false })
      .limit(200);

    // Flagged orders are worth seeing wherever they are — an order still on the board
    // can already have a problem on it, and that's exactly the one you're looking for.
    if (onlyIssues) q = q.not('issue_flagged_at', 'is', null);
    else q = q.in('status', ['completed', 'cancelled']);

    if (search.trim()) q = q.ilike('customer_name', `%${search.trim()}%`);

    const { data, error } = await q;
    if (error && onlyIssues) {
      // Column isn't there yet — say which migration adds it rather than showing nothing.
      alert(issueSaveError(error));
      setIssuesOnly(false);
    }
    setOrders((data as unknown as FullOrder[]) ?? []);
    setLoading(false);
  }, []);

  // Debounce so we're not firing a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => fetchHistory(query, issuesOnly), 250);
    return () => clearTimeout(t);
  }, [query, issuesOnly, fetchHistory]);

  async function unflag(orderId: string) {
    const { error } = await supabase
      .from('orders')
      .update({ issue_flagged_at: null, issue_note: null })
      .eq('id', orderId);
    if (error) alert(issueSaveError(error));
    else fetchHistory(query, issuesOnly);
  }

  async function reprint(orderId: string) {
    const { error } = await supabase
      .from('orders')
      .update({ label_print_requested_at: new Date().toISOString(), label_printed_at: null })
      .eq('id', orderId);
    if (error) alert(`Could not send to the printer: ${error.message}`);
    else fetchHistory(query, issuesOnly);
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search past orders by name…"
          className="w-full rounded-2xl border border-gray-200 bg-surface px-5 py-3 font-body text-text-dark shadow-sm focus:border-primary focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIssuesOnly(!issuesOnly)}
            className={cn(
              'cursor-pointer touch-manipulation rounded-full border px-4 py-2 font-accent text-sm font-bold transition-colors',
              issuesOnly
                ? 'border-danger bg-danger text-white'
                : 'border-gray-200 bg-surface text-text-light hover:border-danger/40 hover:text-danger',
            )}
          >
            ⚠ Issues only
          </button>
          <p className="font-body text-xs text-text-light">
            {issuesOnly
              ? 'Every order flagged with a problem, including ones still on the board.'
              : 'Completed and cancelled orders — newest first. Tap one to see the drinks or reprint its labels.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-2 text-5xl">{issuesOnly ? '✅' : '🗂️'}</p>
          <p className="font-body text-text-light">
            {query.trim()
              ? `No ${issuesOnly ? 'flagged' : 'past'} orders for “${query.trim()}”`
              : issuesOnly
                ? 'No orders have been flagged with an issue'
                : 'No completed orders yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const expanded = expandedId === order.id;
            const itemCount = orderItemCount(order);
            return (
              <div
                key={order.id}
                className={cn(
                  'overflow-hidden rounded-2xl border bg-surface shadow-sm',
                  hasIssue(order) ? 'border-danger/40 ring-1 ring-danger/30' : 'border-gray-100',
                )}
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : order.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 truncate font-heading text-lg font-bold text-text-dark">
                      {order.customer_name}
                      {hasIssue(order) && (
                        <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 font-accent text-xs font-bold uppercase text-white">
                          ⚠ Issue
                        </span>
                      )}
                    </h3>
                    <p className="mt-0.5 font-accent text-xs text-text-light">
                      {formatOrderTime(order.created_at)} · {itemCount} item
                      {itemCount !== 1 ? 's' : ''} · ${order.total.toFixed(2)}
                    </p>
                    {hasIssue(order) && order.issue_note && (
                      <p className="mt-1 font-body text-sm font-semibold text-danger">
                        {order.issue_note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <OrderStatusBadge status={order.status} />
                    <span className="text-text-light">{expanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 p-4">
                    <div className="mb-3 space-y-2">
                      {order.order_items?.map((item) => (
                        <div key={item.id} className="rounded-xl bg-bg p-3">
                          <div className="flex items-start gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-text-dark font-accent text-sm font-bold text-white">
                              {item.quantity}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-heading font-bold text-text-dark">
                                {item.menu_item?.name}
                              </p>
                              {item.order_item_modifiers?.length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                  {item.order_item_modifiers.map((m) => (
                                    <li
                                      key={m.id}
                                      className="flex items-center gap-1.5 font-body text-sm text-text"
                                    >
                                      <span className="text-primary">•</span>
                                      {m.modifier?.name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {item.special_instructions && (
                                <p className="mt-1 font-body text-sm italic text-warm">
                                  Note: {item.special_instructions}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <PaymentBadge status={order.payment_status} />
                      <div className="flex flex-wrap items-center gap-2">
                        {hasIssue(order) && (
                          <button
                            onClick={() => unflag(order.id)}
                            className="cursor-pointer touch-manipulation rounded-full border border-danger/40 bg-surface px-4 py-2 font-accent text-sm font-bold text-danger transition-colors hover:bg-danger hover:text-white"
                          >
                            Clear issue flag
                          </button>
                        )}
                        <button
                          onClick={() => reprint(order.id)}
                          className="cursor-pointer touch-manipulation rounded-full border border-gray-300 bg-surface px-4 py-2 font-accent text-sm font-bold text-text transition-colors hover:bg-gray-50"
                        >
                          🖨 Reprint labels
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
