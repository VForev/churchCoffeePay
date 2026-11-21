'use client';

import { supabase } from './supabase';

interface DeductLine {
  menuItemId: string;
  modifierIds: string[];
  quantity: number;
}

/**
 * Take an order's ingredients off the stock counts, and log each one.
 *
 * This used to run two queries per drink and two more per add-in, one after another,
 * plus an update and an insert per ingredient — dozens of round trips on church wifi,
 * all of them standing between the customer and their confirmation screen. Now it is:
 * one read of every ingredient the order touches, one update per inventory item that
 * actually changes, and one insert for the whole log.
 *
 * Best-effort, like it always was: the order is already placed, so a failure here is a
 * stock count that's slightly off, never a lost coffee. Never throws.
 */
export async function deductInventory(orderId: string, lines: DeductLine[]): Promise<void> {
  try {
    const itemIds = [...new Set(lines.map((l) => l.menuItemId))];
    const modIds = [...new Set(lines.flatMap((l) => l.modifierIds))];
    if (itemIds.length === 0 && modIds.length === 0) return;

    const filters = [
      itemIds.length > 0 ? `menu_item_id.in.(${itemIds.join(',')})` : null,
      modIds.length > 0 ? `modifier_id.in.(${modIds.join(',')})` : null,
    ].filter(Boolean);

    const { data: links, error } = await supabase
      .from('item_ingredients')
      .select('menu_item_id, modifier_id, inventory_item_id, quantity_used, inventory_item:inventory_items(current_stock)')
      .or(filters.join(','));

    if (error || !links || links.length === 0) return;

    type Link = {
      menu_item_id: string | null;
      modifier_id: string | null;
      inventory_item_id: string;
      quantity_used: number;
      inventory_item: { current_stock: number } | null;
    };

    // How much of each inventory item this order uses, across every drink and add-in.
    const used = new Map<string, number>();
    const stock = new Map<string, number>();
    for (const link of links as unknown as Link[]) {
      if (link.inventory_item) stock.set(link.inventory_item_id, link.inventory_item.current_stock);
      for (const line of lines) {
        const applies =
          (link.menu_item_id && link.menu_item_id === line.menuItemId) ||
          (link.modifier_id && line.modifierIds.includes(link.modifier_id));
        if (applies) {
          used.set(
            link.inventory_item_id,
            (used.get(link.inventory_item_id) ?? 0) + link.quantity_used * line.quantity,
          );
        }
      }
    }

    await Promise.all([
      ...[...used].map(([inventoryItemId, amount]) =>
        supabase
          .from('inventory_items')
          .update({ current_stock: (stock.get(inventoryItemId) ?? 0) - amount })
          .eq('id', inventoryItemId),
      ),
      supabase.from('inventory_log').insert(
        [...used].map(([inventoryItemId, amount]) => ({
          inventory_item_id: inventoryItemId,
          change_amount: -amount,
          reason: 'order',
          order_id: orderId,
        })),
      ),
    ]);
  } catch {
    // Best-effort — see above.
  }
}
