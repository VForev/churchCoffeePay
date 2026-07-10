'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { TextArea } from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import type { Category, MenuItem } from '@/types';

export default function AdminMenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Partial<MenuItem> | null>(null);
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
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

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) {
      alert(
        error.code === '23503'
          ? 'This item appears in past orders, so deleting it would break the order history. Edit it and uncheck "Available" to hide it from the menu instead.'
          : `Could not delete this item: ${error.message}`,
      );
      return;
    }
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
    await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id);
    fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  const sortedCats = [...categories].sort((a, b) => a.display_order - b.display_order);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-heading font-bold text-text-dark">Menu Management</h1>
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
        <h2 className="font-heading font-bold text-text-dark mb-3">Categories</h2>
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
                      </div>
                      {item.description && <p className="text-xs text-text-light mt-0.5 truncate">{item.description}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
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
                      <button onClick={() => deleteItem(item.id)} className="text-sm text-danger hover:underline cursor-pointer px-2 py-1">Del</button>
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
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editItem.is_free || false} onChange={(e) => setEditItem({ ...editItem, is_free: e.target.checked })} className="accent-primary w-4 h-4" />
                <span className="text-sm font-body">Free item</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editItem.is_available ?? true} onChange={(e) => setEditItem({ ...editItem, is_available: e.target.checked })} className="accent-primary w-4 h-4" />
                <span className="text-sm font-body">Available</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditItem(null)}>Cancel</Button>
              <Button onClick={saveItem} disabled={saving || !editItem.name}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Category Modal */}
      <Modal isOpen={!!editCat} onClose={() => setEditCat(null)} title={editCat?.id ? 'Edit Category' : 'New Category'} size="sm">
        {editCat && (
          <div className="space-y-4">
            <Input label="Name" value={editCat.name || ''} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} required />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editCat.is_active ?? true} onChange={(e) => setEditCat({ ...editCat, is_active: e.target.checked })} className="accent-primary w-4 h-4" />
              <span className="text-sm font-body">Active (visible to customers)</span>
            </label>
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
