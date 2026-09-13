/**
 * Which orders on the live board belong to the phone looking at it.
 *
 * The board is public — every order in the queue is on it, by design, because the
 * lobby TV shows the same list. That makes it useless for the one question a customer
 * actually has, which is "where is *mine*". So the ids of the orders this browser
 * placed are kept here, and `/yourlive` pins them to the top.
 *
 * localStorage, like src/lib/device.ts, and for the same reasons: it identifies
 * nothing about the person, survives a reload, and is gone when they clear site data.
 * Losing it costs them the pinned card and nothing else — the board still works, the
 * order is still being made. Every failure path is silent for exactly that reason.
 *
 * Not the same thing as `device_id`. That is written on the order for the spam limit
 * and lives in the database; this never leaves the phone, and matching on it needs no
 * migration and no extra column in the board's query.
 */

const STORAGE_KEY = 'lotg_my_orders';

/**
 * How long an order stays "mine".
 *
 * Long enough to cover a service and someone coming back to the tab after it, short
 * enough that next Sunday's board doesn't try to pin last Sunday's order. Nothing
 * breaks when it's wrong in either direction: the board only ever pins orders that are
 * still active, so a stale id matches nothing.
 */
const TTL_MS = 6 * 60 * 60 * 1000;

/** A family ordering one after another still has all of theirs pinned. */
const MAX_REMEMBERED = 8;

interface Remembered {
  id: string;
  at: number;
}

function read(): Remembered[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - TTL_MS;
    return parsed.filter(
      (entry): entry is Remembered =>
        !!entry &&
        typeof (entry as Remembered).id === 'string' &&
        typeof (entry as Remembered).at === 'number' &&
        (entry as Remembered).at > cutoff,
    );
  } catch {
    return [];
  }
}

/** Called once an order is safely in the database — never before. */
export function rememberMyOrder(orderId: string): void {
  if (typeof window === 'undefined' || !orderId) return;
  try {
    const kept = [{ id: orderId, at: Date.now() }, ...read().filter((e) => e.id !== orderId)].slice(
      0,
      MAX_REMEMBERED,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    /* A pinned card is not worth an exception on a locked-down browser. */
  }
}

/** Newest first, so the order someone just placed is the one shown at the top. */
export function getMyOrderIds(): string[] {
  return read().map((e) => e.id);
}
