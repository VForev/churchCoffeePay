'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { drinkTemperature } from '@/lib/temperature';
import type { Event } from '@/types';

/**
 * Admin analytics.
 *
 * Everything on this page answers to two controls at the top — a time window and
 * an event — and every number below them is computed from the same fetched set,
 * so nothing can disagree with anything else. "Reset" puts both back to today.
 *
 * Cancelled orders are excluded everywhere: they were never made and never paid for.
 */

type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom range' },
];

/** "No event" is a real answer — most Sundays are just regular service. */
const NO_EVENT = 'none';
const ALL_EVENTS = 'all';

interface AnalyticsOrder {
  id: string;
  total: number;
  subtotal: number;
  tip_amount: number;
  discount_amount: number;
  status: string;
  payment_status: string;
  order_source: string;
  event_id: string | null;
  created_at: string;
  order_items: {
    quantity: number;
    menu_item: { name: string } | null;
    order_item_modifiers: { modifier: { name: string } | null }[];
  }[];
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toInputDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Turns a preset into the actual window we query. `null` bounds mean "unbounded". */
function resolveRange(
  key: RangeKey,
  customFrom: string,
  customTo: string,
): { from: Date | null; to: Date | null; label: string } {
  const today = startOfDay(new Date());
  const endOfToday = new Date(today.getTime() + 86400000 - 1);

  switch (key) {
    case 'today':
      return { from: today, to: endOfToday, label: 'Today' };
    case 'yesterday': {
      const yesterday = new Date(today.getTime() - 86400000);
      return { from: yesterday, to: new Date(today.getTime() - 1), label: 'Yesterday' };
    }
    case 'week':
      return { from: new Date(today.getTime() - 6 * 86400000), to: endOfToday, label: 'Last 7 days' };
    case 'month':
      return { from: new Date(today.getTime() - 29 * 86400000), to: endOfToday, label: 'Last 30 days' };
    case 'all':
      return { from: null, to: null, label: 'All time' };
    case 'custom': {
      const from = customFrom ? startOfDay(new Date(`${customFrom}T00:00:00`)) : null;
      const to = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
      const label =
        from && to
          ? `${from.toLocaleDateString()} – ${to.toLocaleDateString()}`
          : 'Pick a start and end date';
      return { from, to, label };
    }
  }
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default function AdminDashboard() {
  const [range, setRange] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState(toInputDate(new Date()));
  const [customTo, setCustomTo] = useState(toInputDate(new Date()));
  const [eventFilter, setEventFilter] = useState<string>(ALL_EVENTS);

  const [events, setEvents] = useState<Event[]>([]);
  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [lowStock, setLowStock] = useState<
    { name: string; current_stock: number; unit: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const activeWindow = resolveRange(range, customFrom, customTo);
  const fromISO = activeWindow.from?.toISOString() ?? null;
  const toISO = activeWindow.to?.toISOString() ?? null;

  const fetchData = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('orders')
      .select(
        `id, total, subtotal, tip_amount, discount_amount, status, payment_status,
         order_source, event_id, created_at,
         order_items (
           quantity,
           menu_item:menu_items (name),
           order_item_modifiers ( modifier:modifiers (name) )
         )`,
      )
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true });

    if (fromISO) query = query.gte('created_at', fromISO);
    if (toISO) query = query.lte('created_at', toISO);

    const [ordersRes, eventsRes, inventoryRes] = await Promise.all([
      query,
      supabase.from('events').select('*').order('created_at', { ascending: false }),
      supabase.from('inventory_items').select('*'),
    ]);

    setOrders((ordersRes.data ?? []) as unknown as AnalyticsOrder[]);
    setEvents((eventsRes.data ?? []) as Event[]);
    setLowStock(
      (inventoryRes.data ?? [])
        .filter((i) => i.current_stock <= i.low_stock_threshold)
        .map((i) => ({ name: i.name, current_stock: i.current_stock, unit: i.unit })),
    );
    setLoading(false);
  }, [fromISO, toISO]);

  useEffect(() => {
    // A half-filled custom range would query a nonsense window, so wait for both ends.
    if (range === 'custom' && (!customFrom || !customTo)) return;
    fetchData();
  }, [fetchData, range, customFrom, customTo]);

  /** Everything below is derived from this one filtered list — one source of truth. */
  const filtered = useMemo(() => {
    if (eventFilter === ALL_EVENTS) return orders;
    if (eventFilter === NO_EVENT) return orders.filter((o) => !o.event_id);
    return orders.filter((o) => o.event_id === eventFilter);
  }, [orders, eventFilter]);

  const stats = useMemo(() => summarize(filtered), [filtered]);

  const eventRows = useMemo(() => {
    const rows = events.map((e) => ({
      id: e.id,
      name: e.name,
      isActive: e.is_active,
      ...summarize(orders.filter((o) => o.event_id === e.id)),
    }));

    const untagged = summarize(orders.filter((o) => !o.event_id));
    if (untagged.orderCount > 0) {
      rows.push({ id: NO_EVENT, name: 'Regular service (no event)', isActive: false, ...untagged });
    }

    return rows.filter((r) => r.orderCount > 0).sort((a, b) => b.revenue - a.revenue);
  }, [events, orders]);

  function resetFilters() {
    setRange('today');
    setCustomFrom(toInputDate(new Date()));
    setCustomTo(toInputDate(new Date()));
    setEventFilter(ALL_EVENTS);
  }

  const eventName =
    eventFilter === ALL_EVENTS
      ? 'All events'
      : eventFilter === NO_EVENT
        ? 'Regular service'
        : (events.find((e) => e.id === eventFilter)?.name ?? 'Event');

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-dark">Dashboard</h1>
          <p className="mt-0.5 font-body text-sm text-text-light">
            Showing <strong className="text-text">{activeWindow.label}</strong> · {eventName}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="cursor-pointer rounded-xl border border-gray-200 bg-surface px-4 py-2 font-accent text-sm font-semibold text-text hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
          <button
            onClick={resetFilters}
            className="cursor-pointer rounded-xl border border-gray-200 bg-surface px-4 py-2 font-accent text-sm font-semibold text-text hover:bg-gray-50"
          >
            Reset to today
          </button>
        </div>
      </div>

      {/* Filters — one row, above everything they control */}
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                'cursor-pointer rounded-full px-4 py-2 font-accent text-sm font-semibold transition-colors',
                range === r.key
                  ? 'bg-primary text-white'
                  : 'bg-bg text-text-light hover:bg-gray-100 hover:text-text',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {range === 'custom' && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="font-body text-xs text-text-light">
                From
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-1 block rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-sm text-text-dark focus:border-primary focus:outline-none"
                />
              </label>
              <label className="font-body text-xs text-text-light">
                To
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-1 block rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-sm text-text-dark focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          )}

          <label className="font-body text-xs text-text-light">
            Event
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="mt-1 block rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-sm text-text-dark focus:border-primary focus:outline-none"
            >
              <option value={ALL_EVENTS}>All events</option>
              <option value={NO_EVENT}>Regular service (no event)</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.is_active ? ' (running now)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        </div>
      ) : stats.orderCount === 0 ? (
        <Card>
          <p className="py-10 text-center font-body text-text-light">
            No orders in this window. Try a wider time range.
          </p>
        </Card>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Orders" value={stats.orderCount.toString()} big />
            <StatCard label="Revenue" value={money(stats.revenue)} big />
            <StatCard label="Drinks made" value={stats.drinkCount.toString()} big />
            <StatCard label="Avg order" value={money(stats.avgOrder)} />
            <StatCard label="Donations" value={money(stats.donations)} />
            <StatCard label="Discounts given" value={money(stats.discounts)} />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <ChartHeading title="Busiest times" subtitle="Orders placed, by hour of day" />
              <HourChart hours={stats.byHour} />
            </Card>

            <Card>
              <ChartHeading title="Hot vs cold" subtitle="Which cup you reached for" />
              <BarList
                rows={[
                  { name: 'Hot drinks', count: stats.hotDrinks },
                  { name: 'Cold drinks', count: stats.icedDrinks },
                  { name: 'Not a drink / unknown', count: stats.unknownDrinks },
                ].filter((r) => r.count > 0)}
                unit="drinks"
              />

              <div className="mt-5 border-t border-gray-100 pt-4">
                <ChartHeading title="How they ordered" subtitle="" />
                <BarList
                  rows={[
                    { name: 'On their phone', count: stats.mobileOrders },
                    { name: 'At the counter', count: stats.counterOrders },
                  ].filter((r) => r.count > 0)}
                  unit="orders"
                />
              </div>
            </Card>

            <Card>
              <ChartHeading title="Most ordered drinks" subtitle="By number of cups" />
              <BarList rows={stats.topItems} unit="cups" />
            </Card>

            <Card>
              <ChartHeading title="Most used add-ins" subtitle="Syrups, milks, extras" />
              <BarList rows={stats.topModifiers} unit="times" />
            </Card>
          </div>

          {/* Event comparison — the reason event_id gets stamped on every order */}
          <Card className="mb-6">
            <ChartHeading
              title="Events in this window"
              subtitle="Compare one event against another"
            />
            {eventRows.length === 0 ? (
              <p className="py-6 text-center font-body text-sm text-text-light">
                No orders in this window are tagged to an event.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left">
                  <thead>
                    <tr className="border-b border-gray-100 font-accent text-xs uppercase tracking-wide text-text-light">
                      <th className="py-2 pr-4 font-semibold">Event</th>
                      <th className="py-2 pr-4 text-right font-semibold">Orders</th>
                      <th className="py-2 pr-4 text-right font-semibold">Drinks</th>
                      <th className="py-2 pr-4 text-right font-semibold">Revenue</th>
                      <th className="py-2 text-right font-semibold">Avg order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventRows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setEventFilter(row.id)}
                        className="cursor-pointer border-b border-gray-50 font-body text-sm hover:bg-gray-50"
                      >
                        <td className="py-2.5 pr-4 font-semibold text-text-dark">
                          {row.name}
                          {row.isActive && (
                            <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 font-accent text-xs font-bold text-success">
                              Running
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right">{row.orderCount}</td>
                        <td className="py-2.5 pr-4 text-right">{row.drinkCount}</td>
                        <td className="py-2.5 pr-4 text-right font-accent font-semibold text-text-dark">
                          {money(row.revenue)}
                        </td>
                        <td className="py-2.5 text-right">{money(row.avgOrder)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 font-body text-xs text-text-light">
                  Click a row to filter the whole dashboard to that event.
                </p>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Low Stock Alert */}
      <Card>
        <ChartHeading title="Low stock alerts" subtitle="Current levels, not affected by the filters above" />
        {lowStock.length === 0 ? (
          <p className="font-body text-sm text-text-light">All inventory levels are good</p>
        ) : (
          <div className="space-y-2">
            {lowStock.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-xl bg-warning/5 px-3 py-2"
              >
                <span className="font-body text-sm">{item.name}</span>
                <span className="font-accent text-sm font-semibold text-warning">
                  {item.current_stock} {item.unit} left
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Number crunching ─────────────────────────────────────────────────────────

interface Summary {
  orderCount: number;
  revenue: number;
  drinkCount: number;
  avgOrder: number;
  donations: number;
  discounts: number;
  mobileOrders: number;
  counterOrders: number;
  hotDrinks: number;
  icedDrinks: number;
  unknownDrinks: number;
  byHour: { hour: number; count: number }[];
  topItems: { name: string; count: number }[];
  topModifiers: { name: string; count: number }[];
}

function summarize(orders: AnalyticsOrder[]): Summary {
  const itemCounts = new Map<string, number>();
  const modCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();

  let revenue = 0;
  let donations = 0;
  let discounts = 0;
  let drinkCount = 0;
  let mobileOrders = 0;
  let counterOrders = 0;
  let hotDrinks = 0;
  let icedDrinks = 0;
  let unknownDrinks = 0;

  for (const order of orders) {
    revenue += order.total ?? 0;
    donations += order.tip_amount ?? 0;
    discounts += order.discount_amount ?? 0;
    if (order.order_source === 'mobile') mobileOrders++;
    else counterOrders++;

    const hour = new Date(order.created_at).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

    for (const item of order.order_items ?? []) {
      const qty = item.quantity ?? 1;
      drinkCount += qty;

      const name = item.menu_item?.name ?? 'Unknown';
      itemCounts.set(name, (itemCounts.get(name) ?? 0) + qty);

      const modNames = (item.order_item_modifiers ?? []).map((m) => m.modifier?.name);
      for (const modName of modNames) {
        if (modName) modCounts.set(modName, (modCounts.get(modName) ?? 0) + qty);
      }

      const temp = drinkTemperature(name, modNames);
      if (temp === 'hot') hotDrinks += qty;
      else if (temp === 'iced') icedDrinks += qty;
      else unknownDrinks += qty;
    }
  }

  const rank = (counts: Map<string, number>, limit: number) =>
    [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, limit);

  return {
    orderCount: orders.length,
    revenue,
    drinkCount,
    avgOrder: orders.length ? revenue / orders.length : 0,
    donations,
    discounts,
    mobileOrders,
    counterOrders,
    hotDrinks,
    icedDrinks,
    unknownDrinks,
    byHour: [...hourCounts.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour),
    topItems: rank(itemCounts, 8),
    topModifiers: rank(modCounts, 8),
  };
}

// ─── Presentation ─────────────────────────────────────────────────────────────

function StatCard({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <Card>
      <p className="font-body text-sm text-text-light">{label}</p>
      <p
        className={cn(
          'mt-1 font-heading font-bold text-text-dark',
          big ? 'text-3xl' : 'text-2xl',
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function ChartHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-heading font-bold text-text-dark">{title}</h2>
      {subtitle && <p className="font-body text-xs text-text-light">{subtitle}</p>}
    </div>
  );
}

/** Horizontal magnitude bars — one hue, longest first, value labelled on every row. */
function BarList({ rows, unit }: { rows: { name: string; count: number }[]; unit: string }) {
  if (rows.length === 0) {
    return <p className="font-body text-sm text-text-light">Nothing yet</p>;
  }

  const max = Math.max(...rows.map((r) => r.count));

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.name} title={`${row.name}: ${row.count} ${unit}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate font-body text-sm text-text-dark">{row.name}</span>
            <span className="shrink-0 font-accent text-sm font-semibold text-text">
              {row.count}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-bg">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${Math.max((row.count / max) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars, one per hour that actually saw an order. */
function HourChart({ hours }: { hours: { hour: number; count: number }[] }) {
  if (hours.length === 0) {
    return <p className="font-body text-sm text-text-light">Nothing yet</p>;
  }

  const max = Math.max(...hours.map((h) => h.count));

  return (
    <div className="flex h-44 gap-2 overflow-x-auto pb-1">
      {hours.map(({ hour, count }) => (
        <div
          key={hour}
          className="flex h-full min-w-10 flex-1 flex-col items-center justify-end gap-1"
          title={`${formatHour(hour)}: ${count} order${count !== 1 ? 's' : ''}`}
        >
          <span className="font-accent text-xs font-semibold text-text">{count}</span>
          {/* The bar scales against the plot area only — the two labels sit outside it. */}
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-primary transition-all"
              style={{ height: `${Math.max((count / max) * 100, 4)}%` }}
            />
          </div>
          <span className="whitespace-nowrap font-body text-xs text-text-light">
            {formatHour(hour)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}
