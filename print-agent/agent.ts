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
import { spawn } from 'node:child_process';
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { WebSocket as NodeWebSocket } from 'ws';
import { unlink } from 'node:fs/promises';
import { drinkTemperature } from '../src/lib/temperature';

/** ws's WebSocket, typed as the transport Supabase Realtime expects. */
type RealtimeTransport = NonNullable<SupabaseClientOptions<'public'>['realtime']>['transport'];
import {
  DEFAULT_LABEL_SETTINGS,
  normalizeLabelSettings,
  SAMPLE_LABELS,
  type LabelData,
  type LabelModifierLine,
  type LabelSettings,
} from '../src/lib/labels';
import { renderLabelPdf, renderDiagnosticPdf } from './label';
import { printPdf, listPrinterNames, listPaperSizes, resolveMedia } from './printer';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Empty = Windows' default printer. Set it if the PC has more than one. */
const PRINTER_NAME = process.env.PRINTER_NAME ?? '';

/**
 * The printer's paper/label size, by name. This is the fix for a label that feeds
 * blank or the wrong size: the printer must be told the media is (say) 40 × 30 mm,
 * exactly like picking the paper size in a print dialog. Leave it blank and the
 * agent auto-matches one of the printer's own sizes to the label; set it to force a
 * specific one (copy the exact name the agent lists on startup).
 */
const PRINTER_PAPER_SIZE = process.env.PRINTER_PAPER_SIZE ?? '';

/** How far back to look for unprinted orders on startup. */
const CATCHUP_HOURS = Number(process.env.CATCHUP_HOURS ?? 6);

/** The sizes the target printer reports it can print, cached at startup. */
let printerPaperSizes: string[] = [];

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
    order_item_modifiers (
      modifier:modifiers (
        name, display_order,
        group:modifier_groups ( name, display_order )
      )
    )
  )
`;

interface FetchedModifier {
  name: string;
  display_order: number | null;
  group: { name: string; display_order: number | null } | null;
}

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
    order_item_modifiers: { modifier: FetchedModifier | null }[];
  }[];
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  // Node 20 and below have no built-in WebSocket, which Supabase Realtime (the live
  // order feed) needs — without this the agent crashes on start with "native WebSocket
  // not found". Supplying one from `ws` makes it run on Node 20 as well as 22+, and it
  // is simply ignored on newer Node that already has a native WebSocket.
  realtime: { transport: NodeWebSocket as unknown as RealtimeTransport },
});

/** Orders currently being printed — guards the gap before label_printed_at is written. */
const inFlight = new Set<string>();

// ─── Turning an order into labels ─────────────────────────────────────────────

/**
 * Groups an order item's modifiers by their category, so each category prints on its
 * own line (all the syrups together, the milk on a separate line, etc). Categories are
 * ordered by the group order set at /admin/modifiers, and options within a category by
 * their own order — the same order customers saw when picking them. Modifiers with no
 * group (shouldn't happen, but data can be messy) fall to the bottom under a blank name.
 */
function groupModifiers(
  rows: { modifier: FetchedModifier | null }[],
): LabelModifierLine[] {
  const groups = new Map<string, { order: number; options: { name: string; order: number }[] }>();

  for (const row of rows) {
    const name = row.modifier?.name;
    if (!name) continue;
    const groupName = row.modifier?.group?.name ?? '';
    const groupOrder = row.modifier?.group?.display_order ?? 9999;
    const optionOrder = row.modifier?.display_order ?? 0;

    const entry = groups.get(groupName) ?? { order: groupOrder, options: [] };
    entry.options.push({ name, order: optionOrder });
    groups.set(groupName, entry);
  }

  return [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([group, v]) => ({
      group,
      options: v.options.sort((a, b) => a.order - b.order).map((o) => o.name),
    }));
}

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
    const modifierLines = groupModifiers(item.order_item_modifiers);
    // Temperature only cares about the option names, not how they're grouped.
    const flatModifiers = modifierLines.flatMap((line) => line.options);

    const drinkName = item.menu_item?.name ?? 'Drink';

    for (let i = 0; i < (item.quantity ?? 1); i++) {
      cupIndex++;
      labels.push({
        temp: drinkTemperature(drinkName, flatModifiers),
        customerName: order.customer_name,
        cupIndex,
        cupTotal,
        drinkName,
        modifiers: modifierLines,
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

/** Loads and caches the target printer's supported paper sizes. */
async function loadPrinterPaperSizes(): Promise<void> {
  printerPaperSizes = await listPaperSizes(PRINTER_NAME || undefined);
}

/**
 * The media size to print the label at. A blank or wrong-size label is almost
 * always the print job not naming the size, so the printer falls back to a default
 * (on the CLABEL that's a 50 × 50 square) and the design lands off the label.
 * resolveMedia() turns the label's mm size into whatever this platform's printer
 * calls it; PRINTER_PAPER_SIZE overrides it.
 */
function resolvePaperSize(): string | undefined {
  return resolveMedia(
    printerPaperSizes,
    labelSettings.width_mm,
    labelSettings.height_mm,
    PRINTER_PAPER_SIZE || undefined,
  );
}

async function printLabel(label: LabelData) {
  const file = await renderLabelPdf(label, labelSettings);
  if (KEEP_PDF) console.log(`   PDF kept for inspection: ${file}`);
  try {
    // Name the label size so the printer formats for it. Without this the printer
    // uses its default media and the label can feed out blank.
    await printPdf({
      file,
      printerName: PRINTER_NAME || undefined,
      media: resolvePaperSize(),
      widthMm: labelSettings.width_mm,
      heightMm: labelSettings.height_mm,
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

/** Opens a file in the OS default app, so the diagnostic PDF pops up on screen. */
function openOnScreen(path: string) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', path], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [path], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [path], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    /* not fatal — the path is logged either way */
  }
}

/**
 * `npm run doctor` — prints a crude test page (black block + "TEST 123") and opens
 * the same PDF on screen, to locate a blank-label problem. See renderDiagnosticPdf.
 */
async function runDoctor() {
  await loadLabelSettings();
  await loadPrinterPaperSizes();
  const printers = await listPrinterNames();
  const paperSize = resolvePaperSize();

  console.log('── Print doctor ─────────────────────────────');
  console.log(`  Using printer: ${PRINTER_NAME || '(system default)'}`);
  console.log(`  Available:     ${printers.join(', ') || 'NONE FOUND'}`);
  console.log(`  Label size:    ${labelSettings.width_mm} × ${labelSettings.height_mm} mm`);
  console.log('');
  console.log('  Paper sizes this printer supports:');
  if (printerPaperSizes.length === 0) {
    console.log('    (none reported — the driver may not expose sizes)');
  } else {
    for (const size of printerPaperSizes) {
      console.log(`    ${size === paperSize ? '➜' : ' '} ${size}`);
    }
  }
  console.log(
    paperSize
      ? `  Using paper size: "${paperSize}"`
      : "  Using paper size: the printer's own default (set in Printing Preferences).\n" +
        '                    Set PRINTER_PAPER_SIZE in .env only if you need to override it.',
  );
  console.log('');

  const file = await renderDiagnosticPdf(labelSettings);
  console.log(`  Test PDF:      ${file}`);
  openOnScreen(file); // pops up so you can see if the PDF itself has content

  try {
    await printPdf({
      file,
      printerName: PRINTER_NAME || undefined,
      media: paperSize,
      widthMm: labelSettings.width_mm,
      heightMm: labelSettings.height_mm,
    });
    console.log('  Print job sent.');
  } catch (err) {
    console.error('  ⚠ PRINT FAILED:', err instanceof Error ? err.message : err);
  }

  console.log('');
  console.log('  If it is still blank: copy the size that matches your label from the list');
  console.log('  above into PRINTER_PAPER_SIZE in your .env, then run this again.');
}

async function main() {
  if (process.argv.includes('--doctor')) {
    await runDoctor();
    return;
  }

  if (process.argv.includes('--test')) {
    await loadLabelSettings();
    await testLabel();
    return;
  }

  const printers = await listPrinterNames();
  await loadLabelSettings();
  await loadPrinterPaperSizes();
  const paperSize = resolvePaperSize();

  console.log('LOTG label printer');
  console.log(`  Printer:    ${PRINTER_NAME || '(system default)'}`);
  console.log(`  Label size: ${labelSettings.width_mm} × ${labelSettings.height_mm} mm (set at /admin/labels)`);
  console.log(`  Paper size: ${paperSize ? `"${paperSize}"` : '(none matched — run `npm run doctor` to list sizes)'}`);
  console.log(`  Available:  ${printers.join(', ') || 'none found'}`);
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
