'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { cartStore } from '@/lib/cart-store';
import { useCart } from '@/lib/hooks';
import { fetchShopConfig, getShopStatus, DEFAULT_SETTINGS } from '@/lib/shop';
import {
  readUnlock,
  verifyAccessCode,
  clearUnlock,
  type AccessUnlock,
} from '@/lib/access-code';
import { fetchItemModifierGroups } from '@/lib/menu';
import CategoryTabs from '@/components/menu/CategoryTabs';
import MenuCard from '@/components/menu/MenuCard';
import ModifierSelector from '@/components/menu/ModifierSelector';
import CartDrawer from '@/components/cart/CartDrawer';
import ShopBanner, { ClosedNotice } from '@/components/ShopBanner';
import type {
  Category,
  MenuItem,
  ModifierGroup,
  Modifier,
  Event,
  ShopSettings,
  OrderingHours,
} from '@/types';
import { useRouter } from 'next/navigation';

export default function MenuPage() {
  const router = useRouter();
  const cart = useCart();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueWait, setQueueWait] = useState<number | null>(null);

  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [hours, setHours] = useState<OrderingHours[]>([]);
  // Re-evaluated on a timer so the shop closes itself while the page sits open.
  const [now, setNow] = useState(() => new Date());

  const status = getShopStatus(settings, hours, now);

  // An approved group can unlock ordering while the shop is closed with an access code.
  const [unlock, setUnlock] = useState<AccessUnlock | null>(null);
  const canOrder = status.isOpen || !!unlock;

  // Restore an unlock from this tab, re-verifying it in case the code was disabled since.
  useEffect(() => {
    const stored = readUnlock();
    if (!stored) return;
    verifyAccessCode(stored.code).then((valid) => {
      if (valid) setUnlock(valid);
      else clearUnlock();
    });
  }, []);

  const fetchQueueWait = useCallback(async () => {
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id')
      .in('status', ['pending', 'in_progress'])
      .is('archived_at', null);

    if (!activeOrders || activeOrders.length === 0) {
      setQueueWait(0);
      return;
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('quantity')
      .in('order_id', activeOrders.map((o) => o.id));

    setQueueWait(items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0);
  }, []);

  const fetchMenu = useCallback(async () => {
    const [catRes, itemRes, eventRes, config] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('display_order'),
      supabase.from('menu_items').select('*').eq('is_available', true).order('display_order'),
      supabase.from('events').select('*').eq('is_active', true).limit(1).maybeSingle(),
      fetchShopConfig(),
    ]);

    if (catRes.data) {
      setCategories(catRes.data);
      setActiveCategory((prev) => prev ?? catRes.data[0]?.id ?? null);
    }
    if (itemRes.data) setMenuItems(itemRes.data);
    setActiveEvent((eventRes.data as Event) ?? null);
    setSettings(config.settings);
    setHours(config.hours);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMenu();
    fetchQueueWait();

    // A barista marking something sold out, or an admin flipping the shop
    // open/closed, should reach every phone with the menu open.
    const channel = supabase
      .channel('customer-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, fetchMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modifiers' }, fetchMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, fetchMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordering_hours' }, fetchMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchQueueWait)
      .subscribe();

    // Ticks the clock so ordering closes on schedule without a refresh.
    const ticker = setInterval(() => setNow(new Date()), 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(ticker);
    };
  }, [fetchMenu, fetchQueueWait]);

  // Load the selected drink's options, with its per-drink hide/lock rules applied.
  useEffect(() => {
    if (!selectedItem) return;
    let cancelled = false;

    // Clear first, or the modal flashes the previously-opened drink's options.
    setModifierGroups([]);

    fetchItemModifierGroups(selectedItem.id).then((groups) => {
      if (!cancelled) setModifierGroups(groups);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  const filteredItems = menuItems.filter((item) => item.category_id === activeCategory);
  const isEventFree = activeEvent?.is_all_free || false;

  function handleAddToCart(modifiers: Modifier[], instructions: string) {
    if (!selectedItem) return;
    cartStore.addItem(selectedItem, modifiers, instructions, isEventFree);
    setSelectedItem(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          <p className="font-body text-text-light">Loading menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Compact sticky bar — stays out of the way once you start scrolling */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-lg font-bold text-primary">
              {settings.service_title}
            </h2>
            {queueWait !== null && canOrder && (
              <p
                className={`font-accent text-xs ${queueWait === 0 ? 'text-success' : 'text-text-light'}`}
              >
                {queueWait === 0 ? 'No wait — order now!' : `~${queueWait} min current wait`}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => router.push('/live')}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2.5 font-accent text-sm font-semibold text-primary transition-all hover:bg-primary/10"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              Track Order
            </button>
            <button
              onClick={() => setCartOpen(true)}
              className="relative cursor-pointer rounded-full bg-primary px-5 py-2.5 font-accent text-sm font-semibold text-white transition-all hover:bg-primary-light"
            >
              Order
              {cart.itemCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-success text-xs font-bold text-white">
                  {cart.itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-5">
        <ShopBanner settings={settings} status={status} />

        {activeEvent && (
          <div className="mt-3 rounded-2xl border border-warm/20 bg-warm/5 px-4 py-3">
            <p className="font-accent text-sm font-semibold text-warm">
              {activeEvent.name}
              {isEventFree && ' — everything is free today!'}
            </p>
          </div>
        )}

        {!status.isOpen && !unlock && (
          <div className="mt-3">
            <ClosedNotice settings={settings} status={status} onUnlock={setUnlock} />
          </div>
        )}

        {!status.isOpen && unlock && (
          <div className="mt-3 rounded-2xl border-2 border-success/40 bg-success/10 px-5 py-4">
            <p className="font-heading font-bold text-success">
              Ordering unlocked{unlock.label ? ` for ${unlock.label}` : ''} 🔓
            </p>
            <p className="mt-1 font-body text-sm text-text-light">
              The shop is closed to everyone else — go ahead and order.
            </p>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-5xl px-4 pt-5">
        <CategoryTabs categories={categories} activeId={activeCategory} onSelect={setActiveCategory} />
      </div>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-text-light">No items in this category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                eventFree={isEventFree}
                orderingClosed={!canOrder}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Mobile cart button */}
      {cart.itemCount > 0 && !cartOpen && canOrder && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-100 bg-surface/90 p-4 backdrop-blur-sm sm:hidden">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary py-3 font-accent font-semibold text-white"
          >
            View Order ({cart.itemCount})
            <span className="text-sm opacity-75">${cart.total.toFixed(2)}</span>
          </button>
        </div>
      )}

      {selectedItem && (
        <ModifierSelector
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          item={selectedItem}
          modifierGroups={modifierGroups}
          eventFree={isEventFree}
          onAddToCart={handleAddToCart}
        />
      )}

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        orderingOpen={canOrder}
        onCheckout={() => {
          setCartOpen(false);
          router.push('/checkout');
        }}
      />
    </div>
  );
}
