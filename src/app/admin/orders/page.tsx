'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Card from '@/components/ui/Card';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/Badge';
import type { Order } from '@/types';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');

  async function fetchOrders() {
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (dateFilter) {
      const start = new Date(dateFilter);
      const end = new Date(dateFilter);
      end.setDate(end.getDate() + 1);
      query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
    }

    const { data } = await query;
    if (data) setOrders(data);
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, [dateFilter]);

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const totalTips = orders.reduce((sum, o) => sum + o.tip_amount, 0);

  if (loading) return <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-heading font-bold text-text-dark">Order History</h1>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-200 bg-surface font-body text-sm"
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-sm text-text-light">Orders</p>
          <p className="text-2xl font-heading font-bold">{orders.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-text-light">Revenue</p>
          <p className="text-2xl font-heading font-bold">${totalRevenue.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm text-text-light">Tips</p>
          <p className="text-2xl font-heading font-bold">${totalTips.toFixed(2)}</p>
        </Card>
      </div>

      {/* Orders List */}
      <div className="space-y-2">
        {orders.map((order) => (
          <Card key={order.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-bold text-sm text-text-dark">{order.customer_name}</h3>
                  <OrderStatusBadge status={order.status} />
                  <PaymentBadge status={order.payment_status} />
                </div>
                <p className="text-xs text-text-light mt-0.5">
                  {new Date(order.created_at).toLocaleString()} &middot; {order.order_source}
                  {order.discount_amount > 0 && ` · -$${order.discount_amount.toFixed(2)} discount`}
                  {order.tip_amount > 0 && ` · $${order.tip_amount.toFixed(2)} tip`}
                </p>
              </div>
              <span className="font-accent font-bold text-lg">
                {order.total === 0 ? 'Free' : `$${order.total.toFixed(2)}`}
              </span>
            </div>
          </Card>
        ))}
        {orders.length === 0 && (
          <Card className="text-center py-8">
            <p className="text-text-light">No orders found{dateFilter ? ' for this date' : ''}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
