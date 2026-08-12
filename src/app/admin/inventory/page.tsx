'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import type { InventoryItem, InventoryLog } from '@/types';
import IOSSpinner from '@/components/ui/Spinner';

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Partial<InventoryItem> | null>(null);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const [itemRes, logRes] = await Promise.all([
      supabase.from('inventory_items').select('*').order('name'),
      supabase.from('inventory_log').select('*, inventory_item:inventory_items(name, unit)').order('created_at', { ascending: false }).limit(50),
    ]);
    if (itemRes.data) setItems(itemRes.data);
    if (logRes.data) setLogs(logRes.data as unknown as InventoryLog[]);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function saveItem() {
    if (!editItem) return;
    setSaving(true);
    if (editItem.id) {
      await supabase.from('inventory_items').update({
        name: editItem.name, unit: editItem.unit,
        current_stock: editItem.current_stock, low_stock_threshold: editItem.low_stock_threshold,
      }).eq('id', editItem.id);
    } else {
      await supabase.from('inventory_items').insert({
        name: editItem.name, unit: editItem.unit,
        current_stock: editItem.current_stock || 0, low_stock_threshold: editItem.low_stock_threshold || 0,
      });
    }
    setSaving(false); setEditItem(null); fetchData();
  }

  async function handleRestock() {
    if (!restockItem || !restockAmount) return;
    const amount = parseFloat(restockAmount);
    setSaving(true);

    await supabase.from('inventory_items').update({
      current_stock: restockItem.current_stock + amount,
    }).eq('id', restockItem.id);

    await supabase.from('inventory_log').insert({
      inventory_item_id: restockItem.id,
      change_amount: amount,
      reason: 'restock',
    });

    setSaving(false); setRestockItem(null); setRestockAmount(''); fetchData();
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this ingredient? Its stock history will be removed too.')) return;
    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) {
      alert(`Could not delete this ingredient: ${error.message}`);
      return;
    }
    fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><IOSSpinner size={28} /></div>;

  const lowStockItems = items.filter((i) => i.current_stock <= i.low_stock_threshold);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-ios-largetitle text-label">Inventory</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="border border-gray-200" onClick={() => setShowLogs(!showLogs)}>
            {showLogs ? 'Show Stock' : 'View Log'}
          </Button>
          <Button size="sm" onClick={() => setEditItem({ name: '', unit: '', current_stock: 0, low_stock_threshold: 0 })}>
            + Item
          </Button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && !showLogs && (
        <Card className="mb-6 ring-2 ring-warning/30 bg-warning/5">
          <h2 className="font-heading font-bold text-warning mb-2">Low Stock Alert</h2>
          <div className="space-y-1">
            {lowStockItems.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span className="font-accent font-semibold text-warning">{item.current_stock} {item.unit}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showLogs ? (
        /* Inventory Log */
        <div className="space-y-2">
          {logs.map((log) => {
            const inv = log.inventory_item as unknown as { name: string; unit: string } | undefined;
            return (
              <Card key={log.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-body font-semibold">{inv?.name || 'Unknown'}</span>
                  <p className="text-xs text-text-light">
                    {new Date(log.created_at).toLocaleString()} &middot;{' '}
                    <Badge variant={log.reason === 'restock' ? 'success' : log.reason === 'order' ? 'primary' : 'warning'}>
                      {log.reason}
                    </Badge>
                  </p>
                </div>
                <span className={`font-accent font-bold text-sm ${log.change_amount > 0 ? 'text-success' : 'text-danger'}`}>
                  {log.change_amount > 0 ? '+' : ''}{log.change_amount} {inv?.unit || ''}
                </span>
              </Card>
            );
          })}
          {logs.length === 0 && <Card className="text-center py-8"><p className="text-text-light">No inventory activity yet</p></Card>}
        </div>
      ) : (
        /* Stock Levels */
        <div className="space-y-2">
          {items.map((item) => {
            const isLow = item.current_stock <= item.low_stock_threshold;
            return (
              <Card key={item.id} className={isLow ? 'border-warning/30' : ''}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold text-sm text-text-dark">{item.name}</h3>
                      {isLow && <Badge variant="warning">Low</Badge>}
                    </div>
                    <p className="text-xs text-text-light mt-0.5">
                      Unit: {item.unit} &middot; Alert below: {item.low_stock_threshold}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-accent font-bold ${isLow ? 'text-warning' : 'text-text-dark'}`}>
                      {item.current_stock}
                    </span>
                    <Button size="sm" variant="success" onClick={() => { setRestockItem(item); setRestockAmount(''); }}>
                      Restock
                    </Button>
                    <button onClick={() => setEditItem(item)} className="text-xs text-primary hover:underline cursor-pointer">Edit</button>
                    <button onClick={() => deleteItem(item.id)} className="text-xs text-danger hover:underline cursor-pointer">Delete</button>
                  </div>
                </div>
              </Card>
            );
          })}
          {items.length === 0 && <Card className="text-center py-8"><p className="text-text-light">No inventory items yet</p></Card>}
        </div>
      )}

      {/* Edit Item Modal */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title={editItem?.id ? 'Edit Inventory Item' : 'New Inventory Item'} size="sm">
        {editItem && (
          <div className="space-y-4">
            <Input label="Name" value={editItem.name || ''} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} placeholder="e.g., Espresso Beans" />
            <Input label="Unit" value={editItem.unit || ''} onChange={(e) => setEditItem({ ...editItem, unit: e.target.value })} placeholder="e.g., lbs, cartons, bottles" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Current Stock" type="number" step="0.01" min="0" value={editItem.current_stock || 0} onChange={(e) => setEditItem({ ...editItem, current_stock: parseFloat(e.target.value) })} />
              <Input label="Low Stock Alert" type="number" step="0.01" min="0" value={editItem.low_stock_threshold || 0} onChange={(e) => setEditItem({ ...editItem, low_stock_threshold: parseFloat(e.target.value) })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditItem(null)}>Cancel</Button>
              <Button onClick={saveItem} disabled={saving || !editItem.name || !editItem.unit}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Restock Modal */}
      <Modal isOpen={!!restockItem} onClose={() => setRestockItem(null)} title={`Restock: ${restockItem?.name}`} size="sm">
        {restockItem && (
          <div className="space-y-4">
            <p className="text-sm text-text-light">Current stock: <strong>{restockItem.current_stock} {restockItem.unit}</strong></p>
            <Input label={`Amount to add (${restockItem.unit})`} type="number" step="0.01" min="0.01" value={restockAmount} onChange={(e) => setRestockAmount(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setRestockItem(null)}>Cancel</Button>
              <Button variant="success" onClick={handleRestock} disabled={saving || !restockAmount}>{saving ? 'Restocking...' : 'Restock'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
