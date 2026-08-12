'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import type { ModifierGroup, Modifier } from '@/types';
import { SwitchField } from '@/components/ui/List';
import IOSSpinner from '@/components/ui/Spinner';

type GroupWithMods = ModifierGroup & { modifiers: Modifier[] };

/** The one ordering rule — same as the customer menu's, so admin previews the real thing. */
function sortByOrder<T extends { display_order: number; name?: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? ''),
  );
}

export default function AdminModifiersPage() {
  const [groups, setGroups] = useState<GroupWithMods[]>([]);
  const [loading, setLoading] = useState(true);
  const [editGroup, setEditGroup] = useState<Partial<ModifierGroup> | null>(null);
  const [editMod, setEditMod] = useState<(Partial<Modifier> & { _groupId?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const { data: groupData } = await supabase.from('modifier_groups').select('*').order('display_order');
    const { data: modData } = await supabase.from('modifiers').select('*').order('display_order');

    const groupsWithMods = (groupData || []).map((g) => ({
      ...g,
      modifiers: (modData || []).filter((m) => m.group_id === g.id),
    }));
    setGroups(groupsWithMods);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function saveGroup() {
    if (!editGroup) return;
    setSaving(true);
    if (editGroup.id) {
      await supabase.from('modifier_groups').update({
        name: editGroup.name, is_required: editGroup.is_required,
        allow_multiple: editGroup.allow_multiple, display_order: editGroup.display_order,
      }).eq('id', editGroup.id);
    } else {
      await supabase.from('modifier_groups').insert({
        name: editGroup.name, is_required: editGroup.is_required || false,
        allow_multiple: editGroup.allow_multiple || false, display_order: groups.length,
      });
    }
    setSaving(false); setEditGroup(null); fetchData();
  }

  async function saveMod() {
    if (!editMod) return;
    setSaving(true);
    const groupId = editMod.group_id || editMod._groupId;
    if (editMod.id) {
      await supabase.from('modifiers').update({
        name: editMod.name, price_adjustment: editMod.price_adjustment,
        is_default: editMod.is_default, is_available: editMod.is_available,
      }).eq('id', editMod.id);
    } else {
      const group = groups.find((g) => g.id === groupId);
      const nextOrder = group ? group.modifiers.length : 0;
      await supabase.from('modifiers').insert({
        group_id: groupId, name: editMod.name,
        price_adjustment: editMod.price_adjustment || 0,
        is_default: editMod.is_default || false, is_available: editMod.is_available ?? true,
        display_order: nextOrder,
      });
    }
    setSaving(false); setEditMod(null); fetchData();
  }

  async function toggleModAvailable(mod: Modifier) {
    const { error } = await supabase
      .from('modifiers')
      .update({ is_available: !mod.is_available })
      .eq('id', mod.id);
    if (error) {
      alert(`Could not update availability: ${error.message}`);
      return;
    }
    fetchData();
  }

  /**
   * Reorders a list and renumbers EVERY row 0,1,2,…
   *
   * Swapping just the two rows' display_order values looks equivalent but isn't:
   * seeded rows all share display_order = 0, so a swap writes 0 over 0 and the
   * ▲/▼ button appears to do nothing. Renumbering the whole list repairs the
   * ties on the first click.
   */
  async function persistOrder(
    table: 'modifier_groups' | 'modifiers',
    list: { id: string; display_order: number }[],
    movingId: string,
    direction: 'up' | 'down',
  ) {
    const sorted = sortByOrder(list);
    const idx = sorted.findIndex((r) => r.id === movingId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;

    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];

    const results = await Promise.all(
      sorted.map((row, i) =>
        supabase.from(table).update({ display_order: i }).eq('id', row.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) alert(`Could not save the new order: ${failed.error.message}`);
    fetchData();
  }

  const moveGroup = (group: ModifierGroup, direction: 'up' | 'down') =>
    persistOrder('modifier_groups', groups, group.id, direction);

  const moveMod = (groupId: string, mod: Modifier, direction: 'up' | 'down') => {
    const group = groups.find((g) => g.id === groupId);
    if (group) persistOrder('modifiers', group.modifiers, mod.id, direction);
  };

  if (loading) return <div className="flex justify-center py-20"><IOSSpinner size={28} /></div>;

  const sortedGroups = sortByOrder(groups);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-ios-largetitle text-label">Modifier Groups</h1>
          <p className="text-ios-subhead text-label-secondary mt-0.5">
            The ▲/▼ order here is the order customers see when they customize a drink.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditGroup({ name: '', is_required: false, allow_multiple: false, display_order: groups.length })}>
          + Group
        </Button>
      </div>

      <div className="space-y-4">
        {sortedGroups.map((group, gIdx) => {
          const sortedMods = sortByOrder(group.modifiers);
          return (
            <Card key={group.id}>
              {/* Group header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {/* Group reorder */}
                  <div className="flex flex-col gap-0.5 mr-1">
                    <button
                      onClick={() => moveGroup(group, 'up')}
                      disabled={gIdx === 0}
                      className="w-5 h-4 flex items-center justify-center text-text-light hover:text-primary disabled:opacity-20 cursor-pointer text-xs"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveGroup(group, 'down')}
                      disabled={gIdx === sortedGroups.length - 1}
                      className="w-5 h-4 flex items-center justify-center text-text-light hover:text-primary disabled:opacity-20 cursor-pointer text-xs"
                    >
                      ▼
                    </button>
                  </div>
                  <h2 className="text-ios-headline text-label">{group.name}</h2>
                  {group.is_required && <Badge variant="danger">Required</Badge>}
                  {group.allow_multiple && <Badge variant="secondary">Multi-select</Badge>}
                  <span className="text-xs text-text-light">({sortedMods.length} options)</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditMod({ _groupId: group.id, name: '', price_adjustment: 0, is_default: false, is_available: true })}
                    className="text-sm text-primary hover:underline cursor-pointer px-2 py-1"
                  >
                    + Option
                  </button>
                  <button
                    onClick={() => setEditGroup(group)}
                    className="text-sm text-text-light hover:underline cursor-pointer px-2 py-1"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {/* Modifiers list */}
              <div className="space-y-1">
                {sortedMods.map((mod, mIdx) => (
                  <div key={mod.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                    {/* Modifier reorder */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveMod(group.id, mod, 'up')}
                        disabled={mIdx === 0}
                        className="w-5 h-4 flex items-center justify-center text-text-light hover:text-primary disabled:opacity-20 cursor-pointer text-xs"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveMod(group.id, mod, 'down')}
                        disabled={mIdx === sortedMods.length - 1}
                        className="w-5 h-4 flex items-center justify-center text-text-light hover:text-primary disabled:opacity-20 cursor-pointer text-xs"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-sm">{mod.name}</span>
                      {mod.price_adjustment > 0 && (
                        <span className="text-xs text-primary font-accent">+${mod.price_adjustment.toFixed(2)}</span>
                      )}
                      {mod.is_default && <Badge variant="primary">Default</Badge>}
                      {!mod.is_available && <Badge variant="neutral">Hidden</Badge>}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleModAvailable(mod)}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                          mod.is_available
                            ? 'border-gray-200 text-text-light hover:bg-gray-50'
                            : 'border-success/30 text-success hover:bg-success/5'
                        }`}
                      >
                        {mod.is_available ? 'Hide' : 'Show'}
                      </button>
                      <button onClick={() => setEditMod(mod)} className="text-xs text-primary hover:underline cursor-pointer px-1.5 py-1">Edit</button>
                    </div>
                  </div>
                ))}
                {sortedMods.length === 0 && (
                  <p className="text-sm text-text-light px-3 py-2">No options yet — click &quot;+ Option&quot; to add some</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Group Modal */}
      <Modal isOpen={!!editGroup} onClose={() => setEditGroup(null)} title={editGroup?.id ? 'Edit Group' : 'New Group'} size="sm">
        {editGroup && (
          <div className="space-y-4">
            <Input label="Name" value={editGroup.name || ''} onChange={(e) => setEditGroup({ ...editGroup, name: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <SwitchField
                label="Required"
                help="Customer must choose one"
                checked={editGroup.is_required || false}
                onChange={(v) => setEditGroup({ ...editGroup, is_required: v })}
              />
              <SwitchField
                label="Allow multiple"
                help="More than one option"
                checked={editGroup.allow_multiple || false}
                onChange={(v) => setEditGroup({ ...editGroup, allow_multiple: v })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditGroup(null)}>Cancel</Button>
              <Button onClick={saveGroup} disabled={saving || !editGroup.name}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modifier Modal */}
      <Modal isOpen={!!editMod} onClose={() => setEditMod(null)} title={editMod?.id ? 'Edit Option' : 'New Option'} size="sm">
        {editMod && (
          <div className="space-y-4">
            <Input label="Name" value={editMod.name || ''} onChange={(e) => setEditMod({ ...editMod, name: e.target.value })} />
            <Input label="Price Adjustment ($)" type="number" step="0.01" min="0" value={editMod.price_adjustment || 0} onChange={(e) => setEditMod({ ...editMod, price_adjustment: parseFloat(e.target.value) })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <SwitchField
                label="Default"
                help="Pre-selected for customers"
                checked={editMod.is_default || false}
                onChange={(v) => setEditMod({ ...editMod, is_default: v })}
              />
              <SwitchField
                label="Available"
                checked={editMod.is_available ?? true}
                onChange={(v) => setEditMod({ ...editMod, is_available: v })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditMod(null)}>Cancel</Button>
              <Button onClick={saveMod} disabled={saving || !editMod.name}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
