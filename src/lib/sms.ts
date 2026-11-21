/**
 * "Text me when my order is ready" — the parts both the browser and the server need.
 *
 * How it fits together:
 *
 *   1. /checkout or /tablet: the customer ticks the box and types a number. After the
 *      order row is in, `subscribeToReadyText()` posts it to /api/sms/subscribe, which
 *      stores it in `order_sms` — a table the public anon key cannot read (see
 *      supabase-sms-notifications.sql for why it isn't on `orders`).
 *   2. /barista: when a card moves Making → Ready, `notifyOrderReady()` posts the order
 *      id to /api/sms/order-ready. The server checks the order really is Ready, claims
 *      the row so two barista screens can't both send, and sends one text via Telnyx.
 *   3. The number is wiped once the text has gone.
 *
 * Every call here is best-effort. A text is a convenience; nothing about placing or
 * making an order may ever wait on it or fail because of it.
 */

/** Shown next to the checkbox and on /text-messages. Carriers require every part of it. */
export const SMS_PROGRAM_NAME = 'LOTG Coffee';
export const SMS_TERMS_PATH = '/text-messages';

/**
 * US / Canada numbers only, returned as E.164 (+1XXXXXXXXXX), or null if it isn't one.
 * Accepts the ways people actually type a number: (555) 123-4567, 555.123.4567,
 * +1 555 123 4567, 15551234567.
 */
export function normalizeUsPhone(input: string): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  // North American numbering: area code and exchange can't start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  // 555-01XX is reserved for fiction; nobody receives texts there.
  if (ten.slice(3, 6) === '555' && ten.slice(6, 8) === '01') return null;
  return `+1${ten}`;
}

/** The error shown under the phone box, or '' when it's fine. */
export function phoneError(input: string): string {
  if (!input.trim()) return 'Enter your mobile number, or untick the box.';
  return normalizeUsPhone(input) ? '' : 'That doesn’t look like a US mobile number.';
}

/**
 * The text itself. Plain ASCII on purpose: one emoji or curly apostrophe switches the
 * whole message to UCS-2, which halves the characters per segment and can double the
 * cost. Starts with the program name because carriers expect every message to say who
 * it's from.
 */
export function readyMessage(customerName: string): string {
  const name = customerName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  const greeting = name ? `Hi ${name}, your` : 'Your';
  return `${SMS_PROGRAM_NAME}: ${greeting} order is ready at the coffee bar! Reply STOP to opt out.`;
}

/** Is texting switched on (Telnyx keys present on the server)? False on any failure. */
export async function fetchSmsEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/sms', { cache: 'no-store' });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Store the number against a just-placed order. Never throws — returns an error message
 * for the console, because by the time this runs the order is already placed and paid.
 */
export async function subscribeToReadyText(orderId: string, phone: string): Promise<string | null> {
  try {
    const res = await fetch('/api/sms/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, phone }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.error ?? `Could not save the number (${res.status})`;
  } catch (err) {
    return err instanceof Error ? err.message : 'Could not save the number';
  }
}

export interface ReadyTextResult {
  /** True only when a text actually went out on this call. */
  sent: boolean;
  /** Set when this order wanted a text and it failed — worth telling the barista. */
  error?: string;
}

/** Called by /barista when an order moves to Ready. Never throws. */
export async function notifyOrderReady(orderId: string): Promise<ReadyTextResult> {
  try {
    const res = await fetch('/api/sms/order-ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const body = await res.json().catch(() => null);
    return { sent: body?.sent === true, error: body?.error || undefined };
  } catch {
    // Offline barista tablet: say nothing. The board itself will be showing Reconnecting.
    return { sent: false };
  }
}
