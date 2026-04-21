'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { cartStore } from '@/lib/cart-store';
import { useCart } from '@/lib/hooks';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import type { Coupon } from '@/types';

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
  const [queueWait, setQueueWait] = useState<number | null>(null);

  const isFreeOrder = cart.total === 0;
  const cartItemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    async function fetchQueueWait() {
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id')
        .in('status', ['pending', 'in_progress'])
        .is('archived_at', null);

      if (!activeOrders || activeOrders.length === 0) {
        setQueueWait(0);
        return;
      }

      const orderIds = activeOrders.map((o) => o.id);
      const { data: items } = await supabase
        .from('order_items')
        .select('quantity')
        .in('order_id', orderIds);

      setQueueWait(items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0);
    }
    fetchQueueWait();
  }, []);

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
    if (!cart.customer_name.trim()) {
      setError('Please enter your name');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // Build order items for database
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

      // Process payment if not free
      if (!isFreeOrder) {
        // Create payment intent via API
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(cart.total * 100) }),
        });

        if (!res.ok) {
          throw new Error('Failed to create payment');
        }

        const { clientSecret } = await res.json();

        if (!stripe || !elements) {
          throw new Error('Stripe not loaded');
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) throw new Error('Card element not found');

        const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardElement },
        });

        if (stripeError) {
          throw new Error(stripeError.message);
        }

        stripePaymentId = paymentIntent?.id || null;
      }

      // Create order in database
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: cart.customer_name.trim(),
          status: 'pending',
          subtotal: cart.subtotal,
          discount_amount: cart.discount_amount,
          tip_amount: cart.tip_amount,
          total: cart.total,
          payment_status: isFreeOrder ? 'free' : 'paid',
          stripe_payment_id: stripePaymentId,
          coupon_id: cart.coupon?.id || null,
          order_source: 'mobile',
        })
        .select()
        .single();

      if (orderError || !order) throw new Error('Failed to create order');

      // Insert order items
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

      // Increment coupon usage if used
      if (cart.coupon) {
        await supabase
          .from('coupons')
          .update({ times_used: cart.coupon.times_used + 1 })
          .eq('id', cart.coupon.id);
      }

      // Deduct inventory
      for (const item of cart.items) {
        // Deduct for menu item
        const { data: itemIngredients } = await supabase
          .from('item_ingredients')
          .select('*, inventory_item:inventory_items(*)')
          .eq('menu_item_id', item.menu_item.id);

        if (itemIngredients) {
          for (const ingredient of itemIngredients) {
            const amount = ingredient.quantity_used * item.quantity;
            await supabase.from('inventory_items')
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

        // Deduct for modifiers
        for (const mod of item.selected_modifiers) {
          const { data: modIngredients } = await supabase
            .from('item_ingredients')
            .select('*, inventory_item:inventory_items(*)')
            .eq('modifier_id', mod.id);

          if (modIngredients) {
            for (const ingredient of modIngredients) {
              const amount = ingredient.quantity_used * item.quantity;
              await supabase.from('inventory_items')
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

      // Clear cart and redirect to confirmation
      cartStore.clear();
      const estimatedWait = queueWait !== null ? queueWait + cartItemCount : null;
      const waitParam = estimatedWait !== null ? `&wait=${estimatedWait}` : '';
      router.push(`/checkout/confirmation?name=${encodeURIComponent(cart.customer_name.trim())}${waitParam}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-text-light hover:text-text cursor-pointer"
          >
            &larr;
          </button>
          <h1 className="text-xl font-heading font-bold">Checkout</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <Card>
            <Input
              label="Your Name"
              placeholder="Name for your order"
              value={cart.customer_name}
              onChange={(e) => cartStore.setCustomerName(e.target.value)}
              required
            />
          </Card>

          {/* Order Summary */}
          <Card>
            <h3 className="font-heading font-bold text-text-dark mb-3">Order Summary</h3>
            <div className="space-y-2">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div>
                    <span className="font-body">{item.quantity}x {item.menu_item.name}</span>
                    {item.selected_modifiers.length > 0 && (
                      <span className="text-text-light text-xs block">
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

          {/* Coupon */}
          <Card>
            <h3 className="font-heading font-bold text-text-dark mb-3">Coupon Code</h3>
            {cart.coupon ? (
              <div className="flex items-center justify-between bg-success/5 p-3 rounded-xl">
                <div>
                  <span className="font-accent font-semibold text-success">{cart.coupon.code}</span>
                  <span className="text-sm text-text-light ml-2">
                    {cart.coupon.discount_type === 'percentage' && `${cart.coupon.discount_value}% off`}
                    {cart.coupon.discount_type === 'fixed_amount' && `$${cart.coupon.discount_value.toFixed(2)} off`}
                    {cart.coupon.discount_type === 'free_item' && 'Free order'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => cartStore.removeCoupon()}
                  className="text-xs text-danger hover:underline cursor-pointer"
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

          {/* Tip */}
          <Card>
            <h3 className="font-heading font-bold text-text-dark mb-3">Add a Tip</h3>
            <Input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={cart.tip_amount || ''}
              onChange={(e) => cartStore.setTip(parseFloat(e.target.value) || 0)}
            />
          </Card>

          {/* Payment */}
          {!isFreeOrder && (
            <Card>
              <h3 className="font-heading font-bold text-text-dark mb-3">Payment</h3>
              <div className="border border-gray-200 rounded-xl p-3">
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

          {/* Totals */}
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
              {cart.tip_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-light">Tip</span>
                  <span className="font-accent">${cart.tip_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-heading font-bold border-t border-gray-100 pt-2">
                <span>Total</span>
                <span>{isFreeOrder ? 'Free' : `$${cart.total.toFixed(2)}`}</span>
              </div>
            </div>
          </Card>

          {/* Estimated wait */}
          {queueWait !== null && (
            <div className="flex items-center gap-3 bg-primary/5 rounded-xl px-4 py-3 border border-primary/10">
              <span className="text-xl">&#8987;</span>
              <div>
                <p className="text-sm font-body text-text">
                  Estimated wait:{' '}
                  <strong className="font-accent text-primary">
                    ~{queueWait + cartItemCount} min
                  </strong>
                </p>
                <p className="text-xs text-text-light">Based on current queue + your order</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={processing || cart.items.length === 0}
          >
            {processing ? 'Processing...' : isFreeOrder ? 'Place Order' : `Pay $${cart.total.toFixed(2)}`}
          </Button>
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
