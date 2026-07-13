'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { cartStore } from '@/lib/cart-store';
import { useCart } from '@/lib/hooks';
import {
  fetchShopConfig,
  getShopStatus,
  parseDonationPresets,
  DEFAULT_SETTINGS,
} from '@/lib/shop';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { ClosedNotice } from '@/components/ShopBanner';
import { validateFullName, MAX_NAME_LENGTH } from '@/lib/profanity';
import { cn } from '@/lib/utils';
import type { Coupon, ShopSettings, OrderingHours } from '@/types';

function CheckoutForm() {
  const router = useRouter();
  const cart = useCart();
  const stripe = useStripe();
  const elements = useElements();
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [queueWait, setQueueWait] = useState<number | null>(null);

  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [hours, setHours] = useState<OrderingHours[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);
  /** Tags the order with the event running when it was placed, for the dashboard's event reports. */
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  const status = getShopStatus(settings, hours);
  const isFreeOrder = cart.total === 0;
  const cartItemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const donationPresets = parseDonationPresets(settings.donation_presets);

  useEffect(() => {
    async function load() {
      const [config, { data: activeOrders }, { data: activeEvent }] = await Promise.all([
        fetchShopConfig(),
        supabase
          .from('orders')
          .select('id')
          .in('status', ['pending', 'in_progress'])
          .is('archived_at', null),
        supabase.from('events').select('id').eq('is_active', true).limit(1).maybeSingle(),
      ]);

      setSettings(config.settings);
      setHours(config.hours);
      setActiveEventId(activeEvent?.id ?? null);
      setConfigLoaded(true);

      if (!activeOrders || activeOrders.length === 0) {
        setQueueWait(0);
        return;
      }

      const { data: items } = await supabase
        .from('order_items')
        .select('quantity')
        .in('order_id', activeOrders.map((o) => o.id));

      setQueueWait(items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0);
    }
    load();
  }, []);

  // Donations may have been switched off after something was already added.
  useEffect(() => {
    if (configLoaded && !settings.donations_enabled && cart.donation_amount > 0) {
      cartStore.setDonation(0);
    }
  }, [configLoaded, settings.donations_enabled, cart.donation_amount]);

  // Same for a coupon applied before the admin turned coupons off.
  useEffect(() => {
    if (configLoaded && !settings.coupons_enabled && cart.coupon) {
      cartStore.removeCoupon();
    }
  }, [configLoaded, settings.coupons_enabled, cart.coupon]);

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');

    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      setCouponError('Invalid coupon code');
      setCouponLoading(false);
      return;
    }

    const coupon = data as Coupon;

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      setCouponError('Coupon has expired');
      setCouponLoading(false);
      return;
    }

    if (coupon.max_uses && coupon.times_used >= coupon.max_uses) {
      setCouponError('Coupon has reached maximum uses');
      setCouponLoading(false);
      return;
    }

    cartStore.applyCoupon(coupon);
    setCouponLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // This name goes up on the lobby TV, so it has to pass before we take money.
    const nameCheck = validateFullName(cart.customer_name);
    if (!nameCheck.ok) {
      setNameError(nameCheck.error ?? 'Please enter a valid name');
      setError('');
      return;
    }
    setNameError('');

    // Re-check against the live schedule — the shop may have closed while this page sat open.
    const freshConfig = await fetchShopConfig();
    if (!getShopStatus(freshConfig.settings, freshConfig.hours).isOpen) {
      setSettings(freshConfig.settings);
      setHours(freshConfig.hours);
      setError('Ordering just closed — your order was not placed.');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const orderItems = cart.items.map((item) => ({
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
          customer_name: cart.customer_name.trim(),
          status: 'pending',
          subtotal: cart.subtotal,
          discount_amount: cart.discount_amount,
          tip_amount: cart.donation_amount,
          total: cart.total,
          payment_status: isFreeOrder ? 'free' : 'paid',
          stripe_payment_id: stripePaymentId,
          coupon_id: cart.coupon?.id || null,
          order_source: 'mobile',
          event_id: activeEventId,
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

      if (cart.coupon) {
        await supabase
          .from('coupons')
          .update({ times_used: cart.coupon.times_used + 1 })
          .eq('id', cart.coupon.id);
      }

      // Deduct inventory
      for (const item of cart.items) {
        const { data: itemIngredients } = await supabase
          .from('item_ingredients')
          .select('*, inventory_item:inventory_items(*)')
          .eq('menu_item_id', item.menu_item.id);

        if (itemIngredients) {
          for (const ingredient of itemIngredients) {
            const amount = ingredient.quantity_used * item.quantity;
            await supabase
              .from('inventory_items')
              .update({ current_stock: ingredient.inventory_item.current_stock - amount })
              .eq('id', ingredient.inventory_item_id);

            await supabase.from('inventory_log').insert({
              inventory_item_id: ingredient.inventory_item_id,
              change_amount: -amount,
              reason: 'order',
              order_id: order.id,
            });
          }
        }

        for (const mod of item.selected_modifiers) {
          const { data: modIngredients } = await supabase
            .from('item_ingredients')
            .select('*, inventory_item:inventory_items(*)')
            .eq('modifier_id', mod.id);

          if (modIngredients) {
            for (const ingredient of modIngredients) {
              const amount = ingredient.quantity_used * item.quantity;
              await supabase
                .from('inventory_items')
                .update({ current_stock: ingredient.inventory_item.current_stock - amount })
                .eq('id', ingredient.inventory_item_id);

              await supabase.from('inventory_log').insert({
                inventory_item_id: ingredient.inventory_item_id,
                change_amount: -amount,
                reason: 'order',
                order_id: order.id,
              });
            }
          }
        }
      }

      const customerName = cart.customer_name.trim();
      cartStore.clear();
      const estimatedWait = queueWait !== null ? queueWait + cartItemCount : null;
      const waitParam = estimatedWait !== null ? `&wait=${estimatedWait}` : '';
      router.push(`/checkout/confirmation?name=${encodeURIComponent(customerName)}${waitParam}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setProcessing(false);
    }
  }

  const orderingClosed = configLoaded && !status.isOpen;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-4">
          <button
            onClick={() => router.push('/')}
            className="cursor-pointer text-text-light hover:text-text"
          >
            &larr;
          </button>
          <h1 className="font-heading text-xl font-bold">Place Your Coffee Order</h1>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">
        {orderingClosed && (
          <div className="mb-6">
            <ClosedNotice settings={settings} status={status} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <Input
              label="First & Last Name"
              placeholder="e.g. Sarah K"
              value={cart.customer_name}
              maxLength={MAX_NAME_LENGTH}
              error={nameError}
              onChange={(e) => {
                cartStore.setCustomerName(e.target.value);
                if (nameError) setNameError('');
              }}
              onBlur={(e) => {
                const check = validateFullName(e.target.value);
                if (e.target.value.trim() && !check.ok) setNameError(check.error ?? '');
              }}
              required
            />
            <p className="mt-1.5 font-body text-xs text-text-light">
              A last initial is enough — it&apos;s how we tell two Sarahs apart when we call
              your order.
            </p>
          </Card>

          <Card>
            <h3 className="mb-3 font-heading font-bold text-text-dark">Your Drinks</h3>
            <div className="space-y-2">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div>
                    <span className="font-body">
                      {item.quantity}x {item.menu_item.name}
                    </span>
                    {item.selected_modifiers.length > 0 && (
                      <span className="block text-xs text-text-light">
                        {item.selected_modifiers.map((m) => m.name).join(', ')}
                      </span>
                    )}
                  </div>
                  <span className="font-accent font-semibold">
                    {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {settings.coupons_enabled && (
          <Card>
            <h3 className="mb-3 font-heading font-bold text-text-dark">Coupon Code</h3>
            {cart.coupon ? (
              <div className="flex items-center justify-between rounded-xl bg-success/5 p-3">
                <div>
                  <span className="font-accent font-semibold text-success">{cart.coupon.code}</span>
                  <span className="ml-2 text-sm text-text-light">
                    {cart.coupon.discount_type === 'percentage' &&
                      `${cart.coupon.discount_value}% off`}
                    {cart.coupon.discount_type === 'fixed_amount' &&
                      `$${cart.coupon.discount_value.toFixed(2)} off`}
                    {cart.coupon.discount_type === 'free_item' && 'Free order'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => cartStore.removeCoupon()}
                  className="cursor-pointer text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  error={couponError}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={applyCoupon}
                  disabled={couponLoading}
                  className="shrink-0 border border-gray-200"
                >
                  Apply
                </Button>
              </div>
            )}
          </Card>
          )}

          {/* Donation — hidden entirely when the admin turns donations off */}
          {settings.donations_enabled && (
            <Card>
              <h3 className="font-heading font-bold text-text-dark">
                Add a {settings.donation_label}
              </h3>
              <p className="mb-3 mt-0.5 font-body text-xs text-text-light">
                Optional — supports the coffee ministry.
              </p>

              {donationPresets.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {donationPresets.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() =>
                        cartStore.setDonation(cart.donation_amount === amount ? 0 : amount)
                      }
                      className={cn(
                        'cursor-pointer rounded-xl border-2 px-4 py-2 font-accent text-sm font-semibold transition-all',
                        cart.donation_amount === amount
                          ? 'border-success bg-success text-white'
                          : 'border-gray-200 bg-surface text-text hover:border-success/40',
                      )}
                    >
                      ${amount.toFixed(2)}
                    </button>
                  ))}
                  {cart.donation_amount > 0 && (
                    <button
                      type="button"
                      onClick={() => cartStore.setDonation(0)}
                      className="cursor-pointer px-3 py-2 font-accent text-sm text-text-light hover:text-danger"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              <Input
                type="number"
                placeholder="Or enter another amount"
                min="0"
                step="0.01"
                value={cart.donation_amount || ''}
                onChange={(e) => cartStore.setDonation(parseFloat(e.target.value) || 0)}
              />
            </Card>
          )}

          {!isFreeOrder && (
            <Card>
              <h3 className="mb-3 font-heading font-bold text-text-dark">Payment</h3>
              <div className="rounded-xl border border-gray-200 p-3">
                <CardElement
                  options={{
                    style: {
                      base: {
                        fontSize: '16px',
                        fontFamily: 'Nunito, sans-serif',
                        color: '#54595F',
                        '::placeholder': { color: '#7A7A7A' },
                      },
                    },
                  }}
                />
              </div>
            </Card>
          )}

          <Card>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-light">Subtotal</span>
                <span className="font-accent">${cart.subtotal.toFixed(2)}</span>
              </div>
              {cart.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-success">
                  <span>Discount</span>
                  <span className="font-accent">-${cart.discount_amount.toFixed(2)}</span>
                </div>
              )}
              {cart.donation_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-light">{settings.donation_label}</span>
                  <span className="font-accent">${cart.donation_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-100 pt-2 font-heading text-lg font-bold">
                <span>Total</span>
                <span>{isFreeOrder ? 'Free' : `$${cart.total.toFixed(2)}`}</span>
              </div>
            </div>
          </Card>

          {queueWait !== null && !orderingClosed && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3">
              <span className="text-xl">&#8987;</span>
              <div>
                <p className="font-body text-sm text-text">
                  Estimated wait:{' '}
                  <strong className="font-accent text-primary">
                    ~{queueWait + cartItemCount} min
                  </strong>
                </p>
                <p className="text-xs text-text-light">Based on current queue + your order</p>
              </div>
            </div>
          )}

          {error && <p className="text-center text-sm text-danger">{error}</p>}

          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={processing || cart.items.length === 0 || orderingClosed}
          >
            {orderingClosed
              ? 'Ordering Is Closed'
              : processing
                ? 'Placing your order...'
                : isFreeOrder
                  ? 'Place Order'
                  : `Place Order · $${cart.total.toFixed(2)}`}
          </Button>

          {!orderingClosed && !processing && cart.items.length > 0 && (
            <p className="text-center font-body text-xs text-text-light">
              Your order is sent to the baristas once you tap the button above.
            </p>
          )}
        </form>
      </main>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  );
}
