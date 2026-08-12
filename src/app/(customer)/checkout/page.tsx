'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { cartStore } from '@/lib/cart-store';
import { useCart } from '@/lib/hooks';
import {
  fetchShopConfig,
  getShopStatus,
  canOrderNow,
  parseDonationPresets,
  DEFAULT_SETTINGS,
} from '@/lib/shop';
import {
  getActiveUnlock,
  setActiveUnlock,
  verifyAccessCode,
  clearActiveUnlock,
  unlockAllowsCategory,
  type AccessUnlock,
} from '@/lib/access-code';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ListGroup, ListRow } from '@/components/ui/List';
import { ClosedNotice } from '@/components/ShopBanner';
import { validateFullName, MAX_NAME_LENGTH } from '@/lib/profanity';
import IOSSpinner from '@/components/ui/Spinner';
import { fadeUp, springPop, springSnappy, staggerParent } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { Coupon, ShopSettings, OrderingHours } from '@/types';

/**
 * Stripe renders the card field in its own iframe, so it can't inherit any of
 * our CSS — its colors have to be handed over as literal values. Those values
 * are read back off the live document rather than hardcoded, because a
 * hardcoded light-mode grey turns the card number invisible on a black page.
 *
 * Re-read whenever the appearance changes, since the iframe won't repaint on
 * its own.
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
        fontSize: '17px',
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

function CheckoutForm() {
  const router = useRouter();
  const cart = useCart();
  const stripe = useStripe();
  const elements = useElements();
  const stripeAppearance = useStripeAppearance();
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
  // Carried over from the menu page in memory — survives the menu → checkout hop, but a
  // page restart wipes it (see access-code.ts), which is what re-asks for the code.
  const [unlock, setUnlock] = useState<AccessUnlock | null>(() => getActiveUnlock());
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
    // If closed, an access code can still let this order through, but only after we
    // re-verify it against the DB so a code disabled mid-service can't slip past.
    const freshConfig = await fetchShopConfig();
    const freshStatus = getShopStatus(freshConfig.settings, freshConfig.hours);

    // A lock beats everything, including a code entered before the lock went on. This is
    // the last gate before money moves, so it's checked here as well as on the page.
    if (freshStatus.isLocked) {
      clearActiveUnlock();
      setUnlock(null);
      setSettings(freshConfig.settings);
      setHours(freshConfig.hours);
      setError('Ordering has been closed — your order was not placed.');
      return;
    }

    if (!freshStatus.isOpen) {
      const active = getActiveUnlock();
      const stillValid = active ? await verifyAccessCode(active.code) : null;
      if (!stillValid) {
        clearActiveUnlock();
        setUnlock(null);
        setSettings(freshConfig.settings);
        setHours(freshConfig.hours);
        setError('Ordering just closed — your order was not placed.');
        return;
      }
      // Keep the latest details (the code's category may have changed).
      setActiveUnlock(stillValid);
      setUnlock(stillValid);
      // A category-limited code (e.g. teas only) can't push anything else through.
      const blocked = cart.items.find(
        (item) => !unlockAllowsCategory(stillValid, item.menu_item.category_id),
      );
      if (blocked) {
        setError(
          stillValid.allowedCategoryName
            ? `Only ${stillValid.allowedCategoryName} can be ordered right now — remove "${blocked.menu_item.name}" to continue.`
            : 'One of your items can’t be ordered right now.',
        );
        return;
      }
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

  const orderingClosed = configLoaded && !canOrderNow(status, !!unlock);

  return (
    <div className="min-h-screen-safe bg-bg">
      {/* iOS navigation bar: a centered title with the back affordance on the
          leading edge, frosted so the form scrolls under it. */}
      <header className="material-bar hairline-b sticky top-0 z-30 pt-safe">
        <div className="mx-auto flex max-w-xl items-center gap-1 px-2 py-2.5">
          <motion.button
            whileTap={{ scale: 0.92 }}
            transition={springSnappy}
            onClick={() => router.push('/')}
            className="flex cursor-pointer items-center gap-0.5 rounded-full px-2 py-1 text-[17px] text-primary"
          >
            {/* SF Symbols chevron.backward */}
            <svg viewBox="0 0 12 20" className="h-[19px] w-[11px]" fill="none">
              <path
                d="M10 2L2 10l8 8"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Menu
          </motion.button>
          <h1 className="text-ios-headline flex-1 pr-16 text-center text-label">Your Order</h1>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-5 pb-safe-4">
        {orderingClosed && (
          <div className="mb-5">
            <ClosedNotice settings={settings} status={status} onUnlock={setUnlock} />
          </div>
        )}

        {configLoaded && !status.isOpen && !status.isLocked && unlock && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mb-5 rounded-[var(--r-lg)] bg-success/12 px-5 py-4 ring-1 ring-success/30"
          >
            <p className="text-ios-headline text-success">
              Ordering unlocked{unlock.label ? ` for ${unlock.label}` : ''} 🔓
            </p>
            {unlock.allowedCategoryName && (
              <p className="text-ios-subhead mt-1 text-label-secondary">
                {unlock.allowedCategoryName} only.
              </p>
            )}
          </motion.div>
        )}

        <motion.form
          variants={staggerParent}
          initial="hidden"
          animate="show"
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          <motion.div variants={fadeUp}>
            <ListGroup
              header="Your name"
              footer="A last initial is enough — it's how we tell two Sarahs apart when we call your order."
            >
              <div className="p-4">
                <Input
                  placeholder="e.g. Sarah K"
                  value={cart.customer_name}
                  maxLength={MAX_NAME_LENGTH}
                  error={nameError}
                  autoComplete="name"
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
              </div>
            </ListGroup>
          </motion.div>

          <motion.div variants={fadeUp}>
            <ListGroup header="Your drinks">
              {cart.items.map((item) => (
                <ListRow
                  key={item.id}
                  label={`${item.quantity} × ${item.menu_item.name}`}
                  detail={
                    item.selected_modifiers.length > 0
                      ? item.selected_modifiers.map((m) => m.name).join(' · ')
                      : undefined
                  }
                  accessory={
                    <span className="tnum text-ios-body text-label">
                      {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                    </span>
                  }
                />
              ))}
            </ListGroup>
          </motion.div>

          {settings.coupons_enabled && (
            <motion.div variants={fadeUp}>
              <ListGroup header="Coupon">
                <div className="p-4">
                  <AnimatePresence mode="wait" initial={false}>
                    {cart.coupon ? (
                      <motion.div
                        key="applied"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={springPop}
                        className="flex items-center justify-between gap-3 rounded-[var(--r-md)] bg-success/12 px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <span className="text-ios-callout font-semibold text-success">
                            {cart.coupon.code}
                          </span>
                          <span className="text-ios-subhead ml-2 text-label-secondary">
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
                          className="press shrink-0 cursor-pointer text-[15px] text-danger"
                        >
                          Remove
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="entry"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex gap-2"
                      >
                        <Input
                          placeholder="Enter code"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          error={couponError}
                        />
                        <Button
                          type="button"
                          variant="tinted"
                          onClick={applyCoupon}
                          disabled={couponLoading || !couponCode.trim()}
                          className="shrink-0 self-start"
                        >
                          {couponLoading ? <IOSSpinner size={16} /> : 'Apply'}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </ListGroup>
            </motion.div>
          )}

          {/* Donation — hidden entirely when the admin turns donations off */}
          {settings.donations_enabled && (
            <motion.div variants={fadeUp}>
              <ListGroup
                header={`Add a ${settings.donation_label}`}
                footer="Optional — supports the coffee ministry."
              >
                <div className="space-y-3 p-4">
                  {donationPresets.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {donationPresets.map((amount) => {
                        const active = cart.donation_amount === amount;
                        return (
                          <motion.button
                            key={amount}
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            transition={springSnappy}
                            onClick={() => cartStore.setDonation(active ? 0 : amount)}
                            className={cn(
                              'tnum cursor-pointer rounded-full px-5 py-2.5 text-[15px] font-semibold',
                              'transition-colors duration-200 ease-[var(--ease-out-ios)]',
                              active
                                ? 'bg-success text-white shadow-sm'
                                : 'bg-fill-tertiary text-label',
                            )}
                          >
                            ${amount.toFixed(2)}
                          </motion.button>
                        );
                      })}
                      <AnimatePresence>
                        {cart.donation_amount > 0 && (
                          <motion.button
                            type="button"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={springPop}
                            onClick={() => cartStore.setDonation(0)}
                            className="cursor-pointer px-3 py-2.5 text-[15px] text-label-secondary"
                          >
                            Clear
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Or enter another amount"
                    min="0"
                    step="0.01"
                    value={cart.donation_amount || ''}
                    onChange={(e) => cartStore.setDonation(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </ListGroup>
            </motion.div>
          )}

          {!isFreeOrder && (
            <motion.div variants={fadeUp}>
              <ListGroup header="Payment">
                <div className="p-4">
                  <div className="rounded-[var(--r-md)] bg-fill-tertiary px-4 py-3.5">
                    <CardElement options={stripeAppearance} />
                  </div>
                </div>
              </ListGroup>
            </motion.div>
          )}

          <motion.div variants={fadeUp}>
            <ListGroup>
              <div className="space-y-2.5 p-4">
                <div className="text-ios-subhead flex justify-between text-label-secondary">
                  <span>Subtotal</span>
                  <span className="tnum">${cart.subtotal.toFixed(2)}</span>
                </div>
                {cart.discount_amount > 0 && (
                  <div className="text-ios-subhead flex justify-between text-success">
                    <span>Discount</span>
                    <span className="tnum">-${cart.discount_amount.toFixed(2)}</span>
                  </div>
                )}
                {cart.donation_amount > 0 && (
                  <div className="text-ios-subhead flex justify-between text-label-secondary">
                    <span>{settings.donation_label}</span>
                    <span className="tnum">${cart.donation_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="hairline-t text-ios-title3 flex justify-between pt-2.5 text-label">
                  <span>Total</span>
                  <span className="tnum">
                    {isFreeOrder ? 'Free' : `$${cart.total.toFixed(2)}`}
                  </span>
                </div>
              </div>
            </ListGroup>
          </motion.div>

          {queueWait !== null && !orderingClosed && (
            <motion.div
              variants={fadeUp}
              className="flex items-center gap-3 rounded-[var(--r-lg)] bg-primary/10 px-4 py-3.5"
            >
              <span className="text-xl">&#8987;</span>
              <div>
                <p className="text-ios-subhead text-label">
                  Estimated wait:{' '}
                  <strong className="tnum font-semibold text-primary">
                    ~{queueWait + cartItemCount} min
                  </strong>
                </p>
                <p className="text-ios-footnote text-label-tertiary">
                  Based on current queue + your order
                </p>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSnappy}
                className="overflow-hidden"
              >
                <p className="text-ios-subhead rounded-[var(--r-md)] bg-danger/12 px-4 py-3 text-center text-danger">
                  {error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div variants={fadeUp} className="space-y-2">
            <Button
              type="submit"
              fullWidth
              size="lg"
              disabled={processing || cart.items.length === 0 || orderingClosed}
            >
              {processing && <IOSSpinner size={18} className="text-white" />}
              {orderingClosed
                ? 'Ordering Is Closed'
                : processing
                  ? 'Placing your order…'
                  : isFreeOrder
                    ? 'Place Order'
                    : `Place Order · $${cart.total.toFixed(2)}`}
            </Button>

            {!orderingClosed && !processing && cart.items.length > 0 && (
              <p className="text-ios-footnote text-center text-label-tertiary">
                Your order is sent to the baristas once you tap the button above.
              </p>
            )}
          </motion.div>
        </motion.form>
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
