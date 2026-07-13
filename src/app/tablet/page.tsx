'use client';

import { useState, useEffect, useCallback } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import ModifierSelector from '@/components/menu/ModifierSelector';
import { fetchItemModifierGroups } from '@/lib/menu';
import { fetchShopConfig, parseDonationPresets, DEFAULT_SETTINGS } from '@/lib/shop';
import { validateFullName, MAX_NAME_LENGTH } from '@/lib/profanity';
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
      <div className="min-h-screen bg-success flex items-center justify-center p-8">
        <div className="text-center text-white max-w-md">
          <div className="text-8xl mb-6">✓</div>
          <h1 className="text-4xl font-heading font-bold mb-3">Order Placed!</h1>
          <p className="text-xl opacity-90 mb-8">
            {confirmedOrderName}&apos;s order is on its way
          </p>
          <button
            onClick={resetForNextOrder}
            className="bg-white text-success font-accent font-bold px-10 py-5 rounded-2xl text-xl shadow-lg hover:bg-gray-50 cursor-pointer touch-manipulation active:scale-95 transition-all"
          >
            Next Order
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Payment (customer pays) ──────────────────────────────────────

  if (view === 'payment') {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <header className="bg-primary text-white px-4 py-4 flex items-center gap-4 shrink-0">
          <button
            onClick={() => setView('name')}
            disabled={processing}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer touch-manipulation disabled:opacity-40 text-xl"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-heading font-bold">Payment</h1>
            <p className="text-sm opacity-75">{customerName}</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-md mx-auto px-4 py-8 space-y-5">
            {/* Order recap */}
            <div className="bg-surface rounded-2xl p-5 shadow-sm space-y-2">
              <h2 className="font-heading font-bold text-text-dark text-lg mb-3">
                Order for {customerName}
              </h2>
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm gap-3">
                  <div className="min-w-0">
                    <p className="font-body font-semibold">
                      {item.quantity}× {item.menu_item.name}
                    </p>
                    {item.selected_modifiers.length > 0 && (
                      <p className="text-xs text-text-light">
                        {item.selected_modifiers.map((m) => m.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="font-accent font-semibold shrink-0">
                    {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                  </span>
                </div>
              ))}
              {cart.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-success pt-1">
                  <span>Discount ({cart.coupon?.code})</span>
                  <span className="font-accent">−${cart.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {cart.donationAmount > 0 && (
                <div className="flex justify-between text-sm text-text-light pt-1">
                  <span>{settings.donation_label}</span>
                  <span className="font-accent">${cart.donationAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-3 border-t border-gray-100 flex justify-between font-heading font-bold text-2xl">
                <span>Total</span>
                <span>{cart.total === 0 ? 'Free' : `$${cart.total.toFixed(2)}`}</span>
              </div>
            </div>

            {/* Card input */}
            {!isFreeOrder && (
              <div className="bg-surface rounded-2xl p-5 shadow-sm">
                <h3 className="font-heading font-bold text-text-dark mb-4">Enter Card Details</h3>
                <div className="border-2 border-gray-200 rounded-xl p-4 focus-within:border-primary transition-colors">
                  <CardElement
                    options={{
                      style: {
                        base: {
                          fontSize: '18px',
                          fontFamily: 'Nunito, sans-serif',
                          color: '#54595F',
                          '::placeholder': { color: '#7A7A7A' },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}

            {payError && (
              <p className="text-danger text-sm bg-danger/5 px-4 py-3 rounded-xl">{payError}</p>
            )}

            <button
              onClick={handlePayment}
              disabled={processing}
              className={cn(
                'w-full py-5 rounded-2xl font-accent font-bold text-xl transition-all touch-manipulation',
                processing
                  ? 'bg-gray-100 text-text-light cursor-not-allowed'
                  : 'bg-success text-white hover:bg-success-light cursor-pointer active:scale-95',
              )}
            >
              {processing
                ? 'Processing...'
                : isFreeOrder
                ? 'Place Order — Free!'
                : `Pay $${cart.total.toFixed(2)}`}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Step 2: Customer name + order review ─────────────────────────────────

  if (view === 'name') {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <header className="bg-primary text-white px-4 py-4 flex items-center gap-4 shrink-0">
          <button
            onClick={() => setView('order')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer touch-manipulation text-xl"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-heading font-bold">Customer Name</h1>
            <p className="text-sm opacity-75">
              {totalItemCount} item{totalItemCount !== 1 ? 's' : ''} ·{' '}
              {cart.subtotal === 0 ? 'Free' : `$${cart.subtotal.toFixed(2)}`}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
            {/* Order summary + editable quantities */}
            <div className="bg-surface rounded-2xl p-5 shadow-sm space-y-3">
              <h2 className="font-heading font-bold text-text-dark text-lg">Order Summary</h2>
              {cart.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-body font-semibold text-sm">
                      {item.menu_item.name}
                    </p>
                    {item.selected_modifiers.length > 0 && (
                      <p className="text-xs text-text-light">
                        {item.selected_modifiers.map((m) => m.name).join(', ')}
                      </p>
                    )}
                    <p className="text-sm font-accent font-semibold text-primary mt-0.5">
                      {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => updateQty(item.id, item.quantity - 1)}
                      className="w-8 h-8 rounded-lg border border-gray-200 bg-bg font-bold flex items-center justify-center cursor-pointer hover:bg-gray-100 touch-manipulation"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-accent font-bold">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.id, item.quantity + 1)}
                      className="w-8 h-8 rounded-lg border border-gray-200 bg-bg font-bold flex items-center justify-center cursor-pointer hover:bg-gray-100 touch-manipulation"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              {/* Coupon — hidden when the admin turns coupons off */}
              {settings.coupons_enabled && (
              <div className="pt-3 border-t border-gray-100">
                {coupon ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-success font-accent font-semibold">{coupon.code} applied</span>
                    <button onClick={() => setCoupon(null)} className="text-xs text-danger cursor-pointer hover:underline">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Coupon code"
                      value={couponCode}
                      onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                      className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-body focus:outline-none focus:border-primary min-w-0"
                    />
                    <button
                      onClick={applyCoupon}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-accent hover:bg-gray-50 cursor-pointer shrink-0"
                    >
                      Apply
                    </button>
                  </div>
                )}
                {couponError && <p className="text-xs text-danger mt-1">{couponError}</p>}
              </div>
              )}

              {/* Donation — hidden when the admin turns donations off */}
              {settings.donations_enabled && (
                <div>
                  <p className="mb-2 font-body text-sm text-text-light">
                    {settings.donation_label} (optional)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {donationPresets.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() =>
                          setDonationAmount(donationAmount === amount ? 0 : amount)
                        }
                        className={cn(
                          'cursor-pointer touch-manipulation rounded-xl border-2 px-4 py-2.5 font-accent text-sm font-bold transition-all active:scale-95',
                          donationAmount === amount
                            ? 'border-success bg-success text-white'
                            : 'border-gray-200 bg-surface text-text hover:border-success/40',
                        )}
                      >
                        ${amount.toFixed(2)}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="0"
                      step="0.50"
                      placeholder="Other"
                      value={donationAmount || ''}
                      onChange={(e) => setDonationAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-28 rounded-xl border border-gray-200 px-3 py-2.5 font-body text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="pt-3 border-t border-gray-100 flex justify-between font-heading font-bold text-xl">
                <span>Total</span>
                <span>{cart.total === 0 ? 'Free' : `$${cart.total.toFixed(2)}`}</span>
              </div>
            </div>

            {/* Name input */}
            <div className="bg-surface rounded-2xl p-5 shadow-sm">
              <label className="block font-heading font-bold text-text-dark text-lg mb-1">
                Customer&apos;s first &amp; last name
              </label>
              <p className="mb-3 font-body text-sm text-text-light">
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
                  'w-full px-4 py-4 rounded-xl border-2 bg-bg font-body text-xl text-text-dark placeholder:text-text-light focus:outline-none transition-colors',
                  nameError ? 'border-danger' : 'border-gray-200 focus:border-primary',
                )}
              />
              {nameError && <p className="mt-2 text-sm font-body text-danger">{nameError}</p>}
            </div>

            <button
              onClick={goToPayment}
              disabled={!customerName.trim()}
              className={cn(
                'w-full py-5 rounded-2xl font-accent font-bold text-xl transition-all touch-manipulation',
                customerName.trim()
                  ? 'bg-primary text-white hover:bg-primary-light cursor-pointer active:scale-95'
                  : 'bg-gray-100 text-text-light cursor-not-allowed',
              )}
            >
              Proceed to Payment →
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Step 1: Build the order ───────────────────────────────────────────────

  const filteredItems = menuItems.filter((i) => i.category_id === activeCategory);

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-3 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-heading font-bold">LOTG Coffee</h1>
            {activeEvent && (
              <p className="text-xs opacity-75">
                {activeEvent.name}{isEventFree && ' — Everything Free!'}
              </p>
            )}
          </div>
          <span className="text-sm opacity-75 font-accent">Counter Order</span>
        </div>
      </header>

      {/* Category tabs — sticky */}
      <div className="bg-surface border-b border-gray-100 sticky top-0 z-20 shrink-0">
        <div className="max-w-5xl mx-auto px-4">
          {menuLoading ? (
            <div className="h-14 flex items-center">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto py-2.5 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    'px-4 py-2.5 rounded-xl text-sm font-accent font-semibold whitespace-nowrap transition-colors cursor-pointer touch-manipulation shrink-0',
                    activeCategory === cat.id
                      ? 'bg-primary text-white'
                      : 'bg-bg text-text hover:bg-gray-100',
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Item grid — scrollable, padded to not hide behind bottom bar */}
      <main className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-5xl mx-auto px-4 py-4">
          {menuLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="text-center text-text-light py-20">No items in this category</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredItems.map((item) => {
                const soldOut = item.is_sold_out;

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    disabled={soldOut}
                    className={cn(
                      'relative bg-surface rounded-2xl p-4 text-left shadow-sm border border-gray-100 transition-all touch-manipulation',
                      soldOut
                        ? 'cursor-not-allowed border-danger/30 bg-danger/5 opacity-70'
                        : 'cursor-pointer active:scale-95 hover:shadow-md hover:border-primary/20',
                    )}
                  >
                    {item.image_url && (
                      <div className="w-full h-20 rounded-xl bg-bg mb-3 overflow-hidden">
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className={cn('w-full h-full object-cover', soldOut && 'grayscale')}
                        />
                      </div>
                    )}
                    <h3 className="font-heading font-bold text-text-dark text-sm leading-tight mb-1">
                      {item.name}
                    </h3>
                    {item.description && (
                      <p className="text-xs text-text-light line-clamp-2 mb-2">{item.description}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span className="font-accent font-bold text-base">
                        {isEventFree || item.is_free ? (
                          <span className="text-success">Free</span>
                        ) : (
                          <span className={soldOut ? 'text-text-light line-through' : 'text-primary'}>
                            ${item.base_price.toFixed(2)}
                          </span>
                        )}
                      </span>
                      {soldOut && (
                        <span className="rounded-full bg-danger px-2 py-0.5 font-accent text-[10px] font-bold uppercase tracking-wide text-white">
                          Sold Out
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Sticky bottom bar — cart summary + continue */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-gray-200 px-4 py-3 z-20">
        <div className="max-w-5xl mx-auto">
          {cartItems.length === 0 ? (
            <p className="text-center text-text-light text-sm font-body py-1">
              Tap items above to start the order
            </p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-light font-accent mb-0.5">
                  {totalItemCount} item{totalItemCount !== 1 ? 's' : ''}
                </p>
                <p className="text-sm font-body text-text truncate">
                  {cartItems.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.menu_item.name}`).join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-heading font-bold text-lg text-text-dark">
                  {cart.subtotal === 0 ? 'Free' : `$${cart.subtotal.toFixed(2)}`}
                </span>
                <button
                  onClick={() => setView('name')}
                  className="bg-primary text-white font-accent font-bold px-5 py-3 rounded-xl hover:bg-primary-light cursor-pointer touch-manipulation active:scale-95 transition-all whitespace-nowrap text-base"
                >
                  Enter Name →
                </button>
              </div>
            </div>
          )}
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
