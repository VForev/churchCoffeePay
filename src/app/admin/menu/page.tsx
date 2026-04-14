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
      await supabase.from('menu_items').insert({
        name: editItem.name,
        description: editItem.description,
        category_id: editItem.category_id,
        base_price: editItem.base_price || 0,
        is_free: editItem.is_free || false,
        is_available: editItem.is_available ?? true,
        image_url: editItem.image_url,
        display_order: editItem.display_order || 0,
      });
    }
    setSaving(false);
    setEditItem(null);
    fetchData();
  }

  async function deleteItem(id: string) {
    await supabase.from('menu_items').delete().eq('id', id);
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
        display_order: editCat.display_order || 0,
        is_active: editCat.is_active ?? true,
      });
    }
    setSaving(false);
    setEditCat(null);
    fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold text-text-dark">Menu Management</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="border border-gray-200" onClick={() => setEditCat({ name: '', display_order: 0, is_active: true })}>
            + Category
          </Button>
          <Button size="sm" onClick={() => setEditItem({ name: '', description: '', category_id: categories[0]?.id, base_price: 0, is_free: false, is_available: true, display_order: 0 })}>
            + Menu Item
          </Button>
        </div>
      </div>

      {/* Categories */}
      <Card className="mb-6">
        <h2 className="font-heading font-bold text-text-dark mb-3">Categories</h2>
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="font-body">{cat.name}</span>
                <Badge variant={cat.is_active ? 'success' : 'neutral'}>
                  {cat.is_active ? 'Active' : 'Hidden'}
                </Badge>
              </div>
              <button onClick={() => setEditCat(cat)} className="text-sm text-primary hover:underline cursor-pointer">Edit</button>
            </div>
          ))}
        </div>
      </Card>

      {/* Menu Items grouped by category */}
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.category_id === cat.id);
        return (
          <div key={cat.id} className="mb-6">
            <h2 className="font-heading font-bold text-lg text-text-dark mb-3">{cat.name}</h2>
            <div className="space-y-2">
              {catItems.map((item) => (
                <Card key={item.id} className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-sm">{item.name}</span>
                      {item.is_free ? (
                        <Badge variant="success">Free</Badge>
                      ) : (
                        <span className="text-sm font-accent text-primary">${item.base_price.toFixed(2)}</span>
                      )}
                      {!item.is_available && <Badge variant="danger">Unavailable</Badge>}
                    </div>
                    {item.description && <p className="text-xs text-text-light mt-0.5">{item.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditItem(item)} className="text-sm text-primary hover:underline cursor-pointer">Edit</button>
                    <button onClick={() => deleteItem(item.id)} className="text-sm text-danger hover:underline cursor-pointer">Delete</button>
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
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <Input label="Price" type="number" step="0.01" min="0" value={editItem.base_price || 0} onChange={(e) => setEditItem({ ...editItem, base_price: parseFloat(e.target.value) })} />
            </div>
            <Input label="Image URL" value={editItem.image_url || ''} onChange={(e) => setEditItem({ ...editItem, image_url: e.target.value })} placeholder="https://..." />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editItem.is_free || false} onChange={(e) => setEditItem({ ...editItem, is_free: e.target.checked })} className="accent-primary" />
                <span className="text-sm font-body">Free item</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editItem.is_available ?? true} onChange={(e) => setEditItem({ ...editItem, is_available: e.target.checked })} className="accent-primary" />
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
            <Input label="Display Order" type="number" value={editCat.display_order || 0} onChange={(e) => setEditCat({ ...editCat, display_order: parseInt(e.target.value) })} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editCat.is_active ?? true} onChange={(e) => setEditCat({ ...editCat, is_active: e.target.checked })} className="accent-primary" />
              <span className="text-sm font-body">Active</span>
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
