'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { cartStore } from '@/lib/cart-store';
import { useCart } from '@/lib/hooks';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import AccessCountdown from '@/components/AccessCountdown';

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cart.customer_name.trim()) {
      setError('Please enter your name');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const orderItems = cart.items.map((item) => ({
        menu_item_id: item.menu_item.id,
        quantity: item.quantity,
        item_price: 0,
        special_instructions: item.special_instructions || null,
        modifiers: item.selected_modifiers.map((m) => ({
          modifier_id: m.id,
          price_adjustment: 0,
        })),
      }));

      // Create order — always free (paid via PushPay)
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: cart.customer_name.trim(),
          status: 'pending',
          subtotal: 0,
          discount_amount: 0,
          tip_amount: 0,
          total: 0,
          payment_status: 'free',
          stripe_payment_id: null,
          coupon_id: null,
          order_source: 'counter',
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
            item_price: 0,
            special_instructions: item.special_instructions,
          })
          .select()
          .single();

        if (orderItem && item.modifiers.length > 0) {
          await supabase.from('order_item_modifiers').insert(
            item.modifiers.map((m) => ({
              order_item_id: orderItem.id,
              modifier_id: m.modifier_id,
              price_adjustment: 0,
            }))
          );
        }
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

      // Consume the session so the grant link can't be reused until the next PushPay payment
      await fetch('/api/access/consume', { method: 'POST' }).catch(() => {});

      cartStore.clear();
      router.push(`/checkout/confirmation?name=${encodeURIComponent(cart.customer_name.trim())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <AccessCountdown />
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
                </div>
              ))}
            </div>
          </Card>

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={processing || cart.items.length === 0}
          >
            {processing ? 'Placing Order...' : 'Place Order'}
          </Button>
        </form>
      </main>
    </div>
  );
}
