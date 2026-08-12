'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { cartStore } from '@/lib/cart-store';
import { useCart } from '@/lib/hooks';
import { fetchShopConfig, getShopStatus, canOrderNow, DEFAULT_SETTINGS } from '@/lib/shop';
import {
  clearActiveUnlock,
  getActiveUnlock,
  unlockAllowsCategory,
  type AccessUnlock,
} from '@/lib/access-code';
import { fetchItemModifierGroups } from '@/lib/menu';
import CategoryTabs from '@/components/menu/CategoryTabs';
import MenuCard from '@/components/menu/MenuCard';
import ModifierSelector from '@/components/menu/ModifierSelector';
import CartDrawer from '@/components/cart/CartDrawer';
import ShopBanner, { ClosedNotice } from '@/components/ShopBanner';
import CustomOrderBox from '@/components/CustomOrderBox';
import IOSSpinner from '@/components/ui/Spinner';
import { fadeUp, springPop, springSheet, springSnappy, staggerParent } from '@/lib/motion';
import { cn } from '@/lib/utils';
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

/** Sentinel id for the synthetic "Custom Order" tab (not a real DB category). */
const CUSTOM_TAB_ID = 'custom-order-tab';

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
  // Held in memory (see access-code.ts): it survives menu → checkout within one order,
  // but a page restart/refresh wipes it so we always ask for the code again.
  const [enteredUnlock, setUnlock] = useState<AccessUnlock | null>(() => getActiveUnlock());
  // An admin locking the shop mid-service takes an already-granted unlock with it, or a
  // phone that typed a code five minutes ago would carry on ordering straight through it.
  const unlock = status.isLocked ? null : enteredUnlock;
  const canOrder = canOrderNow(status, !!unlock);
  // A code may be limited to one category (e.g. teas), so ordering is decided per item.
  const canOrderItem = (item: MenuItem) =>
    canOrderNow(status, unlockAllowsCategory(unlock, item.category_id));

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
    // Forget the code for good, not just for this page: the unlock lives in module memory
    // and would otherwise still be sitting there when checkout loads.
    if (getShopStatus(config.settings, config.hours).isLocked) clearActiveUnlock();
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

  // A write-in code adds a "Custom Order" tab at the very end — never the default,
  // so it's not the first thing anyone sees.
  const tabCategories = unlock?.allowCustomOrder
    ? [...categories, { id: CUSTOM_TAB_ID, name: 'Custom Order', display_order: 9999, is_active: true }]
    : categories;

  function handleAddToCart(modifiers: Modifier[], instructions: string) {
    if (!selectedItem) return;
    cartStore.addItem(selectedItem, modifiers, instructions, isEventFree);
    setSelectedItem(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen-safe items-center justify-center bg-bg">
        <div className="text-center">
          <IOSSpinner />
          <p className="text-ios-subhead mt-4 text-label-secondary">Loading menu…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe bg-bg">
      {/* Frosted nav bar. The blur is the point: content scrolling under a
          translucent bar is the single strongest "this is iOS" cue there is,
          and it needs real content passing beneath it to read at all. */}
      <header className="material-bar hairline-b sticky top-0 z-30 pt-safe">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-ios-headline truncate text-label">{settings.service_title}</h2>
            {queueWait !== null && canOrder && (
              <p
                className={cn(
                  'text-ios-caption',
                  queueWait === 0 ? 'text-success' : 'text-label-secondary',
                )}
              >
                {queueWait === 0 ? 'No wait — order now!' : `~${queueWait} min current wait`}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={springSnappy}
              onClick={() => router.push('/yourlive')}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-fill-tertiary px-3.5 py-2 text-[15px] font-medium text-label"
            >
              <span className="relative flex h-1.5 w-1.5">
                <motion.span
                  animate={{ scale: [1, 2.4], opacity: [0.7, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                  className="absolute inline-flex h-full w-full rounded-full bg-success"
                />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              Track
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={springSnappy}
              onClick={() => setCartOpen(true)}
              className="relative cursor-pointer rounded-full bg-primary px-5 py-2 text-[15px] font-semibold text-white"
            >
              Order
              <AnimatePresence>
                {cart.itemCount > 0 && (
                  <motion.span
                    // Springs in with overshoot each time the count changes, so
                    // adding a drink is visibly acknowledged even when the cart
                    // itself is closed.
                    key={cart.itemCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={springPop}
                    className="tnum absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[12px] font-bold text-white"
                  >
                    {cart.itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-5">
        <ShopBanner settings={settings} status={status} />

        {activeEvent && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-3 rounded-[var(--r-lg)] bg-warm/12 px-4 py-3 ring-1 ring-warm/25"
          >
            <p className="text-ios-subhead font-semibold text-warm">
              {activeEvent.name}
              {isEventFree && ' — everything is free today!'}
            </p>
          </motion.div>
        )}

        {!status.isOpen && !unlock && (
          <div className="mt-3">
            <ClosedNotice settings={settings} status={status} onUnlock={setUnlock} />
          </div>
        )}

        {!status.isOpen && unlock && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-3 rounded-[var(--r-lg)] bg-success/12 px-5 py-4 ring-1 ring-success/30"
          >
            <p className="text-ios-headline text-success">
              Ordering unlocked{unlock.label ? ` for ${unlock.label}` : ''} 🔓
            </p>
            <p className="text-ios-subhead mt-1 text-label-secondary">
              {unlock.allowedCategoryName
                ? `You can order ${unlock.allowedCategoryName} — the rest of the menu stays closed.`
                : 'The shop is closed to everyone else — go ahead and order.'}
            </p>
          </motion.div>
        )}
      </div>

      <div className="mx-auto max-w-5xl px-4 pt-5">
        <CategoryTabs categories={tabCategories} activeId={activeCategory} onSelect={setActiveCategory} />
      </div>

      {/* Extra bottom room so the floating order bar never covers the last row. */}
      <main
        className={cn(
          'mx-auto max-w-5xl px-4 py-5',
          cart.itemCount > 0 && canOrder && 'pb-28 sm:pb-5',
        )}
      >
        {activeCategory === CUSTOM_TAB_ID && unlock?.allowCustomOrder ? (
          <div className="mx-auto max-w-xl">
            <CustomOrderBox unlock={unlock} queueWait={queueWait} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-ios-subhead text-label-tertiary">No items in this category</p>
          </div>
        ) : (
          // Re-keyed on the category so switching tabs replays the stagger —
          // the grid rebuilds itself rather than swapping contents in place.
          <motion.div
            key={activeCategory}
            variants={staggerParent}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
          >
            {filteredItems.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                eventFree={isEventFree}
                orderingClosed={!canOrderItem(item)}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </motion.div>
        )}
      </main>

      {/* Floating order bar — rises from the bottom edge the moment the cart
          stops being empty, the way an iOS app surfaces a pending action. */}
      <AnimatePresence>
        {cart.itemCount > 0 && !cartOpen && canOrder && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={springSheet}
            className="material-bar hairline-t fixed bottom-0 left-0 right-0 z-30 px-4 pb-safe-4 pt-3 sm:hidden"
          >
            <motion.button
              whileTap={{ scale: 0.98 }}
              transition={springSnappy}
              onClick={() => setCartOpen(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[17px] font-semibold text-white shadow-sm"
            >
              View Order ({cart.itemCount})
              <span className="tnum opacity-75">${cart.total.toFixed(2)}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

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
