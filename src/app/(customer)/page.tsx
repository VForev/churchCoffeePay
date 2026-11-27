'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { fetchQueueDrinkCount } from '@/lib/queue';
import { cn } from '@/lib/utils';
import CategoryTabs from '@/components/menu/CategoryTabs';
import MenuCard, { MenuCardSkeleton } from '@/components/menu/MenuCard';
import ModifierSelector from '@/components/menu/ModifierSelector';
import ShopBanner, { ClosedNotice } from '@/components/ShopBanner';
import CustomOrderBox from '@/components/CustomOrderBox';
import SpecialtyDrink from '@/components/menu/SpecialtyDrink';
import PageBackdrop, { pageBg } from '@/components/PageBackdrop';
import { safeImageUrl, specialtyPicture } from '@/lib/pictures';
import { useSitePictures } from '@/lib/use-pictures';
import { Skeleton } from '@/components/ui/Card';
import {
  DEFAULT_SPECIALTY,
  fetchSpecialty,
  resolveSpecialty,
  type SpecialtySettings,
} from '@/lib/specialty';
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

/** How long the "Added to your order" note stays up. */
const TOAST_MS = 2200;

export default function MenuPage() {
  const router = useRouter();
  const cart = useCart();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  /**
   * The drink the sheet is showing. Outlives `selectedItem` on close so the sheet stays
   * mounted long enough to slide away, instead of vanishing mid-gesture.
   */
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  /** The drink of the day's build, when the sheet was opened from its card. */
  const [preselectIds, setPreselectIds] = useState<string[] | undefined>(undefined);
  const [specialty, setSpecialty] = useState<SpecialtySettings>(DEFAULT_SPECIALTY);
  /** Every modifier, only so the special can name its own add-ins and see them sold out. */
  const [allModifiers, setAllModifiers] = useState<Modifier[]>([]);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueWait, setQueueWait] = useState<number | null>(null);
  /** "Added Latte" — the confirmation that the sheet closing actually did something. */
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Each drink's options, once loaded. Opening the same drink twice — or a second
   * latte after the first — is instant instead of four more round trips. Emptied
   * whenever the menu or its options change, so a sold-out flag is never stale here.
   */
  const optionsCache = useRef(new Map<string, ModifierGroup[]>());
  /** Which drink the in-flight options request is for, so a slow one can't land late. */
  const optionsFor = useRef<string | null>(null);

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
  // Closed (but not locked) with no code yet: drinks can still go in the cart, because
  // the code is asked for at checkout — nobody should have to find it before they've
  // even picked a drink. Checkout is still the gate; nothing is placed without the code.
  const codeAtCheckout = !status.isOpen && !status.isLocked && !unlock;
  // A code may be limited to one category (e.g. teas), so ordering is decided per item.
  const canOrderItem = (item: MenuItem) =>
    codeAtCheckout || canOrderNow(status, unlockAllowsCategory(unlock, item.category_id));

  const refreshQueue = useCallback(async () => {
    setQueueWait(await fetchQueueDrinkCount());
  }, []);

  const refreshMenu = useCallback(async () => {
    const [catRes, itemRes, eventRes, config, special, modRes] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('display_order'),
      supabase.from('menu_items').select('*').eq('is_available', true).order('display_order'),
      supabase.from('events').select('*').eq('is_active', true).limit(1).maybeSingle(),
      fetchShopConfig(),
      fetchSpecialty(),
      supabase.from('modifiers').select('*'),
    ]);

    optionsCache.current.clear();
    if (catRes.data) {
      setCategories(catRes.data);
      setActiveCategory((prev) => prev ?? catRes.data[0]?.id ?? null);
    }
    if (itemRes.data) setMenuItems(itemRes.data);
    if (modRes.data) setAllModifiers(modRes.data as Modifier[]);
    setSpecialty(special);
    setActiveEvent((eventRes.data as Event) ?? null);
    setSettings(config.settings);
    setHours(config.hours);
    // Forget the code for good, not just for this page: the unlock lives in module memory
    // and would otherwise still be sitting there when checkout loads.
    if (getShopStatus(config.settings, config.hours).isLocked) clearActiveUnlock();
    setLoading(false);
  }, []);

  useEffect(() => {
    // Both only set state once their queries come back, which the lint rule can't see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshMenu();
    refreshQueue();

    // A barista marking something sold out, or an admin flipping the shop
    // open/closed, should reach every phone with the menu open.
    const channel = supabase
      .channel('customer-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, refreshMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modifiers' }, refreshMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, refreshMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordering_hours' }, refreshMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'specialty_drink' }, refreshMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshQueue)
      .subscribe();

    // Ticks the clock so ordering closes on schedule without a refresh.
    const ticker = setInterval(() => setNow(new Date()), 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(ticker);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refreshMenu, refreshQueue]);

  const filteredItems = menuItems.filter((item) => item.category_id === activeCategory);
  const isEventFree = activeEvent?.is_all_free || false;

  // Recomputed from the same menu everyone else on this page is reading, so a barista
  // 86-ing the syrup flips the card to "sold out" with no extra round trip.
  const specialtyState = resolveSpecialty(specialty, menuItems, allModifiers);
  const pictures = useSitePictures();
  const backdrop = safeImageUrl(pictures.page_background_image);

  // A write-in code adds a "Custom Order" tab at the very end — never the default,
  // so it's not the first thing anyone sees.
  const tabCategories = unlock?.allowCustomOrder
    ? [...categories, { id: CUSTOM_TAB_ID, name: 'Custom Order', display_order: 9999, is_active: true }]
    : categories;

  /** How many of each drink are already in the order, for the count on its card. */
  const inCart = new Map<string, number>();
  for (const line of cart.items) {
    inCart.set(line.menu_item.id, (inCart.get(line.menu_item.id) ?? 0) + line.quantity);
  }

  /**
   * Menu → payment, with nothing in between.
   *
   * There used to be a cart drawer here: tap Order, read the same list of drinks back,
   * tap again. On a phone that second screen was pure friction — it showed nothing the
   * order page doesn't already show, and it was one more place to abandon an order.
   * The drinks list on /checkout is editable (quantities, remove), so the review didn't
   * go away — it moved onto the page that was always going to be read anyway.
   */
  function goToCheckout() {
    if (cart.itemCount === 0) return;
    router.push('/checkout');
  }

  function selectCategory(id: string) {
    setActiveCategory(id);
    // Switching from a long list to a short one would otherwise leave the page scrolled
    // past the end of it, looking empty. Bring the top of the list back under the bar.
    const list = listRef.current;
    if (list && list.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: window.scrollY + list.getBoundingClientRect().top - 140, behavior: 'smooth' });
    }
  }

  /** The featured card and an ordinary drink card open the same sheet. */
  function openDrink(item: MenuItem, build?: string[]) {
    setPreselectIds(build);
    setSelectedItem(item);
    setSheetItem(item);
    optionsFor.current = item.id;

    const cached = optionsCache.current.get(item.id);
    if (cached) {
      setModifierGroups(cached);
      setOptionsLoading(false);
      return;
    }

    // Cleared first, or the sheet flashes the previously-opened drink's options.
    setModifierGroups([]);
    setOptionsLoading(true);
    fetchItemModifierGroups(item.id).then((groups) => {
      optionsCache.current.set(item.id, groups);
      if (optionsFor.current !== item.id) return;
      setModifierGroups(groups);
      setOptionsLoading(false);
    });
  }

  function closeDrink() {
    optionsFor.current = null;
    setSelectedItem(null);
    setPreselectIds(undefined);
  }

  function handleAddToCart(modifiers: Modifier[], instructions: string) {
    if (!selectedItem) return;
    cartStore.addItem(selectedItem, modifiers, instructions, isEventFree);
    setToast({ id: Date.now(), text: `${selectedItem.name} added` });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    closeDrink();
  }

  const waitLabel =
    queueWait === null || !canOrder
      ? null
      : queueWait === 0
        ? 'No wait — order now'
        : `~${queueWait} min wait`;

  return (
    <div className={cn('min-h-screen pb-28 sm:pb-10', pageBg(!!backdrop))}>
      <PageBackdrop url={backdrop} />
      {/* Sticky bar: who we are, how long the wait is, and the categories — the one thing
          you need again after scrolling a long list. */}
      <header className="glass-bar sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-[19px] font-bold leading-tight tracking-[-0.02em] text-text-dark">
              {settings.service_title}
            </h2>
            {waitLabel && (
              <p
                className={cn(
                  'mt-0.5 flex items-center gap-1.5 font-accent text-xs font-medium',
                  queueWait === 0 ? 'text-success' : 'text-text-light',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    queueWait === 0 ? 'animate-pulse bg-success' : 'bg-warning',
                  )}
                />
                {waitLabel}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => router.push('/yourlive')}
              className="pressable flex cursor-pointer items-center gap-2 rounded-full bg-primary/10 px-3.5 py-2 font-accent text-sm font-semibold text-primary hover:bg-primary/15"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              Track
            </button>
            <button
              onClick={goToCheckout}
              disabled={cart.itemCount === 0}
              aria-label={`Your order, ${cart.itemCount} drink${cart.itemCount === 1 ? '' : 's'}`}
              className="pressable relative flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-accent text-sm font-semibold text-white shadow-sm shadow-primary/30 enabled:cursor-pointer enabled:hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              Order
              {cart.itemCount > 0 && (
                <span
                  key={toast?.id ?? 0}
                  className="flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-surface px-1 text-xs font-bold text-primary"
                >
                  {cart.itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 pb-2.5">
          {loading ? (
            <div className="flex gap-2 py-1">
              <Skeleton className="h-9 w-20 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-16 rounded-full" />
            </div>
          ) : (
            <CategoryTabs
              categories={tabCategories}
              activeId={activeCategory}
              onSelect={selectCategory}
            />
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-3 px-4 pt-4">
        {loading ? (
          <Skeleton className="h-40 rounded-3xl" />
        ) : (
          <ShopBanner settings={settings} status={status} image={pictures.banner_image} />
        )}

        {activeEvent && (
          <div className="flex animate-rise items-center gap-3 rounded-2xl border border-warm/15 bg-warm/[0.06] px-4 py-3">
            <span aria-hidden className="text-xl leading-none">🎉</span>
            <p className="font-accent text-sm font-semibold text-warm">
              {activeEvent.name}
              {isEventFree && ' — everything is free today!'}
            </p>
          </div>
        )}

        {!loading && !status.isOpen && !unlock && (
          <ClosedNotice
            settings={settings}
            status={status}
            onUnlock={setUnlock}
            onCode={cartStore.applyCoupon}
          />
        )}

        {!status.isOpen && unlock && (
          <div className="animate-rise rounded-2xl border border-success/30 bg-success/10 px-5 py-4">
            <p className="font-heading font-bold text-success">
              Ordering unlocked{unlock.label ? ` for ${unlock.label}` : ''} 🔓
            </p>
            <p className="mt-1 font-body text-sm text-text-light">
              {unlock.allowedCategoryName
                ? `You can order ${unlock.allowedCategoryName} — the rest of the menu stays closed.`
                : 'The shop is closed to everyone else — go ahead and order.'}
            </p>
          </div>
        )}

        {specialtyState.kind !== 'off' && (
          <SpecialtyDrink
            picture={specialtyPicture(specialtyState.settings, specialtyState.item, pictures)}
            state={specialtyState}
            onOrder={() =>
              specialtyState.kind === 'ready' &&
              openDrink(
                specialtyState.item,
                specialtyState.modifiers.map((m) => m.id),
              )
            }
          />
        )}
      </div>

      <main ref={listRef} className="mx-auto max-w-5xl px-4 pt-5">
        {!loading && activeCategory && activeCategory !== CUSTOM_TAB_ID && (
          <h2
            // Its own key, distinct from the grid's below: two siblings sharing one key
            // makes React keep stale copies, and the old category titles stack up.
            key={`title-${activeCategory}`}
            className="mb-3 animate-rise px-1 font-heading text-[1.625rem] font-bold tracking-[-0.025em] text-text-dark"
          >
            {tabCategories.find((c) => c.id === activeCategory)?.name}
          </h2>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <MenuCardSkeleton key={i} />
            ))}
          </div>
        ) : activeCategory === CUSTOM_TAB_ID && unlock?.allowCustomOrder ? (
          <div className="mx-auto max-w-xl">
            <CustomOrderBox unlock={unlock} queueWait={queueWait} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="animate-rise rounded-3xl border border-dashed border-gray-200 py-14 text-center">
            <p className="mb-2 text-4xl">☕</p>
            <p className="font-body text-text-light">Nothing in this category yet</p>
          </div>
        ) : (
          <div key={`grid-${activeCategory}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item, index) => (
              <MenuCard
                key={item.id}
                index={index}
                item={item}
                eventFree={isEventFree}
                orderingClosed={!canOrderItem(item)}
                inCart={inCart.get(item.id) ?? 0}
                onClick={() => openDrink(item)}
              />
            ))}
          </div>
        )}
      </main>

      {/* "Added" — the sheet closing is the only other sign anything happened. */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 sm:bottom-6"
        >
          <span className="glass-ink flex animate-drop items-center gap-2.5 rounded-full py-2.5 pl-2.5 pr-4 font-accent text-sm font-semibold text-surface">
            <span className="flex h-6 w-6 animate-check items-center justify-center rounded-full bg-success text-xs text-white">
              ✓
            </span>
            {toast.text}
          </span>
        </div>
      )}

      {/* The one way out of the menu on a phone, and it goes straight to the order
          page — there is no cart drawer in between. See goToCheckout above. */}
      {cart.itemCount > 0 && (canOrder || codeAtCheckout) && (
        <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-30 animate-rise bg-gradient-to-t from-bg via-bg/80 to-transparent px-4 pt-6 sm:hidden">
          <button
            onClick={goToCheckout}
            className="pressable pointer-events-auto flex w-full cursor-pointer items-center gap-3 rounded-full bg-primary py-2 pl-2 pr-5 font-accent text-[17px] font-semibold tracking-[-0.01em] text-white shadow-xl shadow-primary/35"
          >
            <span
              key={toast?.id ?? 0}
              className="flex h-10 min-w-10 animate-pop items-center justify-center rounded-full bg-surface px-2 font-heading text-base font-bold text-primary"
            >
              {cart.itemCount}
            </span>
            <span className="flex-1 text-left">
              {codeAtCheckout ? 'Continue — Enter Your Code' : 'Place Your Order'}
            </span>
            {cart.total > 0 && !codeAtCheckout ? (
              <span className="text-[15px] tabular-nums opacity-90">${cart.total.toFixed(2)}</span>
            ) : (
              <span aria-hidden>→</span>
            )}
          </button>
        </div>
      )}

      {sheetItem && (
        <ModifierSelector
          isOpen={!!selectedItem}
          onClose={closeDrink}
          item={sheetItem}
          modifierGroups={modifierGroups}
          loading={optionsLoading}
          eventFree={isEventFree}
          preselectIds={preselectIds}
          onAddToCart={handleAddToCart}
        />
      )}
    </div>
  );
}
