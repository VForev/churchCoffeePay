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
 *   1. The order row appears BEFORE its items do, and the items arrive one at a time.
 *      A realtime event routinely lands when only the first drink of a three-drink
 *      order exists — print then and the other two cups never come out. See
 *      fetchOrderWhenReady(): it waits for the order to be complete, not just non-empty.
 *   2. The agent gets started late, or crashes and restarts mid-service. On boot
 *      it catches up on every unprinted order from the last few hours.
 *   3. The same order arrives twice (realtime redelivery, a reprint, a race).
 *      `label_printed_at` in the database is the guard, and prints for one order are
 *      chained so the next one only starts once that column has been written.
 *
 * Reprinting: the barista board's print buttons set label_printed_at back to NULL and
 * stamp label_print_requested_at, which lands here as an UPDATE. "Print all cups" leaves
 * label_print_cups NULL; a single-cup reprint puts that cup's number in it.
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
  type LabelSettings,
} from '../src/lib/labels';
import { orderCups, cupsToPrint, type CupModifierSource } from '../src/lib/cups';
import { renderLabelPdf, renderDiagnosticPdf } from './label';
import { printPdf, listPrinterNames, listPaperSizes, listPaperSizesDetailed, resolveMedia, type PaperSize } from './printer';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Empty = Windows' default printer. Set it if the PC has more than one. */
const PRINTER_NAME = process.env.PRINTER_NAME ?? '';

/**
 * The printer name actually sent to the OS. Starts as PRINTER_NAME, but at startup we
 * reconcile it against the real printer list: the single most common setup mistake is a
 * name that's close but not exact — e.g. the Mac-style "Clabel__CT221B" from the example
 * against a Windows queue named "Clabel-CT221B". SumatraPDF then can't find the printer
 * and every job fails with "Command failed". resolvePrinterName() forgives punctuation
 * and case so it prints anyway, and warns loudly when it truly can't find a match.
 */
let RESOLVED_PRINTER = PRINTER_NAME;

/** Lowercase, strip spaces/underscores/hyphens — so "Clabel__CT221B" == "Clabel-CT221B". */
const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Reconcile PRINTER_NAME against the OS's real printer names. Returns a note to show. */
function resolvePrinterName(printers: string[]): string | null {
  if (!PRINTER_NAME) return null; // using the system default — nothing to match
  if (printers.includes(PRINTER_NAME)) return null; // exact match, all good

  const near = printers.find((p) => normalizeName(p) === normalizeName(PRINTER_NAME));
  if (near) {
    RESOLVED_PRINTER = near;
    return `  Note: PRINTER_NAME "${PRINTER_NAME}" wasn't exact — using "${near}" instead.`;
  }
  return (
    `  ⚠ No printer named "${PRINTER_NAME}" was found, so printing will fail.\n` +
    `    Copy a name from the Available list above into PRINTER_NAME in .env, then restart.`
  );
}

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
/** The same, with dimensions (Windows), so the agent can match the label size itself. */
let printerPaperSizesDetailed: PaperSize[] = [];

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
/** The exact label the admin was previewing when they hit "Send test label" (null = none). */
let testLabelData: LabelData | null = null;

async function loadLabelSettings(): Promise<void> {
  const { data, error } = await supabase.from('label_settings').select('*').eq('id', 1).maybeSingle();

  if (error) {
    console.error(`Could not load label layout (${error.message}) — using defaults.`);
    return;
  }

  labelSettings = normalizeLabelSettings(data);
  lastTestPrintAt = data?.test_print_requested_at ?? null;
  testLabelData = (data?.test_label_data as LabelData | null) ?? null;
}

/**
 * Everything about the order, plus its drinks.
 *
 * `*` rather than a column list on purpose: item_count and label_print_cups come from
 * a migration a given shop may not have run yet (supabase-label-cups.sql). Naming them
 * explicitly would make the whole query fail there and nothing would print at all;
 * with `*` they simply come back undefined and the agent uses the old behaviour.
 */
const ORDER_QUERY = `
  *,
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

interface FetchedOrder {
  id: string;
  customer_name: string;
  created_at: string;
  status: string;
  label_printed_at: string | null;
  /** How many drink lines the order has, stamped by the app once they're all inserted. */
  item_count?: number | null;
  /** Which cups to print; null/empty = all of them. */
  label_print_cups?: number[] | null;
  order_items: {
    id: string;
    quantity: number;
    special_instructions: string | null;
    menu_item: { name: string } | null;
    order_item_modifiers: { modifier: CupModifierSource | null }[];
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

/**
 * Print jobs, serialized per order.
 *
 * Two things arrive at once on a busy morning: realtime redelivery of the same order,
 * and a barista tapping "print cup 3" while the order's other cups are still spooling.
 * Dropping the second one loses a print the barista asked for; running both at once
 * prints the order twice. So they're CHAINED — each run re-reads the row after the one
 * before it finished, and label_printed_at then tells a duplicate apart from a genuine
 * new request.
 */
const printChains = new Map<string, Promise<void>>();

function queueOrder(orderId: string) {
  const previous = printChains.get(orderId) ?? Promise.resolve();
  const next = previous.then(() => handleOrder(orderId)).catch((err) => {
    console.error(`  print failed for ${orderId}:`, err instanceof Error ? err.message : err);
  });
  printChains.set(orderId, next);
  next.finally(() => {
    if (printChains.get(orderId) === next) printChains.delete(orderId);
  });
}

// ─── Turning an order into labels ─────────────────────────────────────────────

/**
 * One label per cup: a quantity of 3 is three separate labels, not "x3" on one.
 *
 * The cups themselves come from orderCups() in src/lib/cups.ts, which the barista
 * board also uses — so "CUP 2 OF 5" on the roll is the same cup as the board's
 * "Print cup 2" button. `only` narrows it to the cups that were asked for, while
 * every label still says which cup of the WHOLE order it is.
 */
function buildLabels(order: FetchedOrder, only?: number[] | null): LabelData[] {
  const time = new Date(order.created_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return cupsToPrint(orderCups(order.order_items), only).map((cup) => ({
    temp: drinkTemperature(cup.drinkName, cup.modifierNames),
    customerName: order.customer_name,
    cupIndex: cup.cupIndex,
    cupTotal: cup.cupTotal,
    drinkName: cup.drinkName,
    modifiers: cup.modifierLines,
    note: cup.note,
    // The full uuid is useless on a cup. The last 4 characters are enough to
    // match a label back to an order on the board.
    orderCode: order.id.slice(-4).toUpperCase(),
    timeText: time,
  }));
}

/**
 * Set KEEP_PDF=1 in .env to leave the generated PDF on disk and log its path.
 * That's how you tell a blank label apart: open the PDF — if it has the label on
 * it, the problem is the printer/driver; if the PDF itself is blank, it's here.
 */
const KEEP_PDF = process.env.KEEP_PDF === '1';

/** Loads and caches the target printer's supported paper sizes. */
async function loadPrinterPaperSizes(): Promise<void> {
  printerPaperSizes = await listPaperSizes(RESOLVED_PRINTER || undefined);
  printerPaperSizesDetailed = await listPaperSizesDetailed(RESOLVED_PRINTER || undefined);
}

/**
 * The media size to print the label at. This is the fix for "only the top of the label
 * prints": if the job doesn't name a size, the printer uses its own default (a short
 * 50mm form on the CLABEL) and clips anything past it. So the agent finds the driver's
 * OWN label size that matches the label's mm and prints to that — no more clipping, and
 * no need to change anything in Windows. PRINTER_PAPER_SIZE overrides the match.
 */
function resolvePaperSize(): string | undefined {
  if (PRINTER_PAPER_SIZE) return PRINTER_PAPER_SIZE;

  const near = (a: number, b: number) => Math.abs(a - b) <= 2;
  const { width_mm, height_mm } = labelSettings;

  // FIRST prefer a form whose NAME states the size in the same order as the label,
  // e.g. "50*80" for a 50×80 label. The CLABEL driver reports several forms with
  // identical — and sometimes transposed — dimensions: both "50*80" and "80*50" come
  // back to Windows as "80 × 50 mm". Dimension-matching alone then can't tell the
  // portrait roll from the landscape one and grabs whichever is listed first (the
  // landscape "80*50"), which chops the bottom 30mm off. The printed NAME is the only
  // thing that still distinguishes them, so it wins when it clearly matches.
  const nameNums = (name: string) => (name.match(/\d+/g) ?? []).map(Number);
  const byName = printerPaperSizesDetailed.find((s) => {
    const [w, h] = nameNums(s.name);
    return near(w, width_mm) && near(h, height_mm);
  });
  if (byName) return byName.name;

  // Otherwise match on the reported dimensions (within 2mm). Handles the size being
  // listed as W×H or, on some drivers, H×W.
  const match = printerPaperSizesDetailed.find(
    (s) =>
      s.widthMm > 0 &&
      ((near(s.widthMm, width_mm) && near(s.heightMm, height_mm)) ||
        (near(s.widthMm, height_mm) && near(s.heightMm, width_mm))),
  );
  if (match) return match.name;

  // Fall back to the platform name matching (macOS points; Windows returns undefined,
  // letting the driver default stand).
  return resolveMedia(printerPaperSizes, width_mm, height_mm);
}

async function printLabel(label: LabelData) {
  const file = await renderLabelPdf(label, labelSettings);
  if (KEEP_PDF) console.log(`   PDF kept for inspection: ${file}`);
  try {
    // Name the label size so the printer formats for it. Without this the printer
    // uses its default media and the label can feed out blank.
    await printPdf({
      file,
      printerName: RESOLVED_PRINTER || undefined,
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
 * Waits for the order to be COMPLETE, not merely non-empty.
 *
 * This is the fix for a three-drink order printing one cup. The web app inserts the
 * order row, then its items one at a time — each a separate round trip — so the
 * realtime event routinely lands when the order has one drink on it. Printing then
 * produced a single "CUP 1 OF 1" label and stamped the order printed, and the other
 * two drinks never came out of the printer at all.
 *
 * Two signals, in order of trust:
 *
 *   1. `orders.item_count` — stamped by the app once every item row is in. Definitive.
 *      Absent on orders placed before supabase-label-cups.sql, and on any order whose
 *      browser died halfway, so it can't be the only signal.
 *   2. Otherwise the count has to STOP GROWING: unchanged across SETTLE_POLLS polls.
 *      A slow phone inserting its third drink is the thing this waits out.
 *
 * Either way it gives up after ~15s and prints what's there — a late cup is worth more
 * than no cup, and the barista can reprint the rest.
 */
const POLL_MS = 400;
const SETTLE_POLLS = 5; // 2s of no new drinks = the order is done arriving
const MAX_POLLS = 38; // ~15s
const SETTLED_AGE_MS = 60_000; // older than this and the order finished arriving long ago

async function fetchOrderWhenReady(orderId: string): Promise<FetchedOrder | null> {
  let lastCount = -1;
  let stable = 0;

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
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
    const count = order.order_items?.length ?? 0;

    // Nothing to print yet — keep waiting, and don't let "0 twice" look settled.
    if (count === 0) {
      lastCount = 0;
      stable = 0;
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }

    // A reprint of an order placed a minute ago has nothing left to wait for — its
    // drinks stopped arriving long ago. Only a brand-new order is still filling in.
    if (Date.now() - new Date(order.created_at).getTime() > SETTLED_AGE_MS) return order;

    // The app told us how many drinks to expect.
    if (typeof order.item_count === 'number' && order.item_count > 0) {
      if (count >= order.item_count) return order;
    } else {
      stable = count === lastCount ? stable + 1 : 0;
      if (stable >= SETTLE_POLLS) return order;
    }

    lastCount = count;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  // Timed out. Print whatever the order does have rather than nothing at all.
  const { data } = await supabase.from('orders').select(ORDER_QUERY).eq('id', orderId).single();
  const order = data as unknown as FetchedOrder | null;
  if (!order || !(order.order_items?.length > 0)) {
    console.error(`  order ${orderId} still has no drinks on it after 15s — skipping`);
    return null;
  }
  console.error(
    `  ⚠ order ${orderId} never finished arriving (${order.order_items.length} of ` +
      `${order.item_count ?? '?'} drinks) — printing what's there.`,
  );
  return order;
}

async function handleOrder(orderId: string) {
  try {
    const order = await fetchOrderWhenReady(orderId);
    if (!order) return;

    // Re-checked here rather than trusting the event: a reprint and a redelivery
    // look identical from the outside, and only this value tells them apart.
    if (order.label_printed_at) return;
    if (order.status === 'cancelled') return;

    // Which cups were asked for — one cup for a remake, all of them otherwise.
    const requested = order.label_print_cups ?? null;
    const labels = buildLabels(order, requested);
    const cupTotal = labels[0]?.cupTotal ?? labels.length;
    const which =
      requested && requested.length > 0 && labels.length < cupTotal
        ? `cup${labels.length !== 1 ? 's' : ''} ${labels.map((l) => l.cupIndex).join(', ')} of ${cupTotal}`
        : `${labels.length} label${labels.length !== 1 ? 's' : ''}`;
    console.log(`🖨  ${order.customer_name} — ${which}`);

    // One at a time, and each one logged: if the roll jams halfway through an order,
    // the log says exactly which cup to reprint.
    for (const [i, label] of labels.entries()) {
      await printLabel(label);
      console.log(`    ✓ cup ${label.cupIndex} of ${label.cupTotal} (${i + 1}/${labels.length})`);
    }

    // Printed. Clear the cup selection too, so the next print is the whole order again.
    const printedAt = { label_printed_at: new Date().toISOString() };
    let { error } = await supabase
      .from('orders')
      .update({ ...printedAt, label_print_cups: null })
      .eq('id', orderId);

    // No label_print_cups column here (migration not run) — stamp the rest anyway.
    if (error) ({ error } = await supabase.from('orders').update(printedAt).eq('id', orderId));

    // If this write fails the label is already on the roll, so say so loudly —
    // the next restart would otherwise print the whole order again.
    if (error) console.error(`  printed, but could not mark as printed: ${error.message}`);
  } catch (err) {
    console.error(`  print failed for ${orderId}:`, err instanceof Error ? err.message : err);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function catchUp() {
  const since = new Date(Date.now() - CATCHUP_HOURS * 3600_000).toISOString();

  let query = supabase
    .from('orders')
    .select('id')
    .is('label_printed_at', null)
    .neq('status', 'cancelled')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  // In manual mode, only catch up orders the barista actually asked to print — otherwise a
  // restart would print every unprinted order at once, which is exactly what manual mode is
  // meant to avoid. In auto mode, catch up everything unprinted (the original behaviour).
  if (!labelSettings.auto_print) query = query.not('label_print_requested_at', 'is', null);

  const { data, error } = await query;

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

/**
 * The test label. Prints exactly what the admin was previewing when they hit the button
 * (sent along in test_label_data), so the roll matches the screen. Falls back to a canned
 * sample when there's no saved preview (e.g. `npm run test-label` before any real request).
 */
async function testLabel() {
  const printerNote = resolvePrinterName(await listPrinterNames());
  if (printerNote) console.log(printerNote);

  const data =
    testLabelData ??
    {
      ...SAMPLE_LABELS[0].data,
      orderCode: 'TEST',
      timeText: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
  console.log(
    `🖨  Test label at ${labelSettings.width_mm}×${labelSettings.height_mm}mm...`,
  );
  await printLabel(data);
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
  const printers = await listPrinterNames();
  const printerNote = resolvePrinterName(printers);
  await loadLabelSettings();
  await loadPrinterPaperSizes();
  const paperSize = resolvePaperSize();

  console.log('── Print doctor ─────────────────────────────');
  console.log(`  Using printer: ${RESOLVED_PRINTER || '(system default)'}`);
  console.log(`  Available:     ${printers.join(', ') || 'NONE FOUND'}`);
  if (printerNote) console.log(printerNote);
  console.log(`  Label size:    ${labelSettings.width_mm} × ${labelSettings.height_mm} mm`);
  console.log('');
  console.log('  Paper sizes this printer supports:');
  const detailed = await listPaperSizesDetailed(RESOLVED_PRINTER || undefined);
  if (detailed.length > 0) {
    // The name is what you copy into PRINTER_PAPER_SIZE; the mm are just to identify it.
    for (const size of detailed) {
      const dims = size.widthMm && size.heightMm ? `  (${size.widthMm} × ${size.heightMm} mm)` : '';
      console.log(`    ${size.name === paperSize ? '➜' : ' '} ${size.name}${dims}`);
    }
  } else if (printerPaperSizes.length > 0) {
    for (const size of printerPaperSizes) {
      console.log(`    ${size === paperSize ? '➜' : ' '} ${size}`);
    }
  } else {
    console.log('    (none reported — the driver may not expose sizes)');
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
      printerName: RESOLVED_PRINTER || undefined,
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
  const printerNote = resolvePrinterName(printers);
  await loadLabelSettings();
  await loadPrinterPaperSizes();
  const paperSize = resolvePaperSize();

  console.log('LOTG label printer');
  console.log(`  Printer:    ${RESOLVED_PRINTER || '(system default)'}`);
  console.log(`  Label size: ${labelSettings.width_mm} × ${labelSettings.height_mm} mm (set at /admin/labels)`);
  console.log(`  Paper size: ${paperSize ? `"${paperSize}"` : '(none matched — run `npm run doctor` to list sizes)'}`);
  console.log(`  Available:  ${printers.join(', ') || 'none found'}`);
  console.log(
    `  Printing:   ${labelSettings.auto_print ? 'automatic — prints when an order comes in' : 'manual — barista prints from /barista'}`,
  );
  if (printerNote) console.log(printerNote);
  console.log('');

  await catchUp();

  supabase
    .channel('label-printer')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        // Auto-print mode only: print the moment the order lands. In manual mode nothing
        // prints until the barista asks (which arrives as an UPDATE below).
        if (labelSettings.auto_print) queueOrder((payload.new as { id: string }).id);
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        // An explicit print/reprint request from the 🖨 button: label_print_requested_at is
        // stamped and label_printed_at cleared. Keyed on the request (not just "printed_at is
        // NULL") so an ordinary status change on an unprinted order — normal in manual mode —
        // isn't mistaken for a print request.
        const row = payload.new as {
          id: string;
          label_printed_at: string | null;
          label_print_requested_at: string | null;
        };
        if (row.label_print_requested_at && !row.label_printed_at) queueOrder(row.id);
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
          `Layout updated: ${labelSettings.width_mm} × ${labelSettings.height_mm} mm` +
            ` · printing ${labelSettings.auto_print ? 'automatic' : 'manual'}`,
        );

        // The admin's "Send test label" button stamps this timestamp. Compare it
        // rather than just reacting to the UPDATE, or every layout save would also
        // spit out a label.
        const requested = row.test_print_requested_at ?? null;
        if (requested && requested !== lastTestPrintAt) {
          lastTestPrintAt = requested;
          // Print exactly what was on screen — the button sends it in test_label_data.
          testLabelData = (row as { test_label_data?: LabelData | null }).test_label_data ?? null;
          testLabel().catch((err) => console.error('  test label failed:', err));
        }
      },
    )
    .subscribe();
}

main();
