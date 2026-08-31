/**
 * How long an order took — the single definition of it.
 *
 * Three different screens ask this question (the barista's History rows, the admin
 * dashboard's summary, and the per-order list under it) and they have to agree, or
 * the average will contradict the list right below it. So the arithmetic lives here
 * and nowhere else.
 *
 * The stamps come from supabase-order-timing.sql and are written by /barista as the
 * barista moves a card. Orders taken before that migration have none, and orders
 * still being made only have some — every function here returns null rather than a
 * zero when it can't answer. A zero would quietly drag every average down.
 */

/** The timing columns, as loose as they need to be for every caller's query. */
export interface TimedOrder {
  created_at: string;
  started_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
  status?: string;
}

/**
 * Anything longer than this is someone who forgot to tap "Mark Ready" until after
 * they'd cleared the bar — packing up at noon and clearing the board is the classic
 * one. Counting a four-hour "make time" would make the average meaningless, so those
 * orders are dropped from the stats entirely rather than clamped to the cap (a clamp
 * still says "this drink took 45 minutes", which is just as untrue).
 */
export const MAX_SANE_MINUTES = 45;

function ms(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const diff = end - start;
  // A clock that went backwards (two devices, two clocks) yields a negative time.
  return diff >= 0 ? diff : null;
}

/**
 * Hands-on time: "Start Making" → "Mark Ready". This is the number that says whether
 * the bar is fast, because it excludes however long the order sat in the queue.
 */
export function makeSeconds(order: TimedOrder): number | null {
  const d = ms(order.started_at, order.ready_at);
  return d === null ? null : Math.round(d / 1000);
}

/**
 * What the customer actually experienced: ordered → ready to collect. Includes the
 * queue, which is exactly why it's reported alongside make time rather than instead
 * of it — a slow morning shows up here first.
 */
export function waitSeconds(order: TimedOrder): number | null {
  const d = ms(order.created_at, order.ready_at);
  return d === null ? null : Math.round(d / 1000);
}

/** Drops the forgot-to-tap outliers. See MAX_SANE_MINUTES. */
export function isSaneDuration(seconds: number | null): seconds is number {
  return seconds !== null && seconds <= MAX_SANE_MINUTES * 60;
}

/**
 * "4m 20s" / "45s" / "1h 05m".
 *
 * Seconds are shown below ten minutes and dropped above it: at 2 minutes the seconds
 * are the interesting part, at 20 they're noise.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);

  if (mins < 60) return mins < 10 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${mins}m`;

  const hours = Math.floor(mins / 60);
  return `${hours}h ${(mins % 60).toString().padStart(2, '0')}m`;
}

/** Same thing, one decimal of a minute — for an average, where "4.3 min" reads better. */
export function formatMinutes(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  return `${(seconds / 60).toFixed(1)} min`;
}

export interface DurationStats {
  /** How many orders had a usable time — never assume this equals the order count. */
  count: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
  fastestSeconds: number | null;
  slowestSeconds: number | null;
}

export const EMPTY_STATS: DurationStats = {
  count: 0,
  averageSeconds: null,
  medianSeconds: null,
  fastestSeconds: null,
  slowestSeconds: null,
};

/**
 * Average AND median, deliberately both. One drink remade three times drags the
 * average up on a quiet morning; the median says whether that was the whole story
 * or just the one order. Reading only the average is how you end up "fixing" a
 * problem that was a single outlier.
 */
export function durationStats(values: (number | null)[]): DurationStats {
  const clean = values.filter(isSaneDuration).sort((a, b) => a - b);
  if (clean.length === 0) return EMPTY_STATS;

  const total = clean.reduce((sum, v) => sum + v, 0);
  const mid = Math.floor(clean.length / 2);

  return {
    count: clean.length,
    averageSeconds: total / clean.length,
    medianSeconds: clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2,
    fastestSeconds: clean[0],
    slowestSeconds: clean[clean.length - 1],
  };
}

/**
 * The buckets the "how long did they take" chart is drawn in.
 *
 * Chosen around what the shop can act on, not round numbers: under 2 minutes is a
 * drip coffee, 2–5 is a normal espresso drink, 5–10 is a busy bar, and past 10 is
 * something worth asking about.
 */
export const DURATION_BUCKETS: { label: string; maxSeconds: number }[] = [
  { label: 'Under 2 min', maxSeconds: 120 },
  { label: '2 – 5 min', maxSeconds: 300 },
  { label: '5 – 10 min', maxSeconds: 600 },
  { label: '10 – 20 min', maxSeconds: 1200 },
  { label: 'Over 20 min', maxSeconds: Infinity },
];

/** Counts values into DURATION_BUCKETS, keeping empty buckets out of the chart. */
export function bucketDurations(values: (number | null)[]): { name: string; count: number }[] {
  const counts = new Array(DURATION_BUCKETS.length).fill(0);

  for (const v of values) {
    if (!isSaneDuration(v)) continue;
    const i = DURATION_BUCKETS.findIndex((b) => v < b.maxSeconds);
    counts[i === -1 ? DURATION_BUCKETS.length - 1 : i]++;
  }

  return DURATION_BUCKETS.map((b, i) => ({ name: b.label, count: counts[i] })).filter(
    (b) => b.count > 0,
  );
}

/**
 * Why an order has no make time. Shown instead of a dash, because "—" on twenty rows
 * looks like a broken page when the real answer is "these were never started on the
 * board" — which is itself worth knowing.
 */
export function missingReason(order: TimedOrder): string {
  if (order.status === 'cancelled') return 'Cancelled';
  if (!order.started_at && !order.ready_at) return 'Never started on the board';
  if (order.started_at && !order.ready_at) return 'Still being made';
  if (!order.started_at && order.ready_at) return 'Marked ready without starting';
  // Both stamps are there, so the only way to land here is a duration past the cap:
  // the card was left in Making until someone cleared the board. See MAX_SANE_MINUTES.
  return `Left on the board over ${MAX_SANE_MINUTES} min`;
}

/** Wall-clock time of day, for a per-order list. */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
