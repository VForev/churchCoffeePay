'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import type { Coupon, DiscountType } from '@/types';

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCoupon, setEditCoupon] = useState<Partial<Coupon> | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (data) setCoupons(data);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function saveCoupon() {
    if (!editCoupon) return;
    setSaving(true);
    if (editCoupon.id) {
      await supabase.from('coupons').update({
        code: editCoupon.code?.toUpperCase(),
        discount_type: editCoupon.discount_type,
        discount_value: editCoupon.discount_value,
        max_uses: editCoupon.max_uses || null,
        is_active: editCoupon.is_active,
        expires_at: editCoupon.expires_at || null,
      }).eq('id', editCoupon.id);
    } else {
      await supabase.from('coupons').insert({
        code: editCoupon.code?.toUpperCase(),
        discount_type: editCoupon.discount_type || 'percentage',
        discount_value: editCoupon.discount_value || 0,
        max_uses: editCoupon.max_uses || null,
        is_active: true,
        expires_at: editCoupon.expires_at || null,
      });
    }
    setSaving(false); setEditCoupon(null); fetchData();
  }

  async function toggleActive(coupon: Coupon) {
    await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
    fetchData();
  }

  async function deleteCoupon(id: string) {
    if (!confirm('Delete this coupon?')) return;
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    if (error) {
      alert(
        error.code === '23503'
          ? 'Could not delete this coupon because orders that redeemed it still reference it. Run supabase-fix-delete-constraints.sql in the Supabase SQL editor, then try again.'
          : `Could not delete this coupon: ${error.message}`,
      );
      return;
    }
    fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold text-text-dark">Coupon Codes</h1>
        <Button size="sm" onClick={() => setEditCoupon({ code: '', discount_type: 'percentage', discount_value: 0, is_active: true })}>
          + Coupon
        </Button>
      </div>

      <div className="space-y-3">
        {coupons.map((coupon) => (
          <Card key={coupon.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-bold text-text-dark font-mono">{coupon.code}</h3>
                  <Badge variant={coupon.is_active ? 'success' : 'neutral'}>
                    {coupon.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <p className="text-sm text-text-light mt-1">
                  {coupon.discount_type === 'percentage' && `${coupon.discount_value}% off`}
                  {coupon.discount_type === 'fixed_amount' && `$${coupon.discount_value.toFixed(2)} off`}
                  {coupon.discount_type === 'free_item' && 'Free order'}
                  {' '}&middot; Used {coupon.times_used}{coupon.max_uses ? `/${coupon.max_uses}` : ''} times
                  {coupon.expires_at && ` &middot; Expires ${new Date(coupon.expires_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={coupon.is_active ? 'ghost' : 'success'} onClick={() => toggleActive(coupon)} className="border border-gray-200">
                  {coupon.is_active ? 'Disable' : 'Enable'}
                </Button>
                <button onClick={() => setEditCoupon(coupon)} className="text-sm text-primary hover:underline cursor-pointer">Edit</button>
                <button onClick={() => deleteCoupon(coupon.id)} className="text-sm text-danger hover:underline cursor-pointer">Delete</button>
              </div>
            </div>
          </Card>
        ))}
        {coupons.length === 0 && (
          <Card className="text-center py-8"><p className="text-text-light">No coupons created yet</p></Card>
        )}
      </div>

      <Modal isOpen={!!editCoupon} onClose={() => setEditCoupon(null)} title={editCoupon?.id ? 'Edit Coupon' : 'New Coupon'} size="sm">
        {editCoupon && (
          <div className="space-y-4">
            <Input label="Code" value={editCoupon.code || ''} onChange={(e) => setEditCoupon({ ...editCoupon, code: e.target.value.toUpperCase() })} placeholder="e.g., WELCOME50" />
            <div>
              <label className="block text-sm font-accent font-semibold text-text mb-1.5">Discount Type</label>
              <select
                value={editCoupon.discount_type || 'percentage'}
                onChange={(e) => setEditCoupon({ ...editCoupon, discount_type: e.target.value as DiscountType })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-surface font-body"
              >
                <option value="percentage">Percentage Off</option>
                <option value="fixed_amount">Fixed Amount Off</option>
                <option value="free_item">Free Order</option>
              </select>
            </div>
            {editCoupon.discount_type !== 'free_item' && (
              <Input
                label={editCoupon.discount_type === 'percentage' ? 'Percentage (e.g., 50 for 50%)' : 'Amount ($)'}
                type="number" step="0.01" min="0"
                value={editCoupon.discount_value || 0}
                onChange={(e) => setEditCoupon({ ...editCoupon, discount_value: parseFloat(e.target.value) })}
              />
            )}
            <Input label="Max Uses (leave empty for unlimited)" type="number" min="1" value={editCoupon.max_uses || ''} onChange={(e) => setEditCoupon({ ...editCoupon, max_uses: e.target.value ? parseInt(e.target.value) : null })} />
            <Input label="Expiration Date" type="date" value={editCoupon.expires_at ? editCoupon.expires_at.split('T')[0] : ''} onChange={(e) => setEditCoupon({ ...editCoupon, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditCoupon(null)}>Cancel</Button>
              <Button onClick={saveCoupon} disabled={saving || !editCoupon.code}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
