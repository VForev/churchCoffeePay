/**
 * One order → the individual cups it makes.
 *
 * This is the single definition of "cup 2 of 5", and it has to be, because two
 * different programs number the cups: the print agent puts `CUP 2 OF 5` on the
 * roll, and the barista board offers a **Print cup 2** button. If those two
 * counted separately, the button would eventually reprint a different drink than
 * the one it names — the exact failure that makes a barista stop trusting it.
 *
 * A quantity of 3 is three cups, not "x3" on one label, so this expands quantity.
 *
 * The cup ORDER is `order_items.id`. That table has no created_at, and PostgREST
 * makes no promise about row order, so insertion order simply isn't available to
 * either side. Sorting by id is arbitrary but *identical everywhere*, which is the
 * only property that actually matters here.
 */

import type { LabelModifierLine } from './labels';

/** The shape of a modifier row, as loose as it needs to be for both callers' queries. */
export interface CupModifierSource {
  name?: string | null;
  display_order?: number | null;
  group?: { name?: string | null; display_order?: number | null } | null;
}

/** One row of `order_items`, with whatever the caller happened to join onto it. */
export interface CupItemSource {
  id: string;
  quantity?: number | null;
  special_instructions?: string | null;
  menu_item?: { name?: string | null } | null;
  order_item_modifiers?: ({ modifier?: CupModifierSource | null } | null)[] | null;
}

export interface Cup {
  /** 1-based across the whole order — the number printed on the label. */
  cupIndex: number;
  cupTotal: number;
  /** Which order_item this cup came from, and which of that item's cups it is. */
  itemId: string;
  itemCupIndex: number;
  itemCupTotal: number;
  drinkName: string;
  /** Grouped for the label (one line per modifier category). */
  modifierLines: LabelModifierLine[];
  /** The same options flattened — what drinkTemperature() wants. */
  modifierNames: string[];
  note: string | null;
}

/**
 * Groups an item's modifiers by category so each prints on its own line, ordered by
 * the group order set at /admin/modifiers (and options by their own order within it).
 * A query that didn't join the group falls into one unnamed group, which still prints.
 */
export function groupCupModifiers(
  rows: ({ modifier?: CupModifierSource | null } | null)[] | null | undefined,
): LabelModifierLine[] {
  const groups = new Map<string, { order: number; options: { name: string; order: number }[] }>();

  for (const row of rows ?? []) {
    const name = row?.modifier?.name;
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

/** Every cup in the order, in label order. */
export function orderCups(items: CupItemSource[] | null | undefined): Cup[] {
  const sorted = [...(items ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cupTotal = sorted.reduce((sum, item) => sum + Math.max(item.quantity ?? 1, 1), 0);

  const cups: Cup[] = [];
  let cupIndex = 0;

  for (const item of sorted) {
    const modifierLines = groupCupModifiers(item.order_item_modifiers);
    const modifierNames = modifierLines.flatMap((line) => line.options);
    const drinkName = item.menu_item?.name ?? 'Drink';
    const itemCupTotal = Math.max(item.quantity ?? 1, 1);

    for (let i = 0; i < itemCupTotal; i++) {
      cupIndex++;
      cups.push({
        cupIndex,
        cupTotal,
        itemId: item.id,
        itemCupIndex: i + 1,
        itemCupTotal,
        drinkName,
        modifierLines,
        modifierNames,
        note: item.special_instructions?.trim() || null,
      });
    }
  }

  return cups;
}

/**
 * Which cups a print request is for. NULL/empty in the database means the whole order —
 * that's what every print was before per-cup printing existed, and what the agent must
 * keep doing for a shop that hasn't run the migration.
 */
export function cupsToPrint(cups: Cup[], requested: number[] | null | undefined): Cup[] {
  if (!requested || requested.length === 0) return cups;
  const wanted = new Set(requested);
  const picked = cups.filter((c) => wanted.has(c.cupIndex));
  // A request for a cup that no longer exists (the order was edited) would otherwise
  // print nothing at all and look like a dead button — print the order instead.
  return picked.length > 0 ? picked : cups;
}
