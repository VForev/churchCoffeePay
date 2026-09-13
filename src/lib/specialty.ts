/**
 * Drink of the day.
 *
 * A special is not a menu item — it's an existing drink plus a build. `menu_item_id` is
 * what it's made on, `modifier_ids` are the add-ins that make it the special, and the
 * customer can still change everything else. Three things fall out of storing it that
 * way, and they're the reason it isn't just another row in `menu_items`:
 *
 *  - **It can't be ordered when the bar can't make it.** A seasonal drink exists only
 *    while its syrup is on the shelf, so the card reads the same `is_sold_out` flags the
 *    barista already flips on the 86 tab. Nobody has to remember to take the card down.
 *  - **It costs what the drink costs.** No second price to keep in step with the menu.
 *  - **It's still a Latte on the barista board**, with its add-ins listed like any other
 *    order. Nothing behind the bar has to learn a new kind of thing.
 *
 * Stored in `specialty_drink` (single row, id = 1, from supabase-specialty-drink.sql).
 * Every read falls back to "off" — no table, no row, no network, nothing on the menu.
 */

import { supabase } from './supabase';
import type { MenuItem, Modifier } from '@/types';

export type SpecialtyStyle = 'big' | 'small';

export interface SpecialtySettings {
  is_enabled: boolean;
  ribbon: string;
  name: string;
  tagline: string;
  menu_item_id: string | null;
  modifier_ids: string[];
  display_style: SpecialtyStyle;
  /** "YYYY-MM-DD", or null for no end date. */
  show_until: string | null;
  sold_out_note: string;
}

export const DEFAULT_SPECIALTY: SpecialtySettings = {
  is_enabled: false,
  ribbon: 'THIS SUNDAY',
  name: '',
  tagline: '',
  menu_item_id: null,
  modifier_ids: [],
  display_style: 'big',
  show_until: null,
  sold_out_note: 'Back next Sunday',
};

/**
 * What the menu should actually show.
 *
 *  - `off`      nothing on the menu at all
 *  - `ready`    orderable
 *  - `sold_out` on the menu, greyed, not orderable, saying what ran out
 *
 * Sold out is shown rather than hidden on purpose. Someone came in for the maple latte;
 * a card that has silently vanished makes them think they imagined it, and they ask the
 * barista mid-rush. "We ran out of maple this morning" answers it from the phone.
 */
export type SpecialtyState =
  | { kind: 'off' }
  | {
      kind: 'ready' | 'sold_out';
      settings: SpecialtySettings;
      item: MenuItem;
      modifiers: Modifier[];
      /** Which add-in (or the drink) ran out — named, so the message can say it. */
      soldOutName: string | null;
    };

/** Local date as YYYY-MM-DD. The shop's clock is the one that matters, not UTC. */
function today(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function fromRow(row: Record<string, unknown> | null): SpecialtySettings {
  if (!row) return DEFAULT_SPECIALTY;
  const style = row.display_style === 'small' ? 'small' : 'big';
  return {
    is_enabled: row.is_enabled === true,
    ribbon: typeof row.ribbon === 'string' ? row.ribbon : DEFAULT_SPECIALTY.ribbon,
    name: typeof row.name === 'string' ? row.name : '',
    tagline: typeof row.tagline === 'string' ? row.tagline : '',
    menu_item_id: typeof row.menu_item_id === 'string' ? row.menu_item_id : null,
    modifier_ids: Array.isArray(row.modifier_ids) ? (row.modifier_ids as string[]) : [],
    display_style: style,
    show_until: typeof row.show_until === 'string' ? row.show_until : null,
    sold_out_note:
      typeof row.sold_out_note === 'string' && row.sold_out_note
        ? row.sold_out_note
        : DEFAULT_SPECIALTY.sold_out_note,
  };
}

/** The saved settings. Any failure is "no special", never an error on the menu. */
export async function fetchSpecialty(): Promise<SpecialtySettings> {
  const { data, error } = await supabase
    .from('specialty_drink')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return DEFAULT_SPECIALTY;
  return fromRow(data as Record<string, unknown>);
}

export async function saveSpecialty(
  settings: SpecialtySettings,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('specialty_drink').upsert({
    id: 1,
    is_enabled: settings.is_enabled,
    ribbon: settings.ribbon.trim(),
    name: settings.name.trim(),
    tagline: settings.tagline.trim(),
    menu_item_id: settings.menu_item_id,
    modifier_ids: settings.modifier_ids,
    display_style: settings.display_style,
    show_until: settings.show_until || null,
    sold_out_note: settings.sold_out_note.trim() || DEFAULT_SPECIALTY.sold_out_note,
    updated_at: new Date().toISOString(),
  });

  if (!error) return { ok: true };

  const missingTable = /specialty_drink/i.test(error.message) || error.code === '42P01';
  return {
    ok: false,
    error: missingTable
      ? 'The drink of the day can’t be saved yet — run supabase-specialty-drink.sql in the Supabase SQL editor.'
      : `Couldn’t save: ${error.message}`,
  };
}

/**
 * Turns the settings plus the live menu into what the customer sees.
 *
 * Deliberately takes the menu it's given rather than fetching: the customer page has
 * already loaded and subscribed to `menu_items` and `modifiers`, so a barista flipping
 * maple to sold out re-runs this with no extra round trip and the card changes under
 * everyone at once.
 */
export function resolveSpecialty(
  settings: SpecialtySettings,
  menuItems: MenuItem[],
  modifiers: Modifier[],
): SpecialtyState {
  if (!settings.is_enabled) return { kind: 'off' };
  if (!settings.name.trim() || !settings.menu_item_id) return { kind: 'off' };

  // Past its last day. It takes itself down rather than waiting to be remembered.
  if (settings.show_until && settings.show_until < today()) return { kind: 'off' };

  const item = menuItems.find((m) => m.id === settings.menu_item_id);
  // Gone from the menu entirely (deleted, or hidden by an admin) — not "sold out",
  // because there is nothing to say about a drink that no longer exists.
  if (!item || item.is_available === false) return { kind: 'off' };

  const build = settings.modifier_ids
    .map((id) => modifiers.find((m) => m.id === id))
    .filter((m): m is Modifier => !!m);

  // The drink itself, then the add-ins. Whichever ran out first is the one named.
  const missing = item.is_sold_out ? item.name : (build.find((m) => m.is_sold_out)?.name ?? null);

  return {
    kind: missing ? 'sold_out' : 'ready',
    settings,
    item,
    modifiers: build,
    soldOutName: missing,
  };
}

/** "Built on a Latte · maple, cinnamon" — the line under the name on the big card. */
export function buildSummary(item: MenuItem, modifiers: Modifier[]): string {
  const names = modifiers.map((m) => m.name).join(', ');
  return names ? `${item.name} · ${names}` : item.name;
}
