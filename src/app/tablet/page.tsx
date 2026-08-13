'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import ModifierSelector from '@/components/menu/ModifierSelector';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Stepper from '@/components/ui/Stepper';
import IOSSpinner from '@/components/ui/Spinner';
import { fetchItemModifierGroups } from '@/lib/menu';
import { fetchShopConfig, parseDonationPresets, DEFAULT_SETTINGS } from '@/lib/shop';
import { validateFullName, MAX_NAME_LENGTH } from '@/lib/profanity';
import {
  fadeUp,
  springLayout,
  springPop,
  springSheet,
  springSnappy,
  staggerParent,
} from '@/lib/motion';
import { cn } from '@/lib/utils';
import { generateId } from '@/lib/utils';
import type {
  Category,
  MenuItem,
  ModifierGroup,
  Modifier,
  Event,
  CartItem,
  Coupon,
  ShopSettings,
} from '@/types';

/**
 * Navigation bar for the counter flow's inner steps.
 *
 * Frosted with a leading back chevron, matching the customer-side checkout —
 * a barista and a customer hand this tablet back and forth, and the two halves
 * of that handover shouldn't look like two different applications.
 */
function TabletHeader({
  title,
  subtitle,
  onBack,
  backDisabled,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backDisabled?: boolean;
}) {
  return (
    <header className="material-bar hairline-b flex shrink-0 items-center gap-3 px-3 pb-3 pt-3 pt-safe">
      <motion.button
        whileTap={backDisabled ? undefined : { scale: 0.9 }}
        transition={springSnappy}
        onClick={onBack}
        disabled={backDisabled}
        aria-label="Back"
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-fill-tertiary text-primary touch-manipulation disabled:opacity-40"
      >
        <svg viewBox="0 0 12 20" className="h-[19px] w-[11px]" fill="none">
          <path
            d="M10 2L2 10l8 8"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.button>
      <div className="min-w-0">
        <h1 className="text-ios-title3 truncate text-label">{title}</h1>
        {subtitle && (
          <p className="text-ios-footnote tnum truncate text-label-secondary">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

/**
 * Stripe's card field lives in an iframe and can't inherit our CSS, so its
 * colors are read off the live document and handed over as literals. Without
 * this the card number is near-invisible in dark mode.
 */
function useStripeAppearance() {
  const [style, setStyle] = useState<Record<string, string>>({});

  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setStyle({
        color: cs.getPropertyValue('--label').trim() || '#000',
        placeholder: cs.getPropertyValue('--label-tertiary').trim() || '#999',
        danger: cs.getPropertyValue('--ios-red').trim() || '#FF3B30',
      });
    };
    read();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  return {
    style: {
      base: {
        // Larger than the customer page: this is read at arm's length on a
        // tablet propped on a counter, not held in someone's hand.
        fontSize: '19px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
        color: style.color,
        letterSpacing: '-0.011em',
        '::placeholder': { color: style.placeholder },
      },
      invalid: { color: style.danger, iconColor: style.danger },
    },
  };
}

// ─── Local cart ───────────────────────────────────────────────────────────────

interface TabletCart {
  items: CartItem[];
  customerName: string;
  subtotal: number;
  total: number;
  coupon: Coupon | null;
  discountAmount: number;
  donationAmount: number;
}

function buildCart(
  items: CartItem[],
  customerName: string,
  coupon: Coupon | null,
  donationAmount: number,
): TabletCart {
  const subtotal = items.reduce((s, i) => s + i.item_total, 0);
  let discountAmount = 0;
  if (coupon) {
    if (coupon.discount_type === 'percentage') discountAmount = subtotal * (coupon.discount_value / 100);
    else if (coupon.discount_type === 'fixed_amount') discountAmount = Math.min(coupon.discount_value, subtotal);
    else if (coupon.discount_type === 'free_item') discountAmount = subtotal;
  }
  const total = Math.max(0, subtotal - discountAmount) + donationAmount;
  return { items, customerName, subtotal, total, coupon, discountAmount, donationAmount };
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function TabletPage() {
  return (
    <Elements stripe={stripePromise}>
      <TabletInner />
    </Elements>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

type TabletView = 'order' | 'name' | 'payment' | 'confirmation';

function TabletInner() {
  const stripe = useStripe();
  const elements = useElements();
  const stripeAppearance = useStripeAppearance();

  // Menu data
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  // Cart state
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [donationAmount, setDonationAmount] = useState(0);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [nameError, setNameError] = useState('');

  // Shop settings (donation label / on-off)
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);

  // UI state
  const [view, setView] = useState<TabletView>('order');
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState('');
  const [confirmedOrderName, setConfirmedOrderName] = useState('');

  const isEventFree = activeEvent?.is_all_free || false;
  const cart = buildCart(cartItems, customerName, coupon, donationAmount);
  const isFreeOrder = cart.total === 0;
  const totalItemCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const donationPresets = parseDonationPresets(settings.donation_presets);

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
    setMenuLoading(false);
  }, []);

  useEffect(() => {
    fetchMenu();

    // Keep the counter in sync when someone marks a drink sold out.
    const channel = supabase
      .channel('tablet-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, fetchMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modifiers' }, fetchMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, fetchMenu)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMenu]);

  // Donations and coupons may be switched off mid-shift.
  useEffect(() => {
    if (!settings.donations_enabled && donationAmount > 0) setDonationAmount(0);
  }, [settings.donations_enabled, donationAmount]);

  useEffect(() => {
    if (!settings.coupons_enabled && coupon) setCoupon(null);
  }, [settings.coupons_enabled, coupon]);

  useEffect(() => {
    if (!selectedItem) return;
    let cancelled = false;

    // Clear first, or the modal flashes the previously-tapped drink's options.
    setModifierGroups([]);

    fetchItemModifierGroups(selectedItem.id).then((groups) => {
      if (!cancelled) setModifierGroups(groups);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  function addToCart(modifiers: Modifier[], instructions: string) {
    if (!selectedItem) return;
    const modTotal = modifiers.reduce((s, m) => s + m.price_adjustment, 0);
    const effectivePrice = isEventFree ? 0 : (selectedItem.is_free ? 0 : selectedItem.base_price);
    const effectiveMod = isEventFree ? 0 : modTotal;
    setCartItems((prev) => [
      ...prev,
      {
        id: generateId(),
        menu_item: selectedItem,
        quantity: 1,
        selected_modifiers: modifiers,
        special_instructions: instructions,
        item_total: effectivePrice + effectiveMod,
      },
    ]);
    setSelectedItem(null);
  }

  function updateQty(id: string, qty: number) {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setCartItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const unitPrice = item.item_total / item.quantity;
          return { ...item, quantity: qty, item_total: unitPrice * qty };
        }),
      );
    }
  }

  /** The name lands on the public /live screen, so it gets checked before payment. */
  function goToPayment() {
    const check = validateFullName(customerName);
    if (!check.ok) {
      setNameError(check.error ?? 'Please enter a valid name');
      return;
    }
    setNameError('');
    setView('payment');
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponError('');
    const { data, error } = await supabase
      .from('coupons').select('*')
      .eq('code', couponCode.trim().toUpperCase())
      .eq('is_active', true).single();
    if (error || !data) { setCouponError('Invalid coupon code'); return; }
    const c = data as Coupon;
    if (c.expires_at && new Date(c.expires_at) < new Date()) { setCouponError('Coupon has expired'); return; }
    if (c.max_uses && c.times_used >= c.max_uses) { setCouponError('Coupon has reached max uses'); return; }
    setCoupon(c);
  }

  async function handlePayment() {
    setProcessing(true);
    setPayError('');
    try {
      const orderItems = cartItems.map((item) => ({
        menu_item_id: item.menu_item.id,
        quantity: item.quantity,
        item_price: item.item_total / item.quantity,
        special_instructions: item.special_instructions || null,
        modifiers: item.selected_modifiers.map((m) => ({
          modifier_id: m.id,
          price_adjustment: m.price_adjustment,
        })),
      }));

      let stripePaymentId: string | null = null;
      if (!isFreeOrder) {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(cart.total * 100) }),
        });
        if (!res.ok) throw new Error('Failed to create payment');
        const { clientSecret } = await res.json();
        if (!stripe || !elements) throw new Error('Stripe not loaded');
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) throw new Error('Card element not found');
        const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardElement },
        });
        if (stripeError) throw new Error(stripeError.message);
        stripePaymentId = paymentIntent?.id || null;
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName.trim(),
          status: 'pending',
          subtotal: cart.subtotal,
          discount_amount: cart.discountAmount,
          tip_amount: cart.donationAmount,
          total: cart.total,
          payment_status: isFreeOrder ? 'free' : 'paid',
          stripe_payment_id: stripePaymentId,
          coupon_id: coupon?.id || null,
          order_source: 'counter',
          // Stamps which event this order belongs to, so the dashboard can report per-event.
          event_id: activeEvent?.id ?? null,
        })
        .select().single();

      if (orderError || !order) throw new Error('Failed to create order');

      for (const item of orderItems) {
        const { data: orderItem } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
            item_price: item.item_price,
            special_instructions: item.special_instructions,
          })
          .select().single();
        if (orderItem && item.modifiers.length > 0) {
          await supabase.from('order_item_modifiers').insert(
            item.modifiers.map((m) => ({
              order_item_id: orderItem.id,
              modifier_id: m.modifier_id,
              price_adjustment: m.price_adjustment,
            })),
          );
        }
      }

      if (coupon) {
        await supabase.from('coupons').update({ times_used: coupon.times_used + 1 }).eq('id', coupon.id);
      }

      setConfirmedOrderName(customerName.trim());
      setView('confirmation');
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setProcessing(false);
    }
  }

  function resetForNextOrder() {
    setCartItems([]);
    setCustomerName('');
    setDonationAmount(0);
    setCoupon(null);
    setCouponCode('');
    setCouponError('');
    setNameError('');
    setPayError('');
    setView('order');
  }

  // ── Step 4: Confirmation ──────────────────────────────────────────────────

  if (view === 'confirmation') {
    return (
      <div className="flex min-h-screen-safe items-center justify-center bg-success p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springPop}
          className="max-w-md text-center text-white"
        >
          {/* Drawn checkmark rather than a glyph, so it can animate — the tick
              landing is the signal the barista is watching for before they
              hand the tablet back and start the next order. */}
          <motion.svg
            viewBox="0 0 52 52"
            className="mx-auto mb-6 h-28 w-28"
            initial="hidden"
            animate="show"
          >
            <motion.circle
              cx="26"
              cy="26"
              r="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.4"
              variants={{
                hidden: { pathLength: 0 },
                show: { pathLength: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
              }}
            />
            <motion.path
              d="M14 27l8 8 16-16"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              variants={{
                hidden: { pathLength: 0 },
                show: {
                  pathLength: 1,
                  transition: { duration: 0.35, delay: 0.3, ease: [0.16, 1, 0.3, 1] },
                },
              }}
            />
          </motion.svg>

          <h1 className="text-ios-largetitle mb-3 text-white">Order Placed</h1>
          <p className="text-ios-title3 mb-8 font-normal text-white/90">
            {confirmedOrderName}&apos;s order is on its way
          </p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            onClick={resetForNextOrder}
            className="min-h-[60px] cursor-pointer touch-manipulation rounded-full bg-white px-10 text-[20px] font-semibold text-success shadow-lg"
          >
            Next Order
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ── Step 3: Payment (customer pays) ──────────────────────────────────────

  if (view === 'payment') {
    return (
      <div className="flex min-h-screen-safe flex-col bg-bg">
        <TabletHeader
          title="Payment"
          subtitle={customerName}
          onBack={() => setView('name')}
          backDisabled={processing}
        />

        <main className="scroll-ios flex-1 overflow-y-auto">
          <motion.div
            key="payment"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={springSheet}
            className="mx-auto max-w-md space-y-5 px-4 py-8 pb-safe-4"
          >
            {/* Order recap */}
            <div className="space-y-2 rounded-[var(--r-xl)] bg-surface p-5 shadow-sm">
              <h2 className="text-ios-title3 mb-3 text-label">Order for {customerName}</h2>
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ios-subhead font-semibold text-label">
                      {item.quantity}× {item.menu_item.name}
                    </p>
                    {item.selected_modifiers.length > 0 && (
                      <p className="text-ios-caption text-label-secondary">
                        {item.selected_modifiers.map((m) => m.name).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="tnum text-ios-subhead shrink-0 font-semibold text-label">
                    {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                  </span>
                </div>
              ))}
              {cart.discountAmount > 0 && (
                <div className="text-ios-subhead flex justify-between pt-1 text-success">
                  <span>Discount ({cart.coupon?.code})</span>
                  <span className="tnum">−${cart.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {cart.donationAmount > 0 && (
                <div className="text-ios-subhead flex justify-between pt-1 text-label-secondary">
                  <span>{settings.donation_label}</span>
                  <span className="tnum">${cart.donationAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="hairline-t text-ios-title1 flex justify-between pt-3 text-label">
                <span>Total</span>
                <span className="tnum">
                  {cart.total === 0 ? 'Free' : `$${cart.total.toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* Card input */}
            {!isFreeOrder && (
              <div className="rounded-[var(--r-xl)] bg-surface p-5 shadow-sm">
                <h3 className="text-ios-headline mb-4 text-label">Enter Card Details</h3>
                <div className="rounded-[var(--r-md)] bg-fill-tertiary p-4">
                  <CardElement options={stripeAppearance} />
                </div>
              </div>
            )}

            <AnimatePresence>
              {payError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={springSnappy}
                  className="text-ios-subhead overflow-hidden rounded-[var(--r-md)] bg-danger/12 px-4 py-3 text-danger"
                >
                  {payError}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              whileTap={processing ? undefined : { scale: 0.97 }}
              transition={springSnappy}
              onClick={handlePayment}
              disabled={processing}
              className={cn(
                'flex w-full items-center justify-center gap-2.5 rounded-full py-5 text-[20px] font-semibold touch-manipulation',
                processing
                  ? 'cursor-not-allowed bg-fill-tertiary text-label-tertiary'
                  : 'cursor-pointer bg-success text-white shadow-sm',
              )}
            >
              {processing && <IOSSpinner size={20} />}
              {processing
                ? 'Processing…'
                : isFreeOrder
                  ? 'Place Order — Free!'
                  : `Pay $${cart.total.toFixed(2)}`}
            </motion.button>
          </motion.div>
        </main>
      </div>
    );
  }

  // ── Step 2: Customer name + order review ─────────────────────────────────

  if (view === 'name') {
    return (
      <div className="flex min-h-screen-safe flex-col bg-bg">
        <TabletHeader
          title="Customer Name"
          subtitle={`${totalItemCount} item${totalItemCount !== 1 ? 's' : ''} · ${
            cart.subtotal === 0 ? 'Free' : `$${cart.subtotal.toFixed(2)}`
          }`}
          onBack={() => setView('order')}
        />

        <main className="scroll-ios flex-1 overflow-y-auto">
          <motion.div
            key="name"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={springSheet}
            className="mx-auto max-w-lg space-y-5 px-4 py-8 pb-safe-4"
          >
            {/* Order summary + editable quantities */}
            <div className="space-y-3 rounded-[var(--r-xl)] bg-surface p-5 shadow-sm">
              <h2 className="text-ios-title3 text-label">Order Summary</h2>
              <AnimatePresence initial={false} mode="popLayout">
                {cart.items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    transition={springLayout}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-ios-subhead font-semibold text-label">
                        {item.menu_item.name}
                      </p>
                      {item.selected_modifiers.length > 0 && (
                        <p className="text-ios-caption text-label-secondary">
                          {item.selected_modifiers.map((m) => m.name).join(' · ')}
                        </p>
                      )}
                      <p className="tnum text-ios-subhead mt-0.5 font-semibold text-primary">
                        {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                      </p>
                    </div>
                    <Stepper
                      value={item.quantity}
                      onChange={(q) => updateQty(item.id, q)}
                      className="shrink-0"
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Coupon — hidden when the admin turns coupons off */}
              {settings.coupons_enabled && (
                <div className="hairline-t pt-3">
                  {coupon ? (
                    <div className="flex items-center justify-between">
                      <span className="text-ios-subhead font-semibold text-success">
                        {coupon.code} applied
                      </span>
                      <button
                        onClick={() => setCoupon(null)}
                        className="press cursor-pointer text-[15px] text-danger"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Coupon code"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponError('');
                        }}
                        className="min-w-0 flex-1 rounded-[var(--r-md)] bg-fill-tertiary px-3.5 py-2.5 text-[16px] text-label placeholder:text-label-tertiary focus:outline-none focus:ring-2 focus:ring-primary/25"
                      />
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        transition={springSnappy}
                        onClick={applyCoupon}
                        className="shrink-0 cursor-pointer rounded-full bg-primary/12 px-5 py-2.5 text-[15px] font-semibold text-primary"
                      >
                        Apply
                      </motion.button>
                    </div>
                  )}
                  {couponError && (
                    <p className="text-ios-caption mt-1.5 text-danger">{couponError}</p>
                  )}
                </div>
              )}

              {/* Donation — hidden when the admin turns donations off */}
              {settings.donations_enabled && (
                <div className="hairline-t pt-3">
                  <p className="text-ios-subhead mb-2 text-label-secondary">
                    {settings.donation_label} (optional)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {donationPresets.map((amount) => (
                      <motion.button
                        key={amount}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        transition={springSnappy}
                        onClick={() => setDonationAmount(donationAmount === amount ? 0 : amount)}
                        className={cn(
                          'tnum cursor-pointer touch-manipulation rounded-full px-5 py-2.5 text-[15px] font-semibold',
                          'transition-colors duration-200 ease-[var(--ease-out-ios)]',
                          donationAmount === amount
                            ? 'bg-success text-white shadow-sm'
                            : 'bg-fill-tertiary text-label',
                        )}
                      >
                        ${amount.toFixed(2)}
                      </motion.button>
                    ))}
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.50"
                      placeholder="Other"
                      value={donationAmount || ''}
                      onChange={(e) =>
                        setDonationAmount(Math.max(0, parseFloat(e.target.value) || 0))
                      }
                      className="w-28 rounded-[var(--r-md)] bg-fill-tertiary px-3.5 py-2.5 text-[16px] text-label placeholder:text-label-tertiary focus:outline-none focus:ring-2 focus:ring-primary/25"
                    />
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="hairline-t text-ios-title2 flex justify-between pt-3 text-label">
                <span>Total</span>
                <span className="tnum">
                  {cart.total === 0 ? 'Free' : `$${cart.total.toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* Name input */}
            <div className="rounded-[var(--r-xl)] bg-surface p-5 shadow-sm">
              <label className="text-ios-title3 mb-1 block text-label">
                Customer&apos;s first &amp; last name
              </label>
              <p className="text-ios-subhead mb-3 text-label-secondary">
                A last initial is enough — e.g. Sarah K
              </p>
              <input
                type="text"
                placeholder="e.g. Sarah K"
                value={customerName}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (nameError) setNameError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && goToPayment()}
                autoFocus
                className={cn(
                  'w-full rounded-[var(--r-md)] bg-fill-tertiary px-4 py-4 text-[22px] text-label',
                  'placeholder:text-label-tertiary focus:outline-none focus:ring-[3px]',
                  nameError ? 'ring-2 ring-danger' : 'focus:ring-primary/25',
                )}
              />
              {nameError && <p className="text-ios-subhead mt-2 text-danger">{nameError}</p>}
            </div>

            <motion.button
              whileTap={customerName.trim() ? { scale: 0.97 } : undefined}
              transition={springSnappy}
              onClick={goToPayment}
              disabled={!customerName.trim()}
              className={cn(
                'w-full rounded-full py-5 text-[20px] font-semibold touch-manipulation',
                customerName.trim()
                  ? 'cursor-pointer bg-primary text-white shadow-sm'
                  : 'cursor-not-allowed bg-fill-tertiary text-label-tertiary',
              )}
            >
              Proceed to Payment →
            </motion.button>
          </motion.div>
        </main>
      </div>
    );
  }

  // ── Step 1: Build the order ───────────────────────────────────────────────

  const filteredItems = menuItems.filter((i) => i.category_id === activeCategory);

  return (
    <div className="flex min-h-screen-safe flex-col bg-bg">
      {/* Header */}
      <header className="material-bar hairline-b shrink-0 px-4 pb-2.5 pt-3 pt-safe">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <h1 className="text-ios-title2 text-label">LOTG Coffee</h1>
            {activeEvent && (
              <p className="text-ios-caption text-warm">
                {activeEvent.name}
                {isEventFree && ' — Everything Free!'}
              </p>
            )}
          </div>
          <span className="text-ios-footnote rounded-full bg-fill-tertiary px-3 py-1 font-medium text-label-secondary">
            Counter Order
          </span>
        </div>
      </header>

      {/* Category tabs — sticky */}
      <div className="material-bar hairline-b sticky top-0 z-20 shrink-0">
        <div className="mx-auto max-w-5xl px-4 py-2.5">
          {menuLoading ? (
            <div className="flex h-9 items-center">
              <IOSSpinner size={18} />
            </div>
          ) : (
            <SegmentedControl
              scrollable
              segments={categories.map((c) => ({ id: c.id, label: c.name }))}
              activeId={activeCategory}
              onSelect={setActiveCategory}
            />
          )}
        </div>
      </div>

      {/* Item grid — scrollable, padded to not hide behind bottom bar */}
      <main className="scroll-ios flex-1 overflow-y-auto pb-32">
        <div className="mx-auto max-w-5xl px-4 py-4">
          {menuLoading ? (
            <div className="flex justify-center py-20">
              <IOSSpinner size={28} />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="text-ios-body py-20 text-center text-label-tertiary">
              No items in this category
            </p>
          ) : (
            <motion.div
              key={activeCategory}
              variants={staggerParent}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {filteredItems.map((item) => {
                const soldOut = item.is_sold_out;

                return (
                  <motion.button
                    key={item.id}
                    variants={fadeUp}
                    whileTap={soldOut ? undefined : { scale: 0.95 }}
                    transition={springSnappy}
                    onClick={() => setSelectedItem(item)}
                    disabled={soldOut}
                    className={cn(
                      'relative flex flex-col rounded-[var(--r-lg)] bg-surface p-4 text-left shadow-sm touch-manipulation',
                      soldOut ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hoverable',
                    )}
                  >
                    {item.image_url && (
                      <div className="mb-3 h-20 w-full overflow-hidden rounded-[var(--r-md)] bg-fill-quaternary">
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className={cn('h-full w-full object-cover', soldOut && 'grayscale')}
                        />
                      </div>
                    )}
                    <h3 className="text-ios-subhead mb-1 font-semibold leading-tight text-label">
                      {item.name}
                    </h3>
                    {item.description && (
                      <p className="text-ios-caption mb-2 line-clamp-2 text-label-secondary">
                        {item.description}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span className="tnum text-ios-callout font-semibold">
                        {isEventFree || item.is_free ? (
                          <span className="text-success">Free</span>
                        ) : (
                          <span className={soldOut ? 'text-label-tertiary line-through' : 'text-label'}>
                            ${item.base_price.toFixed(2)}
                          </span>
                        )}
                      </span>
                      {soldOut && (
                        <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Sold Out
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </div>
      </main>

      {/* Sticky bottom bar — cart summary + continue */}
      <div className="material-bar hairline-t fixed bottom-0 left-0 right-0 z-20 px-4 py-3 pb-safe-4">
        <div className="mx-auto max-w-5xl">
          <AnimatePresence mode="wait" initial={false}>
            {cartItems.length === 0 ? (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-ios-subhead py-1 text-center text-label-tertiary"
              >
                Tap items above to start the order
              </motion.p>
            ) : (
              <motion.div
                key="filled"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={springSnappy}
                className="flex items-center gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ios-caption tnum mb-0.5 text-label-secondary">
                    {totalItemCount} item{totalItemCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-ios-subhead truncate text-label">
                    {cartItems
                      .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.menu_item.name}`)
                      .join(', ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tnum text-ios-title3 text-label">
                    {cart.subtotal === 0 ? 'Free' : `$${cart.subtotal.toFixed(2)}`}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={springSnappy}
                    onClick={() => setView('name')}
                    className="cursor-pointer touch-manipulation whitespace-nowrap rounded-full bg-primary px-6 py-3.5 text-[17px] font-semibold text-white shadow-sm"
                  >
                    Enter Name →
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modifier modal */}
      {selectedItem && (
        <ModifierSelector
          isOpen
          onClose={() => setSelectedItem(null)}
          item={selectedItem}
          modifierGroups={modifierGroups}
          eventFree={isEventFree}
          onAddToCart={addToCart}
        />
      )}
    </div>
  );
}
