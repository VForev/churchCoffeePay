'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Card from '@/components/ui/Card';

interface DashboardStats {
  totalOrders: number;
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  lowStockItems: { name: string; current_stock: number; unit: string; low_stock_threshold: number }[];
  popularItems: { name: string; count: number }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const today = new Date().toISOString().split('T')[0];

      const [ordersRes, todayOrdersRes, pendingRes, inventoryRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('*').gte('created_at', today),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('inventory_items').select('*'),
      ]);

      const todayOrders = todayOrdersRes.data || [];
      const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);

      const lowStockItems = (inventoryRes.data || [])
        .filter((i) => i.current_stock <= i.low_stock_threshold)
        .map((i) => ({ name: i.name, current_stock: i.current_stock, unit: i.unit, low_stock_threshold: i.low_stock_threshold }));

      // Get popular items (count from order_items)
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('menu_item_id, menu_item:menu_items(name)');

      const itemCounts: Record<string, { name: string; count: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (orderItems || []).forEach((oi: any) => {
        const menuItem = Array.isArray(oi.menu_item) ? oi.menu_item[0] : oi.menu_item;
        const name = menuItem?.name || 'Unknown';
        if (!itemCounts[oi.menu_item_id]) {
          itemCounts[oi.menu_item_id] = { name, count: 0 };
        }
        itemCounts[oi.menu_item_id].count++;
      });
      const popularItems = Object.values(itemCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setStats({
        totalOrders: ordersRes.count || 0,
        todayOrders: todayOrders.length,
        todayRevenue,
        pendingOrders: pendingRes.count || 0,
        lowStockItems,
        popularItems,
      });
      setLoading(false);
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div>
      <h1 className="text-2xl font-heading font-bold text-text-dark mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Today's Orders" value={stats.todayOrders.toString()} />
        <StatCard label="Today's Revenue" value={`$${stats.todayRevenue.toFixed(2)}`} />
        <StatCard label="Pending Orders" value={stats.pendingOrders.toString()} highlight={stats.pendingOrders > 0} />
        <StatCard label="Total Orders" value={stats.totalOrders.toString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alert */}
        <Card>
          <h2 className="font-heading font-bold text-text-dark mb-3">Low Stock Alerts</h2>
          {stats.lowStockItems.length === 0 ? (
            <p className="text-sm text-text-light">All inventory levels are good</p>
          ) : (
            <div className="space-y-2">
              {stats.lowStockItems.map((item) => (
                <div key={item.name} className="flex justify-between items-center bg-warning/5 px-3 py-2 rounded-xl">
                  <span className="text-sm font-body">{item.name}</span>
                  <span className="text-sm font-accent font-semibold text-warning">
                    {item.current_stock} {item.unit} left
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Popular Items */}
        <Card>
          <h2 className="font-heading font-bold text-text-dark mb-3">Popular Items</h2>
          {stats.popularItems.length === 0 ? (
            <p className="text-sm text-text-light">No orders yet</p>
          ) : (
            <div className="space-y-2">
              {stats.popularItems.map((item, i) => (
                <div key={item.name} className="flex justify-between items-center px-3 py-2 rounded-xl hover:bg-gray-50">
                  <span className="text-sm font-body">
                    <span className="text-text-light mr-2">#{i + 1}</span>
                    {item.name}
                  </span>
                  <span className="text-sm font-accent font-semibold text-primary">
                    {item.count} orders
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'ring-2 ring-warning/30' : ''}>
      <p className="text-sm text-text-light font-body">{label}</p>
      <p className="text-2xl font-heading font-bold text-text-dark mt-1">{value}</p>
    </Card>
  );
}
