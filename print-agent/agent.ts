/**
 * LOTG cup-label print agent.
 *
 * Runs on the shop PC with the label printer plugged into it. Watches the same
 * Supabase Realtime `orders` feed the barista board uses, and prints one label
 * per cup the moment an order lands. Nobody has to press anything.
 *
 *   npm install
 *   npm start            # print for real
 *   npm run test-label   # print one fake label, to check the roll and layout
 *
 * Three things this has to survive, because all three WILL happen on a Sunday:
 *
 *   1. The order row appears BEFORE its items do. The web app inserts the order,
 *      then inserts order_items one by one, so a realtime event can arrive when
 *      the order still has zero drinks on it. We poll briefly for the items.
 *   2. The agent gets started late, or crashes and restarts mid-service. On boot
 *      it catches up on every unprinted order from the last few hours.
 *   3. The same order arrives twice (realtime redelivery, a reprint, a race).
 *      `label_printed_at` in the database is the guard, plus an in-flight set for
 *      the seconds before that column is written.
 *
 * Reprinting: the barista board's "Print label" button sets label_printed_at back
 * to NULL, which lands here as an UPDATE and prints the order again.
 */

import 'dotenv/config';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { unlink } from 'node:fs/promises';

// pdf-to-printer is a CommonJS module, and pulling named functions off it with
// `import { getPrinters } from 'pdf-to-printer'` breaks on newer Node ("does not
// provide an export named 'getPrinters'") — the ESM/CJS interop differs between
// Node versions. createRequire loads it the plain CommonJS way, which returns the
// real module and works identically on every Node version.
const require = createRequire(import.meta.url);
const { print, getPrinters } = require('pdf-to-printer') as typeof import('pdf-to-printer');
import { drinkTemperature } from '../src/lib/temperature';
import {
  DEFAULT_LABEL_SETTINGS,
  normalizeLabelSettings,
  SAMPLE_LABELS,
  type LabelData,
  type LabelSettings,
} from '../src/lib/labels';
import { renderLabelPdf } from './label';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Empty = Windows' default printer. Set it if the PC has more than one. */
const PRINTER_NAME = process.env.PRINTER_NAME ?? '';

/** How far back to look for unprinted orders on startup. */
const CATCHUP_HOURS = Number(process.env.CATCHUP_HOURS ?? 6);

/**
 * The layout, owned by /admin/labels and cached here.
 *
 * Re-read on every save (see the label_settings subscription below), so changing the
 * roll size in admin takes effect on the very next cup — nobody has to touch this PC.
 * If the migration hasn't been run the table won't exist, and we print with the
 * defaults rather than refusing to print at all.
 */
let labelSettings: LabelSettings = DEFAULT_LABEL_SETTINGS;
/** Remembers which test-print request we've already served, so a reconnect can't reprint it. */
let lastTestPrintAt: string | null = null;

async function loadLabelSettings(): Promise<void> {
  const { data, error } = await supabase.from('label_settings').select('*').eq('id', 1).maybeSingle();

  if (error) {
    console.error(`Could not load label layout (${error.message}) — using defaults.`);
    return;
  }

  labelSettings = normalizeLabelSettings(data);
  lastTestPrintAt = data?.test_print_requested_at ?? null;
}

const ORDER_QUERY = `
  id, customer_name, created_at, status, label_printed_at,
  order_items (
    id, quantity, special_instructions,
    menu_item:menu_items ( name ),
    order_item_modifiers ( modifier:modifiers ( name ) )
  )
`;

interface FetchedOrder {
  id: string;
  customer_name: string;
  created_at: string;
  status: string;
  label_printed_at: string | null;
  order_items: {
    id: string;
    quantity: number;
    special_instructions: string | null;
    menu_item: { name: string } | null;
    order_item_modifiers: { modifier: { name: string } | null }[];
  }[];
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/** Orders currently being printed — guards the gap before label_printed_at is written. */
const inFlight = new Set<string>();

// ─── Turning an order into labels ─────────────────────────────────────────────

/** One label per cup: a quantity of 3 is three separate labels, not "x3" on one. */
function buildLabels(order: FetchedOrder): LabelData[] {
  const cupTotal = order.order_items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const time = new Date(order.created_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  const labels: LabelData[] = [];
  let cupIndex = 0;

  for (const item of order.order_items) {
    const modifiers = item.order_item_modifiers
      .map((m) => m.modifier?.name)
      .filter((name): name is string => Boolean(name));

    const drinkName = item.menu_item?.name ?? 'Drink';

    for (let i = 0; i < (item.quantity ?? 1); i++) {
      cupIndex++;
      labels.push({
        temp: drinkTemperature(drinkName, modifiers),
        customerName: order.customer_name,
        cupIndex,
        cupTotal,
        drinkName,
        modifiers,
        note: item.special_instructions?.trim() || null,
        // The full uuid is useless on a cup. The last 4 characters are enough to
        // match a label back to an order on the board.
        orderCode: order.id.slice(-4).toUpperCase(),
        timeText: time,
      });
    }
  }

  return labels;
}

/**
 * Set KEEP_PDF=1 in .env to leave the generated PDF on disk and log its path.
 * That's how you tell a blank label apart: open the PDF — if it has the label on
 * it, the problem is the printer/driver; if the PDF itself is blank, it's here.
 */
const KEEP_PDF = process.env.KEEP_PDF === '1';

/**
 * `scale: 'fit'` makes the printer scale the label to whatever paper size its
 * driver is set to, so the design always lands on the label. The previous
 * 'noscale' assumed the driver's paper matched the PDF exactly — when it didn't,
 * the printer fed a blank label instead of complaining. 'fit' is forgiving of
 * that mismatch, which is the usual cause of "it feeds but nothing prints".
 */
async function printLabel(label: LabelData) {
  const file = await renderLabelPdf(label, labelSettings);
  if (KEEP_PDF) console.log(`   PDF kept for inspection: ${file}`);
  try {
    await print(file, {
      printer: PRINTER_NAME || undefined,
      scale: 'fit',
    });
  } finally {
    if (!KEEP_PDF) await unlink(file).catch(() => {});
  }
}

// ─── The one path every print goes through ────────────────────────────────────

/**
 * Waits for the order's items to exist. The web app inserts the order row first
 * and its items immediately after, so a realtime event can beat the drinks by a
 * few hundred milliseconds — printing then would produce a blank label.
 */
async function fetchOrderWhenReady(orderId: string): Promise<FetchedOrder | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_QUERY)
      .eq('id', orderId)
      .single();

    if (error) {
      console.error(`  could not load order ${orderId}: ${error.message}`);
      return null;
    }

    const order = data as unknown as FetchedOrder;
    if (order.order_items?.length > 0) return order;

    await new Promise((r) => setTimeout(r, 500));
  }

  console.error(`  order ${orderId} still has no items after 10s — skipping`);
  return null;
}

async function handleOrder(orderId: string) {
  if (inFlight.has(orderId)) return;
  inFlight.add(orderId);

  try {
    const order = await fetchOrderWhenReady(orderId);
    if (!order) return;

    // Re-checked here rather than trusting the event: a reprint and a redelivery
    // look identical from the outside, and only this value tells them apart.
    if (order.label_printed_at) return;
    if (order.status === 'cancelled') return;

    const labels = buildLabels(order);
    console.log(`🖨  ${order.customer_name} — ${labels.length} label${labels.length !== 1 ? 's' : ''}`);

    for (const label of labels) {
      await printLabel(label);
    }

    const { error } = await supabase
      .from('orders')
      .update({ label_printed_at: new Date().toISOString() })
      .eq('id', orderId);

    // If this write fails the label is already on the roll, so say so loudly —
    // the next restart would otherwise print the whole order again.
    if (error) console.error(`  printed, but could not mark as printed: ${error.message}`);
  } catch (err) {
    console.error(`  print failed for ${orderId}:`, err instanceof Error ? err.message : err);
  } finally {
    inFlight.delete(orderId);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function catchUp() {
  const since = new Date(Date.now() - CATCHUP_HOURS * 3600_000).toISOString();

  const { data, error } = await supabase
    .from('orders')
    .select('id')
    .is('label_printed_at', null)
    .neq('status', 'cancelled')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`Could not check for missed orders: ${error.message}`);
    return;
  }

  if (!data?.length) {
    console.log('No missed orders.');
    return;
  }

  console.log(`Catching up on ${data.length} unprinted order${data.length !== 1 ? 's' : ''}...`);
  for (const row of data) {
    await handleOrder(row.id);
  }
}

/** The sample label — printed by `npm run test-label` and by the admin's test button. */
async function testLabel() {
  const sample = SAMPLE_LABELS[0].data;
  console.log(
    `🖨  Test label at ${labelSettings.width_mm}×${labelSettings.height_mm}mm...`,
  );
  await printLabel({
    ...sample,
    orderCode: 'TEST',
    timeText: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  });
  console.log('   Sent. If nothing came out, check the printer in Windows Settings → Printers.');
}

async function main() {
  if (process.argv.includes('--test')) {
    await loadLabelSettings();
    await testLabel();
    return;
  }

  const printers = await getPrinters().catch(() => []);
  await loadLabelSettings();

  console.log('LOTG label printer');
  console.log(`  Printer:    ${PRINTER_NAME || '(Windows default)'}`);
  console.log(`  Label size: ${labelSettings.width_mm} × ${labelSettings.height_mm} mm (set at /admin/labels)`);
  console.log(`  Available:  ${printers.map((p) => p.name).join(', ') || 'none found'}`);
  console.log('');

  await catchUp();

  supabase
    .channel('label-printer')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => handleOrder((payload.new as { id: string }).id),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        // Only a reprint request — the board clearing label_printed_at back to NULL.
        const row = payload.new as { id: string; label_printed_at: string | null };
        if (!row.label_printed_at) handleOrder(row.id);
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('Listening for orders. Leave this window open.');
      if (status === 'CHANNEL_ERROR') console.error('Lost connection to Supabase — retrying...');
    });

  // The layout is edited at /admin/labels. Picking the change up live means a new
  // roll size is a save in a browser, not an RDP session into the shop PC.
  supabase
    .channel('label-settings')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'label_settings' },
      (payload) => {
        const row = payload.new as Partial<LabelSettings>;
        labelSettings = normalizeLabelSettings(row);
        console.log(
          `Layout updated: ${labelSettings.width_mm} × ${labelSettings.height_mm} mm`,
        );

        // The admin's "Send test label" button stamps this timestamp. Compare it
        // rather than just reacting to the UPDATE, or every layout save would also
        // spit out a label.
        const requested = row.test_print_requested_at ?? null;
        if (requested && requested !== lastTestPrintAt) {
          lastTestPrintAt = requested;
          testLabel().catch((err) => console.error('  test label failed:', err));
        }
      },
    )
    .subscribe();
}

main();
