'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/Badge';
import type { Order, OrderItem, OrderItemModifier, Modifier, OrderStatus } from '@/types';

interface FullOrder extends Order {
  order_items?: (OrderItem & {
    menu_item: { name: string };
    order_item_modifiers: (OrderItemModifier & { modifier: Modifier })[];
  })[];
}

const STATUS_FILTERS: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Making', value: 'in_progress' },
  { label: 'Ready', value: 'ready' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ type: 'archive' | 'delete' | 'restore'; order: FullOrder } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function fetchOrders() {
    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          menu_item:menu_items (name),
          order_item_modifiers (
            *,
            modifier:modifiers (*)
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (showArchived) {
      query = query.not('archived_at', 'is', null);
    } else {
      query = query.is('archived_at', null);
    }

    if (dateFilter) {
      const start = new Date(dateFilter);
      const end = new Date(dateFilter);
      end.setDate(end.getDate() + 1);
      query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
    }

    const { data } = await query;
    if (data) setOrders(data as unknown as FullOrder[]);
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, [dateFilter, showArchived]);

  async function archiveOrder(order: FullOrder) {
    setActionError(null);
    setActionLoading(true);
    const { error } = await supabase
      .from('orders')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', order.id);
    setActionLoading(false);
    if (error) {
      setActionError(`Could not archive this order: ${error.message}`);
      return;
    }
    setConfirmModal(null);
    fetchOrders();
  }

  async function restoreOrder(order: FullOrder) {
    setActionError(null);
    setActionLoading(true);
    const { error } = await supabase
      .from('orders')
      .update({ archived_at: null })
      .eq('id', order.id);
    setActionLoading(false);
    if (error) {
      setActionError(`Could not restore this order: ${error.message}`);
      return;
    }
    setConfirmModal(null);
    fetchOrders();
  }

  async function deleteOrder(order: FullOrder) {
    setActionError(null);
    setActionLoading(true);
    const { error } = await supabase.from('orders').delete().eq('id', order.id);
    setActionLoading(false);
    if (error) {
      setActionError(
        error.code === '23503'
          ? 'Could not delete this order because other records still reference it. Run supabase-fix-delete-constraints.sql in the Supabase SQL editor, then try again.'
          : `Could not delete this order: ${error.message}`,
      );
      return;
    }
    setConfirmModal(null);
    fetchOrders();
  }

  const filtered = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (search && !o.customer_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalRevenue = filtered.reduce((sum, o) => sum + o.total, 0);
  const totalDonations = filtered.reduce((sum, o) => sum + o.tip_amount, 0);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-heading font-bold text-text-dark">Order History</h1>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`text-sm font-accent px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
            showArchived
              ? 'bg-warning/10 border-warning/30 text-amber-700'
              : 'bg-gray-50 border-gray-200 text-text-light hover:bg-gray-100'
          }`}
        >
          {showArchived ? 'Showing Archived' : 'Show Archived'}
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-xl border border-gray-200 bg-surface font-body text-sm min-w-0"
        />
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-200 bg-surface font-body text-sm"
        />
        {dateFilter && (
          <button
            onClick={() => setDateFilter('')}
            className="px-3 py-2 text-sm text-text-light hover:text-text cursor-pointer"
          >
            Clear date
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-accent transition-colors cursor-pointer ${
              statusFilter === f.value
                ? 'bg-primary text-white'
                : 'bg-surface border border-gray-200 text-text-light hover:border-primary/30'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card>
          <p className="text-sm text-text-light">Orders</p>
          <p className="text-2xl font-heading font-bold">{filtered.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-text-light">Revenue</p>
          <p className="text-2xl font-heading font-bold">${totalRevenue.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm text-text-light">Donations</p>
          <p className="text-2xl font-heading font-bold">${totalDonations.toFixed(2)}</p>
        </Card>
      </div>

      {/* Orders List */}
      <div className="space-y-2">
        {filtered.map((order) => {
          const isExpanded = expandedId === order.id;
          return (
            <Card key={order.id} className={showArchived ? 'opacity-75' : ''}>
              {/* Main row — click to expand */}
              <button
                type="button"
                className="w-full text-left cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-bold text-sm text-text-dark truncate">
                        {order.customer_name}
                      </h3>
                      <OrderStatusBadge status={order.status} />
                      <PaymentBadge status={order.payment_status} />
                    </div>
                    <p className="text-xs text-text-light mt-0.5">
                      {new Date(order.created_at).toLocaleString()}
                      {' · '}{order.order_source}
                      {order.discount_amount > 0 && ` · -$${order.discount_amount.toFixed(2)} off`}
                      {order.tip_amount > 0 && ` · $${order.tip_amount.toFixed(2)} donation`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-accent font-bold text-lg">
                      {order.total === 0 ? 'Free' : `$${order.total.toFixed(2)}`}
                    </span>
                    <span className="text-text-light text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {/* Order items */}
                  {order.order_items && order.order_items.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="text-sm">
                          <span className="font-body font-semibold">
                            {item.quantity}x {item.menu_item?.name}
                          </span>
                          {item.order_item_modifiers?.length > 0 && (
                            <p className="text-xs text-text-light pl-4">
                              {item.order_item_modifiers.map((m) => m.modifier?.name).filter(Boolean).join(', ')}
                            </p>
                          )}
                          {item.special_instructions && (
                            <p className="text-xs text-warm pl-4 italic">&ldquo;{item.special_instructions}&rdquo;</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-light mb-4">No item details available</p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {showArchived ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="border border-gray-200"
                          onClick={() => setConfirmModal({ type: 'restore', order })}
                        >
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setConfirmModal({ type: 'delete', order })}
                        >
                          Delete Permanently
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="border border-warning/30 text-amber-700 hover:bg-warning/5"
                          onClick={() => setConfirmModal({ type: 'archive', order })}
                        >
                          Archive
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setConfirmModal({ type: 'delete', order })}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="text-center py-8">
            <p className="text-text-light">
              {showArchived ? 'No archived orders' : 'No orders found'}
              {dateFilter ? ' for this date' : ''}
            </p>
          </Card>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <Modal
          isOpen
          onClose={() => { setConfirmModal(null); setActionError(null); }}
          title={
            confirmModal.type === 'archive'
              ? 'Archive Order'
              : confirmModal.type === 'restore'
              ? 'Restore Order'
              : 'Delete Order Permanently'
          }
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-text">
              {confirmModal.type === 'archive' &&
                `Archive order for ${confirmModal.order.customer_name}? It will be hidden from the default view but can be restored.`}
              {confirmModal.type === 'restore' &&
                `Restore order for ${confirmModal.order.customer_name}? It will appear in the active orders list again.`}
              {confirmModal.type === 'delete' &&
                `Permanently delete order for ${confirmModal.order.customer_name}? This cannot be undone.`}
            </p>
            {actionError && (
              <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
                {actionError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => { setConfirmModal(null); setActionError(null); }}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant={confirmModal.type === 'restore' ? 'success' : confirmModal.type === 'archive' ? 'secondary' : 'danger'}
                onClick={() => {
                  if (confirmModal.type === 'archive') archiveOrder(confirmModal.order);
                  else if (confirmModal.type === 'restore') restoreOrder(confirmModal.order);
                  else deleteOrder(confirmModal.order);
                }}
                disabled={actionLoading}
              >
                {actionLoading
                  ? 'Working...'
                  : confirmModal.type === 'archive'
                  ? 'Archive'
                  : confirmModal.type === 'restore'
                  ? 'Restore'
                  : 'Delete'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
