'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import type { ModifierGroup, Modifier } from '@/types';

export default function AdminModifiersPage() {
  const [groups, setGroups] = useState<(ModifierGroup & { modifiers: Modifier[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editGroup, setEditGroup] = useState<Partial<ModifierGroup> | null>(null);
  const [editMod, setEditMod] = useState<(Partial<Modifier> & { _groupId?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const { data: groupData } = await supabase.from('modifier_groups').select('*').order('display_order');
    const { data: modData } = await supabase.from('modifiers').select('*');

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
        allow_multiple: editGroup.allow_multiple || false, display_order: editGroup.display_order || 0,
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
      await supabase.from('modifiers').insert({
        group_id: groupId, name: editMod.name,
        price_adjustment: editMod.price_adjustment || 0,
        is_default: editMod.is_default || false, is_available: editMod.is_available ?? true,
      });
    }
    setSaving(false); setEditMod(null); fetchData();
  }

  async function deleteMod(id: string) {
    await supabase.from('modifiers').delete().eq('id', id);
    fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold text-text-dark">Modifier Groups</h1>
        <Button size="sm" onClick={() => setEditGroup({ name: '', is_required: false, allow_multiple: false, display_order: 0 })}>
          + Group
        </Button>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <Card key={group.id}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-bold text-text-dark">{group.name}</h2>
                {group.is_required && <Badge variant="danger">Required</Badge>}
                {group.allow_multiple && <Badge variant="secondary">Multi</Badge>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditMod({ _groupId: group.id, name: '', price_adjustment: 0, is_default: false, is_available: true })} className="text-sm text-primary hover:underline cursor-pointer">+ Modifier</button>
                <button onClick={() => setEditGroup(group)} className="text-sm text-text-light hover:underline cursor-pointer">Edit Group</button>
              </div>
            </div>
            <div className="space-y-1">
              {group.modifiers.map((mod) => (
                <div key={mod.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-body">{mod.name}</span>
                    {mod.price_adjustment > 0 && <span className="text-xs text-primary font-accent">+${mod.price_adjustment.toFixed(2)}</span>}
                    {mod.is_default && <Badge variant="primary">Default</Badge>}
                    {!mod.is_available && <Badge variant="neutral">Hidden</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditMod(mod)} className="text-xs text-primary hover:underline cursor-pointer">Edit</button>
                    <button onClick={() => deleteMod(mod.id)} className="text-xs text-danger hover:underline cursor-pointer">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Group Modal */}
      <Modal isOpen={!!editGroup} onClose={() => setEditGroup(null)} title={editGroup?.id ? 'Edit Group' : 'New Group'} size="sm">
        {editGroup && (
          <div className="space-y-4">
            <Input label="Name" value={editGroup.name || ''} onChange={(e) => setEditGroup({ ...editGroup, name: e.target.value })} />
            <Input label="Display Order" type="number" value={editGroup.display_order || 0} onChange={(e) => setEditGroup({ ...editGroup, display_order: parseInt(e.target.value) })} />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editGroup.is_required || false} onChange={(e) => setEditGroup({ ...editGroup, is_required: e.target.checked })} className="accent-primary" />
                <span className="text-sm">Required</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editGroup.allow_multiple || false} onChange={(e) => setEditGroup({ ...editGroup, allow_multiple: e.target.checked })} className="accent-primary" />
                <span className="text-sm">Allow Multiple</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditGroup(null)}>Cancel</Button>
              <Button onClick={saveGroup} disabled={saving || !editGroup.name}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modifier Modal */}
      <Modal isOpen={!!editMod} onClose={() => setEditMod(null)} title={editMod?.id ? 'Edit Modifier' : 'New Modifier'} size="sm">
        {editMod && (
          <div className="space-y-4">
            <Input label="Name" value={editMod.name || ''} onChange={(e) => setEditMod({ ...editMod, name: e.target.value })} />
            <Input label="Price Adjustment" type="number" step="0.01" min="0" value={editMod.price_adjustment || 0} onChange={(e) => setEditMod({ ...editMod, price_adjustment: parseFloat(e.target.value) })} />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editMod.is_default || false} onChange={(e) => setEditMod({ ...editMod, is_default: e.target.checked })} className="accent-primary" />
                <span className="text-sm">Default</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editMod.is_available ?? true} onChange={(e) => setEditMod({ ...editMod, is_available: e.target.checked })} className="accent-primary" />
                <span className="text-sm">Available</span>
              </label>
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
