'use client';

import { useState, useEffect } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ModifierSelector from '@/components/menu/ModifierSelector';
import { cn } from '@/lib/utils';
import { generateId } from '@/lib/utils';
import type { Category, MenuItem, ModifierGroup, Modifier, Event, CartItem, Coupon } from '@/types';

// ─── Local cart management (separate from global store) ───────────────────────

interface TabletCart {
  items: CartItem[];
  customerName: string;
  subtotal: number;
  total: number;
  coupon: Coupon | null;
  discountAmount: number;
  tipAmount: number;
}

function buildCart(items: CartItem[], customerName: string, coupon: Coupon | null, tipAmount: number): TabletCart {
  const subtotal = items.reduce((s, i) => s + i.item_total, 0);
  let discountAmount = 0;
  if (coupon) {
    if (coupon.discount_type === 'percentage') discountAmount = subtotal * (coupon.discount_value / 100);
    else if (coupon.discount_type === 'fixed_amount') discountAmount = Math.min(coupon.discount_value, subtotal);
    else if (coupon.discount_type === 'free_item') discountAmount = subtotal;
  }
  const total = Math.max(0, subtotal - discountAmount) + tipAmount;
  return { items, customerName, subtotal, total, coupon, discountAmount, tipAmount };
}

// ─── Main page wrapper ────────────────────────────────────────────────────────

export default function TabletPage() {
  return (
    <Elements stripe={stripePromise}>
      <TabletInner />
    </Elements>
  );
}

// ─── Inner component (uses Stripe hooks) ─────────────────────────────────────

type TabletView = 'order' | 'payment' | 'confirmation';

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
  const [tipAmount, setTipAmount] = useState(0);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');

  // UI state
  const [view, setView] = useState<TabletView>('order');
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState('');
  const [confirmedOrderName, setConfirmedOrderName] = useState('');

  const isEventFree = activeEvent?.is_all_free || false;
  const cart = buildCart(cartItems, customerName, coupon, tipAmount);
  const isFreeOrder = cart.total === 0;

  // ── Fetch menu data ──
  useEffect(() => {
    async function fetchMenu() {
      const [catRes, itemRes, eventRes] = await Promise.all([
        supabase.from('categories').select('*').eq('is_active', true).order('display_order'),
        supabase.from('menu_items').select('*').eq('is_available', true).order('display_order'),
        supabase.from('events').select('*').eq('is_active', true).limit(1).single(),
      ]);
      if (catRes.data) {
        setCategories(catRes.data);
        if (catRes.data.length > 0) setActiveCategory(catRes.data[0].id);
      }
      if (itemRes.data) setMenuItems(itemRes.data);
      if (eventRes.data) setActiveEvent(eventRes.data);
      setMenuLoading(false);
    }
    fetchMenu();
  }, []);

  // ── Fetch modifiers for selected item ──
  useEffect(() => {
    if (!selectedItem) return;
    async function fetchModifiers() {
      const { data: links } = await supabase
        .from('item_modifier_groups')
        .select('modifier_group_id')
        .eq('menu_item_id', selectedItem!.id);

      if (!links || links.length === 0) { setModifierGroups([]); return; }

      const groupIds = links.map((l) => l.modifier_group_id);
      const [groupsRes, modsRes] = await Promise.all([
        supabase.from('modifier_groups').select('*').in('id', groupIds).order('display_order'),
        supabase.from('modifiers').select('*').in('group_id', groupIds).eq('is_available', true),
      ]);

      if (!groupsRes.data) { setModifierGroups([]); return; }
      const groupsWithMods = groupsRes.data.map((g) => ({
        ...g,
        modifiers: (modsRes.data || []).filter((m) => m.group_id === g.id),
      }));
      setModifierGroups(groupsWithMods);
    }
    fetchModifiers();
  }, [selectedItem]);

  function addToCart(modifiers: Modifier[], instructions: string) {
    if (!selectedItem) return;
    const modTotal = modifiers.reduce((s, m) => s + m.price_adjustment, 0);
    const effectivePrice = isEventFree ? 0 : (selectedItem.is_free ? 0 : selectedItem.base_price);
    const effectiveMod = isEventFree ? 0 : modTotal;
    const newItem: CartItem = {
      id: generateId(),
      menu_item: selectedItem,
      quantity: 1,
      selected_modifiers: modifiers,
      special_instructions: instructions,
      item_total: effectivePrice + effectiveMod,
    };
    setCartItems((prev) => [...prev, newItem]);
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
        })
      );
    }
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponError('');
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.trim().toUpperCase())
      .eq('is_active', true)
      .single();
    if (error || !data) { setCouponError('Invalid coupon code'); return; }
    const c = data as Coupon;
    if (c.expires_at && new Date(c.expires_at) < new Date()) { setCouponError('Coupon has expired'); return; }
    if (c.max_uses && c.times_used >= c.max_uses) { setCouponError('Coupon has reached max uses'); return; }
    setCoupon(c);
  }

  async function handlePayment() {
    if (!customerName.trim()) { setPayError('Please enter a customer name'); return; }
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

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName.trim(),
          status: 'pending',
          subtotal: cart.subtotal,
          discount_amount: cart.discountAmount,
          tip_amount: cart.tipAmount,
          total: cart.total,
          payment_status: isFreeOrder ? 'free' : 'paid',
          stripe_payment_id: stripePaymentId,
          coupon_id: coupon?.id || null,
          order_source: 'counter',
        })
        .select()
        .single();

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
          .select()
          .single();

        if (orderItem && item.modifiers.length > 0) {
          await supabase.from('order_item_modifiers').insert(
            item.modifiers.map((m) => ({
              order_item_id: orderItem.id,
              modifier_id: m.modifier_id,
              price_adjustment: m.price_adjustment,
            }))
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
    setTipAmount(0);
    setCoupon(null);
    setCouponCode('');
    setCouponError('');
    setPayError('');
    setView('order');
  }

  // ── Confirmation screen ──
  if (view === 'confirmation') {
    return (
      <div className="min-h-screen bg-success flex items-center justify-center p-8">
        <div className="text-center text-white max-w-md">
          <div className="text-8xl mb-6">✓</div>
          <h1 className="text-4xl font-heading font-bold mb-3">Order Placed!</h1>
          <p className="text-xl opacity-90 mb-8">
            {confirmedOrderName}&apos;s order is being made
          </p>
          <button
            onClick={resetForNextOrder}
            className="bg-white text-success font-accent font-bold px-8 py-4 rounded-2xl text-lg shadow-lg hover:bg-gray-50 cursor-pointer touch-manipulation"
          >
            Next Order
          </button>
        </div>
      </div>
    );
  }

  const filteredItems = menuItems.filter((i) => i.category_id === activeCategory);

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-primary text-white px-5 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-heading font-bold">LOTG Coffee</h1>
          {activeEvent && (
            <p className="text-xs opacity-75">
              {activeEvent.name}{isEventFree && ' — Everything Free!'}
            </p>
          )}
        </div>
        <div className="text-sm opacity-75 font-accent">Counter Order</div>
      </header>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left panel: Menu ── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200">
          {/* Category tabs */}
          <div className="bg-surface border-b border-gray-100 px-4 py-2 shrink-0">
            {menuLoading ? (
              <div className="h-10 flex items-center">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
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

          {/* Item grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {menuLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="text-center text-text-light py-12">No items in this category</p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    disabled={!item.is_available}
                    className={cn(
                      'bg-surface rounded-2xl p-4 text-left shadow-sm border border-gray-100 transition-all cursor-pointer touch-manipulation',
                      'active:scale-95 hover:shadow-md hover:border-primary/20',
                      !item.is_available && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {item.image_url && (
                      <div className="w-full h-24 rounded-xl bg-bg mb-3 overflow-hidden">
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <h3 className="font-heading font-bold text-text-dark text-base leading-tight mb-1">
                      {item.name}
                    </h3>
                    {item.description && (
                      <p className="text-xs text-text-light line-clamp-2 mb-2">{item.description}</p>
                    )}
                    <div className="font-accent font-bold text-lg">
                      {isEventFree || item.is_free ? (
                        <span className="text-success">Free</span>
                      ) : (
                        <span className="text-primary">${item.base_price.toFixed(2)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: Cart or Payment ── */}
        <div className="w-80 lg:w-96 flex flex-col bg-surface shrink-0">
          {view === 'order' ? (
            <OrderPanel
              cart={cart}
              customerName={customerName}
              setCustomerName={setCustomerName}
              tipAmount={tipAmount}
              setTipAmount={setTipAmount}
              coupon={coupon}
              setCoupon={setCoupon}
              couponCode={couponCode}
              setCouponCode={setCouponCode}
              couponError={couponError}
              setCouponError={setCouponError}
              applyCoupon={applyCoupon}
              updateQty={updateQty}
              onCharge={() => setView('payment')}
            />
          ) : (
            <PaymentPanel
              cart={cart}
              processing={processing}
              payError={payError}
              isFreeOrder={isFreeOrder}
              onBack={() => setView('order')}
              onPay={handlePayment}
            />
          )}
        </div>
      </div>

      {/* Modifier Modal */}
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

// ─── Order panel (right side — building the order) ────────────────────────────

function OrderPanel({
  cart,
  customerName,
  setCustomerName,
  tipAmount,
  setTipAmount,
  coupon,
  setCoupon,
  couponCode,
  setCouponCode,
  couponError,
  setCouponError,
  applyCoupon,
  updateQty,
  onCharge,
}: {
  cart: TabletCart;
  customerName: string;
  setCustomerName: (v: string) => void;
  tipAmount: number;
  setTipAmount: (v: number) => void;
  coupon: Coupon | null;
  setCoupon: (c: Coupon | null) => void;
  couponCode: string;
  setCouponCode: (v: string) => void;
  couponError: string;
  setCouponError: (v: string) => void;
  applyCoupon: () => void;
  updateQty: (id: string, qty: number) => void;
  onCharge: () => void;
}) {
  return (
    <>
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <h2 className="font-heading font-bold text-text-dark text-lg">Current Order</h2>
      </div>

      {/* Customer name */}
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-gray-100">
        <input
          type="text"
          placeholder="Customer name (required)"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary bg-surface font-body text-base text-text-dark placeholder:text-text-light focus:outline-none transition-colors"
        />
      </div>

      {/* Cart items — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {cart.items.length === 0 ? (
          <div className="text-center py-10 text-text-light">
            <p className="text-4xl mb-2">&#9749;</p>
            <p className="text-sm font-body">Tap items on the left to add them</p>
          </div>
        ) : (
          cart.items.map((item) => (
            <div key={item.id} className="bg-bg rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-body font-semibold text-text-dark text-sm leading-tight">
                    {item.menu_item.name}
                  </p>
                  {item.selected_modifiers.length > 0 && (
                    <p className="text-xs text-text-light mt-0.5 truncate">
                      {item.selected_modifiers.map((m) => m.name).join(', ')}
                    </p>
                  )}
                  {item.special_instructions && (
                    <p className="text-xs text-warm italic mt-0.5 truncate">
                      &ldquo;{item.special_instructions}&rdquo;
                    </p>
                  )}
                </div>
                <span className="font-accent font-bold text-sm shrink-0">
                  {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                </span>
              </div>
              {/* Qty controls */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => updateQty(item.id, item.quantity - 1)}
                  className="w-8 h-8 rounded-lg bg-surface border border-gray-200 font-bold text-text flex items-center justify-center cursor-pointer hover:bg-gray-100 touch-manipulation"
                >
                  −
                </button>
                <span className="text-sm font-accent w-5 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQty(item.id, item.quantity + 1)}
                  className="w-8 h-8 rounded-lg bg-surface border border-gray-200 font-bold text-text flex items-center justify-center cursor-pointer hover:bg-gray-100 touch-manipulation"
                >
                  +
                </button>
                <button
                  onClick={() => updateQty(item.id, 0)}
                  className="ml-auto text-xs text-danger hover:underline cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Coupon + tip */}
      {cart.items.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 space-y-2 shrink-0">
          {coupon ? (
            <div className="flex items-center justify-between bg-success/5 px-3 py-2 rounded-lg text-sm">
              <span className="text-success font-accent font-semibold">{coupon.code} applied</span>
              <button onClick={() => setCoupon(null)} className="text-xs text-danger cursor-pointer">Remove</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Coupon code"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-body focus:outline-none focus:border-primary min-w-0"
              />
              <button
                onClick={applyCoupon}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-accent hover:bg-gray-50 cursor-pointer shrink-0"
              >
                Apply
              </button>
            </div>
          )}
          {couponError && <p className="text-xs text-danger">{couponError}</p>}

          <div className="flex items-center gap-2">
            <span className="text-sm text-text-light font-body shrink-0">Tip</span>
            <input
              type="number"
              min="0"
              step="0.50"
              placeholder="0.00"
              value={tipAmount || ''}
              onChange={(e) => setTipAmount(parseFloat(e.target.value) || 0)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-body focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      )}

      {/* Total + charge button */}
      <div className="px-4 pb-4 pt-3 border-t border-gray-100 shrink-0 space-y-3">
        {cart.items.length > 0 && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-text-light">
              <span>Subtotal</span>
              <span className="font-accent">${cart.subtotal.toFixed(2)}</span>
            </div>
            {cart.discountAmount > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount</span>
                <span className="font-accent">-${cart.discountAmount.toFixed(2)}</span>
              </div>
            )}
            {cart.tipAmount > 0 && (
              <div className="flex justify-between text-text-light">
                <span>Tip</span>
                <span className="font-accent">${cart.tipAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-heading font-bold text-lg pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{cart.total === 0 ? 'Free' : `$${cart.total.toFixed(2)}`}</span>
            </div>
          </div>
        )}
        <button
          onClick={onCharge}
          disabled={cart.items.length === 0 || !customerName.trim()}
          className={cn(
            'w-full py-4 rounded-2xl font-accent font-bold text-lg transition-all touch-manipulation',
            cart.items.length > 0 && customerName.trim()
              ? 'bg-primary text-white hover:bg-primary-light cursor-pointer active:scale-95'
              : 'bg-gray-100 text-text-light cursor-not-allowed',
          )}
        >
          {cart.total === 0 ? 'Place Order' : `Charge $${cart.total.toFixed(2)} →`}
        </button>
      </div>
    </>
  );
}

// ─── Payment panel (right side — customer pays) ───────────────────────────────

function PaymentPanel({
  cart,
  processing,
  payError,
  isFreeOrder,
  onBack,
  onPay,
}: {
  cart: TabletCart;
  processing: boolean;
  payError: string;
  isFreeOrder: boolean;
  onBack: () => void;
  onPay: () => void;
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0">
        <button onClick={onBack} disabled={processing} className="text-text-light hover:text-text cursor-pointer text-xl">
          ←
        </button>
        <h2 className="font-heading font-bold text-text-dark text-lg">Payment</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Order summary */}
        <div className="bg-bg rounded-2xl p-4 space-y-1 text-sm">
          <p className="font-accent font-semibold text-text-dark mb-2">{cart.customerName}</p>
          {cart.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span className="text-text font-body">{item.quantity}× {item.menu_item.name}</span>
              <span className="font-accent text-text">
                {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
              </span>
            </div>
          ))}
          <div className="pt-2 border-t border-gray-200 flex justify-between font-heading font-bold text-lg">
            <span>Total</span>
            <span>{cart.total === 0 ? 'Free' : `$${cart.total.toFixed(2)}`}</span>
          </div>
        </div>

        {/* Card input */}
        {!isFreeOrder && (
          <div>
            <p className="text-sm font-accent font-semibold text-text-dark mb-2">Card Details</p>
            <div className="border-2 border-gray-200 rounded-xl p-4 bg-surface focus-within:border-primary transition-colors">
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
          <p className="text-danger text-sm bg-danger/5 px-4 py-2 rounded-xl">{payError}</p>
        )}
      </div>

      <div className="px-4 pb-6 pt-3 border-t border-gray-100 shrink-0">
        <button
          onClick={onPay}
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
            ? 'Place Order'
            : `Pay $${cart.total.toFixed(2)}`}
        </button>
      </div>
    </>
  );
}
