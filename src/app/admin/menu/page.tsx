'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { TextArea } from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { SwitchField } from '@/components/ui/List';
import IOSSpinner from '@/components/ui/Spinner';
import type {
  Category,
  MenuItem,
  ModifierGroup,
  Modifier,
  ItemModifierOverride,
} from '@/types';

/** How a single option behaves on one specific drink. */
type OptionState = 'shown' | 'hidden' | 'locked';

const OPTION_STATES: { value: OptionState; label: string; help: string }[] = [
  { value: 'shown', label: 'Shown', help: 'Customer can pick it' },
  { value: 'hidden', label: 'Hidden', help: 'Not offered on this drink' },
  { value: 'locked', label: 'Locked', help: 'Always included, cannot be removed' },
];

export default function AdminMenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Partial<MenuItem> | null>(null);
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const [catRes, itemRes] = await Promise.all([
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('menu_items').select('*').order('display_order'),
    ]);
    if (catRes.data) setCategories(catRes.data);
    if (itemRes.data) setItems(itemRes.data);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function saveItem() {
    if (!editItem) return;
    setSaving(true);
    if (editItem.id) {
      await supabase.from('menu_items').update({
        name: editItem.name,
        description: editItem.description,
        category_id: editItem.category_id,
        base_price: editItem.base_price,
        is_free: editItem.is_free,
        is_available: editItem.is_available,
        image_url: editItem.image_url,
        display_order: editItem.display_order,
      }).eq('id', editItem.id);
    } else {
      const maxOrder = items.filter((i) => i.category_id === editItem.category_id).length;
      await supabase.from('menu_items').insert({
        name: editItem.name,
        description: editItem.description,
        category_id: editItem.category_id,
        base_price: editItem.base_price || 0,
        is_free: editItem.is_free || false,
        is_available: editItem.is_available ?? true,
        image_url: editItem.image_url,
        display_order: maxOrder,
      });
    }
    setSaving(false);
    setEditItem(null);
    fetchData();
  }

  async function saveCat() {
    if (!editCat) return;
    setSaving(true);
    if (editCat.id) {
      await supabase.from('categories').update({
        name: editCat.name,
        display_order: editCat.display_order,
        is_active: editCat.is_active,
      }).eq('id', editCat.id);
    } else {
      await supabase.from('categories').insert({
        name: editCat.name,
        display_order: categories.length,
        is_active: editCat.is_active ?? true,
      });
    }
    setSaving(false);
    setEditCat(null);
    fetchData();
  }

  async function moveCategory(cat: Category, direction: 'up' | 'down') {
    const sorted = [...categories].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const other = sorted[swapIdx];
    await Promise.all([
      supabase.from('categories').update({ display_order: other.display_order }).eq('id', cat.id),
      supabase.from('categories').update({ display_order: cat.display_order }).eq('id', other.id),
    ]);
    fetchData();
  }

  async function moveItem(item: MenuItem, direction: 'up' | 'down') {
    const catItems = [...items]
      .filter((i) => i.category_id === item.category_id)
      .sort((a, b) => a.display_order - b.display_order);
    const idx = catItems.findIndex((i) => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= catItems.length) return;

    const other = catItems[swapIdx];
    await Promise.all([
      supabase.from('menu_items').update({ display_order: other.display_order }).eq('id', item.id),
      supabase.from('menu_items').update({ display_order: item.display_order }).eq('id', other.id),
    ]);
    fetchData();
  }

  async function toggleAvailable(item: MenuItem) {
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id);
    if (error) {
      alert(`Could not update availability: ${error.message}`);
      return;
    }
    fetchData();
  }

  /** Baristas normally do this from their dashboard; admins can undo it here. */
  async function toggleSoldOut(item: MenuItem) {
    const { error } = await supabase
      .from('menu_items')
      .update({ is_sold_out: !item.is_sold_out })
      .eq('id', item.id);
    if (error) {
      alert(`Could not update stock: ${error.message}`);
      return;
    }
    fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><IOSSpinner size={28} /></div>;

  const sortedCats = [...categories].sort((a, b) => a.display_order - b.display_order);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-ios-largetitle text-label">Menu Management</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="border border-gray-200" onClick={() => setEditCat({ name: '', display_order: categories.length, is_active: true })}>
            + Category
          </Button>
          <Button size="sm" onClick={() => setEditItem({ name: '', description: '', category_id: sortedCats[0]?.id, base_price: 0, is_free: false, is_available: true, display_order: 0 })}>
            + Menu Item
          </Button>
        </div>
      </div>

      {/* Categories */}
      <Card className="mb-6">
        <h2 className="text-ios-headline text-label mb-3">Categories</h2>
        <div className="space-y-1">
          {sortedCats.map((cat, idx) => (
            <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50">
              <div className="flex items-center gap-2">
                {/* Reorder arrows */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveCategory(cat, 'up')}
                    disabled={idx === 0}
                    className="w-6 h-5 flex items-center justify-center text-text-light hover:text-primary disabled:opacity-20 cursor-pointer text-xs leading-none"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveCategory(cat, 'down')}
                    disabled={idx === sortedCats.length - 1}
                    className="w-6 h-5 flex items-center justify-center text-text-light hover:text-primary disabled:opacity-20 cursor-pointer text-xs leading-none"
                  >
                    ▼
                  </button>
                </div>
                <span className="font-body">{cat.name}</span>
                <Badge variant={cat.is_active ? 'success' : 'neutral'}>
                  {cat.is_active ? 'Active' : 'Hidden'}
                </Badge>
              </div>
              <button onClick={() => setEditCat(cat)} className="text-sm text-primary hover:underline cursor-pointer px-2 py-1">
                Edit
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Menu Items grouped by category */}
      {sortedCats.map((cat) => {
        const catItems = [...items]
          .filter((i) => i.category_id === cat.id)
          .sort((a, b) => a.display_order - b.display_order);
        return (
          <div key={cat.id} className="mb-6">
            <h2 className="font-heading font-bold text-lg text-text-dark mb-3">{cat.name}</h2>
            <div className="space-y-2">
              {catItems.map((item, idx) => (
                <Card key={item.id}>
                  <div className="flex items-center gap-3">
                    {/* Reorder arrows */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveItem(item, 'up')}
                        disabled={idx === 0}
                        className="w-6 h-5 flex items-center justify-center text-text-light hover:text-primary disabled:opacity-20 cursor-pointer text-xs"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveItem(item, 'down')}
                        disabled={idx === catItems.length - 1}
                        className="w-6 h-5 flex items-center justify-center text-text-light hover:text-primary disabled:opacity-20 cursor-pointer text-xs"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading font-bold text-sm">{item.name}</span>
                        {item.is_free ? (
                          <Badge variant="success">Free</Badge>
                        ) : (
                          <span className="text-sm font-accent text-primary">${item.base_price.toFixed(2)}</span>
                        )}
                        {!item.is_available && <Badge variant="danger">Unavailable</Badge>}
                        {item.is_sold_out && <Badge variant="danger">Sold Out</Badge>}
                      </div>
                      {item.description && <p className="text-xs text-text-light mt-0.5 truncate">{item.description}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {item.is_sold_out && (
                        <button
                          onClick={() => toggleSoldOut(item)}
                          className="cursor-pointer rounded-lg border border-success/30 px-2 py-1 text-xs text-success transition-colors hover:bg-success/5"
                        >
                          Restock
                        </button>
                      )}
                      <button
                        onClick={() => setOptionsItem(item)}
                        className="cursor-pointer rounded-lg border border-gray-200 px-2 py-1 text-xs text-text-light transition-colors hover:bg-gray-50"
                      >
                        Options
                      </button>
                      <button
                        onClick={() => toggleAvailable(item)}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                          item.is_available
                            ? 'border-gray-200 text-text-light hover:bg-gray-50'
                            : 'border-success/30 text-success hover:bg-success/5'
                        }`}
                      >
                        {item.is_available ? 'Hide' : 'Show'}
                      </button>
                      <button onClick={() => setEditItem(item)} className="text-sm text-primary hover:underline cursor-pointer px-2 py-1">Edit</button>
                    </div>
                  </div>
                </Card>
              ))}
              {catItems.length === 0 && <p className="text-sm text-text-light px-4">No items</p>}
            </div>
          </div>
        );
      })}

      {/* Edit Item Modal */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title={editItem?.id ? 'Edit Item' : 'New Item'}>
        {editItem && (
          <div className="space-y-4">
            <Input label="Name" value={editItem.name || ''} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} required />
            <TextArea label="Description" value={editItem.description || ''} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} rows={2} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-accent font-semibold text-text mb-1.5">Category</label>
                <select
                  value={editItem.category_id || ''}
                  onChange={(e) => setEditItem({ ...editItem, category_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-surface font-body text-text-dark"
                >
                  {sortedCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <Input label="Price" type="number" step="0.01" min="0" value={editItem.base_price || 0} onChange={(e) => setEditItem({ ...editItem, base_price: parseFloat(e.target.value) })} />
            </div>
            <Input label="Image URL" value={editItem.image_url || ''} onChange={(e) => setEditItem({ ...editItem, image_url: e.target.value })} placeholder="https://..." />
            <div className="grid gap-2 sm:grid-cols-2">
              <SwitchField
                label="Free item"
                checked={editItem.is_free || false}
                onChange={(v) => setEditItem({ ...editItem, is_free: v })}
              />
              <SwitchField
                label="Available"
                checked={editItem.is_available ?? true}
                onChange={(v) => setEditItem({ ...editItem, is_available: v })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditItem(null)}>Cancel</Button>
              <Button onClick={saveItem} disabled={saving || !editItem.name}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Per-drink options */}
      {optionsItem && (
        <ItemOptionsModal item={optionsItem} onClose={() => setOptionsItem(null)} />
      )}

      {/* Edit Category Modal */}
      <Modal isOpen={!!editCat} onClose={() => setEditCat(null)} title={editCat?.id ? 'Edit Category' : 'New Category'} size="sm">
        {editCat && (
          <div className="space-y-4">
            <Input label="Name" value={editCat.name || ''} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} required />
            <SwitchField
              label="Active"
              help="Visible to customers"
              checked={editCat.is_active ?? true}
              onChange={(v) => setEditCat({ ...editCat, is_active: v })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditCat(null)}>Cancel</Button>
              <Button onClick={saveCat} disabled={saving || !editCat.name}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * Per-drink modifier control.
 *
 * Modifier groups are shared across the menu, so this is where one drink opts out
 * of options the others keep: an Americano turns the whole Milk group off, while a
 * Latte can lock "Whole Milk" as always-included.
 */
function ItemOptionsModal({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [linkedGroupIds, setLinkedGroupIds] = useState<Set<string>>(new Set());
  const [optionStates, setOptionStates] = useState<Record<string, OptionState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [groupRes, modRes, linkRes, overrideRes] = await Promise.all([
      supabase.from('modifier_groups').select('*').order('display_order'),
      supabase.from('modifiers').select('*').eq('is_available', true).order('display_order'),
      supabase.from('item_modifier_groups').select('*').eq('menu_item_id', item.id),
      supabase.from('item_modifier_overrides').select('*').eq('menu_item_id', item.id),
    ]);

    setGroups(groupRes.data ?? []);
    setModifiers(modRes.data ?? []);
    setLinkedGroupIds(new Set((linkRes.data ?? []).map((l) => l.modifier_group_id)));

    const states: Record<string, OptionState> = {};
    for (const o of (overrideRes.data ?? []) as ItemModifierOverride[]) {
      states[o.modifier_id] = o.is_hidden ? 'hidden' : o.is_locked ? 'locked' : 'shown';
    }
    setOptionStates(states);
    setLoading(false);
  }, [item.id]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleGroup(groupId: string) {
    setLinkedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function setOption(modifierId: string, state: OptionState) {
    setOptionStates((prev) => ({ ...prev, [modifierId]: state }));
  }

  async function save() {
    setSaving(true);
    setError('');

    // Rewrite this item's group links to match the checkboxes.
    const { error: deleteLinksError } = await supabase
      .from('item_modifier_groups')
      .delete()
      .eq('menu_item_id', item.id);

    const linkRows = Array.from(linkedGroupIds).map((groupId, idx) => ({
      menu_item_id: item.id,
      modifier_group_id: groupId,
      display_order: idx,
    }));

    const { error: insertLinksError } = linkRows.length
      ? await supabase.from('item_modifier_groups').insert(linkRows)
      : { error: null };

    // Rewrite the overrides. Only non-default states need a row.
    const { error: deleteOverridesError } = await supabase
      .from('item_modifier_overrides')
      .delete()
      .eq('menu_item_id', item.id);

    const overrideRows = Object.entries(optionStates)
      .filter(([modifierId, state]) => {
        if (state === 'shown') return false;
        // Drop overrides for options whose group is no longer on this drink.
        const mod = modifiers.find((m) => m.id === modifierId);
        return mod ? linkedGroupIds.has(mod.group_id) : false;
      })
      .map(([modifierId, state]) => ({
        menu_item_id: item.id,
        modifier_id: modifierId,
        is_hidden: state === 'hidden',
        is_locked: state === 'locked',
      }));

    const { error: insertOverridesError } = overrideRows.length
      ? await supabase.from('item_modifier_overrides').insert(overrideRows)
      : { error: null };

    setSaving(false);

    const failure =
      deleteLinksError || insertLinksError || deleteOverridesError || insertOverridesError;
    if (failure) {
      setError(failure.message);
      return;
    }
    onClose();
  }

  const footer = (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
      {error ? (
        <p className="min-w-0 flex-1 truncate text-sm text-danger">{error}</p>
      ) : (
        <p className="min-w-0 flex-1 text-ios-caption text-label-secondary">
          Applies to {item.name} only.
        </p>
      )}
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save Options'}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} title={`${item.name} — Options`} size="lg" footer={footer}>
      {loading ? (
        <div className="flex justify-center py-12">
          <IOSSpinner size={22} />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="rounded-xl bg-primary/5 px-4 py-3 font-body text-sm text-text">
            Pick which option groups this drink offers. Inside a group you can hide an option or
            lock it as always-included — for example, an Americano turns{' '}
            <strong className="font-accent">Milk</strong> off entirely.
          </p>

          {groups.length === 0 && (
            <p className="py-6 text-center text-sm text-text-light">
              No modifier groups exist yet. Create them under Modifiers.
            </p>
          )}

          {groups.map((group) => {
            const linked = linkedGroupIds.has(group.id);
            const groupMods = modifiers.filter((m) => m.group_id === group.id);
            const lockedCount = groupMods.filter(
              (m) => optionStates[m.id] === 'locked',
            ).length;
            const hiddenCount = groupMods.filter((m) => optionStates[m.id] === 'hidden').length;

            return (
              <div
                key={group.id}
                className={cn(
                  'rounded-2xl border-2 p-4 transition-colors',
                  linked ? 'border-primary/25 bg-primary/[0.03]' : 'border-gray-100 bg-surface',
                )}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={linked}
                    onChange={() => toggleGroup(group.id)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'font-accent text-sm font-bold',
                          linked ? 'text-primary' : 'text-text-light',
                        )}
                      >
                        {group.name}
                      </span>
                      {group.is_required && <Badge variant="danger">Required</Badge>}
                      {group.allow_multiple && <Badge variant="neutral">Multi-select</Badge>}
                      {linked && lockedCount > 0 && (
                        <Badge variant="primary">
                          {lockedCount} locked
                        </Badge>
                      )}
                      {linked && hiddenCount > 0 && (
                        <Badge variant="neutral">{hiddenCount} hidden</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-ios-caption text-label-secondary">
                      {linked
                        ? `${groupMods.length} option${groupMods.length !== 1 ? 's' : ''} on this drink`
                        : 'Not offered on this drink'}
                    </p>
                  </div>
                </label>

                {linked && groupMods.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                    {!group.allow_multiple && lockedCount > 1 && (
                      <p className="rounded-lg bg-warning/10 px-3 py-2 font-body text-xs text-warning">
                        {group.name} lets the customer pick only one, so locking more than one
                        option won&apos;t work — only the first will apply.
                      </p>
                    )}

                    {groupMods.map((mod) => {
                      const state = optionStates[mod.id] ?? 'shown';
                      return (
                        <div
                          key={mod.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="min-w-0 font-body text-sm text-text-dark">
                            {mod.name}
                            {mod.price_adjustment > 0 && (
                              <span className="ml-1.5 font-accent text-xs text-text-light">
                                +${mod.price_adjustment.toFixed(2)}
                              </span>
                            )}
                            {mod.is_sold_out && (
                              <span className="ml-1.5 font-accent text-xs font-semibold text-danger">
                                Sold out
                              </span>
                            )}
                          </span>

                          <div className="flex shrink-0 overflow-hidden rounded-lg border border-gray-200">
                            {OPTION_STATES.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                title={opt.help}
                                onClick={() => setOption(mod.id, opt.value)}
                                className={cn(
                                  'cursor-pointer px-3 py-1.5 font-accent text-xs font-semibold transition-colors',
                                  state === opt.value
                                    ? opt.value === 'hidden'
                                      ? 'bg-danger text-white'
                                      : opt.value === 'locked'
                                        ? 'bg-primary text-white'
                                        : 'bg-success text-white'
                                    : 'bg-surface text-text-light hover:bg-gray-50',
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
