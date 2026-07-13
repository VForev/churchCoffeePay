'use client';

import { supabase } from './supabase';
import type { ModifierGroup, Modifier, ItemModifierOverride } from '@/types';

/**
 * Loads the modifier groups for one drink, with that drink's per-item overrides applied.
 *
 * Hidden options are dropped entirely (an Americano hides every Milk option).
 * Locked options are flagged so the UI can show them as always-included and
 * refuse to let the customer remove them.
 *
 * Sold-out options are kept so the UI can grey them out and say why — the
 * customer should see that we're out of oat milk, not just wonder where it went.
 */
export async function fetchItemModifierGroups(menuItemId: string): Promise<ModifierGroup[]> {
  const { data: links } = await supabase
    .from('item_modifier_groups')
    .select('modifier_group_id')
    .eq('menu_item_id', menuItemId);

  if (!links || links.length === 0) return [];

  const groupIds = links.map((l) => l.modifier_group_id);

  const [groupsRes, modsRes, overridesRes] = await Promise.all([
    supabase.from('modifier_groups').select('*').in('id', groupIds),
    supabase
      .from('modifiers')
      .select('*')
      .in('group_id', groupIds)
      .eq('is_available', true)
      .order('display_order'),
    supabase
      .from('item_modifier_overrides')
      .select('*')
      .eq('menu_item_id', menuItemId),
  ]);

  if (!groupsRes.data) return [];

  const overrides = (overridesRes.data ?? []) as ItemModifierOverride[];
  const hidden = new Set(overrides.filter((o) => o.is_hidden).map((o) => o.modifier_id));
  const locked = new Set(overrides.filter((o) => o.is_locked).map((o) => o.modifier_id));

  const mods = ((modsRes.data ?? []) as Modifier[])
    .filter((m) => !hidden.has(m.id))
    .map((m) => ({ ...m, is_locked: locked.has(m.id) }));

  return (groupsRes.data as ModifierGroup[])
    .map((g) => ({
      ...g,
      modifiers: mods
        .filter((m) => m.group_id === g.id)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name)),
    }))
    // A group whose options are all hidden on this drink shouldn't render at all.
    .filter((g) => (g.modifiers?.length ?? 0) > 0)
    // Groups appear in the order set at /admin/modifiers — one list, every drink.
    // (The link table has its own display_order, but nothing sets it meaningfully,
    // so ordering by it silently ignored the admin's ▲/▼ buttons.)
    .sort(
      (a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name),
    );
}

/** Options the customer can actually pick right now — not sold out, not locked. */
export function selectableModifiers(group: ModifierGroup): Modifier[] {
  return (group.modifiers ?? []).filter((m) => !m.is_sold_out && !m.is_locked);
}

/** Options force-applied to this drink, which the customer cannot remove. */
export function lockedModifiers(group: ModifierGroup): Modifier[] {
  return (group.modifiers ?? []).filter((m) => m.is_locked && !m.is_sold_out);
}
