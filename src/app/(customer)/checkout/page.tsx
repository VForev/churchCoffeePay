'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { markOrderItemsComplete } from '@/lib/label-print';
import { insertOrderRow } from '@/lib/order-insert';
import { useSubmitLock, type SubmitOutcome } from '@/lib/submit-lock';
import { flagOrderIssue } from '@/lib/order-issues';
import { getDeviceId } from '@/lib/device';
import { rememberMyOrder } from '@/lib/my-order';
import {
  checkSpamLimit,
  fetchSpamSettings,
  isSpamLimitError,
  orderInsertError,
  spamBlockMessage,
} from '@/lib/rate-limit';
import { cartStore } from '@/lib/cart-store';
import { useCart } from '@/lib/hooks';
import {
  fetchShopConfig,
  getShopStatus,
  canOrderNow,
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
import Card from '@/components/ui/Card';
import { ClosedNotice } from '@/components/ShopBanner';
import { COFFEE_GIFT_AMOUNT } from '@/lib/giving';
import { validateFullName, MAX_NAME_LENGTH } from '@/lib/profanity';
import type { Coupon, ShopSettings, OrderingHours } from '@/types';

/** Stable handle for the name box, so a validation failure can scroll it back into view. */
const NAME_INPUT_ID = 'customer-name';

/**
 * The card was charged and the order still didn't save.
 *
 * Thrown rather than returned so it can't be mistaken for an ordinary failure: an
 * ordinary failure puts the buttons back, and putting the buttons back here invites
 * someone whose money has already gone to pay a second time for the same coffee. The
 * only fix is a person at the counter, so the buttons stay down and the screen says so.
 */
class ChargedWithoutOrderError extends Error {}

function CheckoutForm() {
  const router = useRouter();
  const cart = useCart();
  const stripe = useStripe();
  const elements = useElements();
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  /**
   * One tap, one order. `processing` only changes what the button says; this is what
   * makes a second tap a no-op, because it is set synchronously inside the tap rather
   * than a render later. See src/lib/submit-lock.ts for the incident behind it.
   */
  const submitLock = useSubmitLock();
  /** Set once and never cleared — see ChargedWithoutOrderError. */
  const [chargedWithoutOrder, setChargedWithoutOrder] = useState(false);
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

  /**
   * One tap, one order. This is the guard; placeOrder() below is the work.
   *
   * `processing` alone was never enough. It is React state, so it disables the buttons a
   * render later — and placeOrder awaits the shop config, the access code and the spam
   * count before it ever reaches that point. On church wifi that is a second or more in
   * which both buttons are still live, so a customer who tapped three times because
   * nothing appeared to happen placed three separate orders, each a real charge and a
   * real card on the barista board. The ref is written inside the same tap, and is what
   * actually makes the second tap a no-op.
   *
   * On the success path the lock is deliberately NOT released: placeOrder has already
   * called router.push(), and re-enabling a live "Place Order" button behind a route
   * transition is the same hazard wearing a different hat.
   */
  async function handleSubmit(e: React.FormEvent | null, give: boolean) {
    e?.preventDefault();

    await submitLock.run(async (): Promise<SubmitOutcome> => {
      setProcessing(true);
      try {
        // True once the order is in the database and the browser is navigating away.
        if (await placeOrder(give)) return 'finished';
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        // Money moved, the order didn't. Handing the buttons back would let them pay
        // twice for one coffee, so they stay down and the notice below takes their place.
        if (err instanceof ChargedWithoutOrderError) {
          setChargedWithoutOrder(true);
          return 'finished';
        }
      }
      // A correctable stop — a name needing a last initial, a declined card, the shop
      // having closed. Nothing irreversible happened, so the buttons come back.
      setProcessing(false);
      return 'try-again';
    });
  }

  /**
   * Places the order. Returns true once it is in the database and the browser is
   * navigating away — handleSubmit above reads that to decide whether the buttons come
   * back. Never call this directly: the guard is what keeps one tap to one order.
   *
   * `give` is which of the two Place Order buttons was tapped — it does NOT change what
   * the card is charged. The $3 goes to Pushpay, not Stripe, so Stripe only ever sees the
   * drinks and `tip_amount` is always 0.
   *
   * The order is placed FIRST and the Pushpay handoff happens after, on the confirmation
   * screen. That ordering is the whole design: Pushpay can only take money on its own
   * site, it refuses to be framed, and `rbu` (its return button) is off on this merchant,
   * so anyone sent there is gone. Once the order is in the database that costs nothing —
   * sending them there *before* placing it is what used to lose the coffee order.
   */
  async function placeOrder(give: boolean): Promise<boolean> {
    // Nothing is ever added to the card payment here; see above.
    cartStore.setDonation(0);
    // A copy, not the store's own object: `getState()` returns the live mutable state, and
    // this function is long — it awaits Stripe and several inserts. Anything that touched
    // the cart meanwhile would otherwise change the totals underneath a charge in flight.
    const cart = { ...cartStore.getState() };
    const isFreeOrder = cart.total === 0;

    // This name goes up on the lobby TV, so it has to pass before we take money.
    const nameCheck = validateFullName(cart.customer_name);
    if (!nameCheck.ok) {
      const message = nameCheck.error ?? 'Please enter a valid name';
      setNameError(message);
      // Shown at the button as well as at the field, and the field is scrolled back into
      // view. The name box is at the top of a long phone page and the buttons are at the
      // bottom: an error that only appears up there reads as "the button did nothing",
      // which is exactly how someone ends up tapping Place Order over and over.
      setError(message);
      document.getElementById(NAME_INPUT_ID)?.scrollIntoView({ block: 'center' });
      return false;
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
      return false;
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
        return false;
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
        return false;
      }
    }

    // Spam limit, checked BEFORE the card is charged. The database trigger is what
    // actually enforces it (see src/lib/rate-limit.ts), but it fires on the insert —
    // which happens after Stripe has taken the money. Being refused at that point would
    // leave a charged customer with no order, so the count is read here first.
    const spamBlock = await checkSpamLimit(cart.customer_name);
    if (spamBlock) {
      setError(spamBlock);
      return false;
    }

    setError('');

    try {
      const orderItems = cart.items.map((item) => ({
        menu_item_id: item.menu_item.id,
        name: item.menu_item.name,
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

      const orderRow = {
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
        device_id: getDeviceId(),
      };

      // `giving_intent` is which button they tapped, and it is the *choice*, not the
      // money — Pushpay never tells us whether the $3 arrived (see src/lib/giving.ts).
      //
      // It, `device_id` and `event_id` all come from migrations a shop may not have run,
      // and by this line the card has already been charged. insertOrderRow() drops
      // whichever of the three this database turns out not to have and inserts the rest
      // — a rejected insert inserts nothing, so the retry can't double-order. A missing
      // metric column must never be what loses somebody their coffee.
      const { data: order, error: orderError } = await insertOrderRow<{ id: string }>({
        ...orderRow,
        giving_intent: give,
      });

      // The trigger can still refuse this if two tabs were submitted together and raced
      // past the pre-check above. Its Postgres error must never reach the screen raw —
      // and if the card was already charged, saying so is the only honest thing to do.
      if (orderError || !order) {
        const reason = isSpamLimitError(orderError)
          ? spamBlockMessage(await fetchSpamSettings())
          : orderInsertError(orderError);

        if (stripePaymentId) {
          throw new ChargedWithoutOrderError(
            `${reason} Your card WAS charged $${cart.total.toFixed(2)} — please show this screen ` +
              'to the barista at the counter. Do not pay again.',
          );
        }
        throw new Error(reason);
      }

      // Safely in the database — from here the live board can pin it to the top of
      // this phone's screen. Nothing else knows which order is theirs.
      rememberMyOrder(order.id);

      // Drinks go in one at a time, and a failure here used to be swallowed: the order
      // was paid for and on the board, just short a drink, with nothing anywhere saying
      // so. Count what actually landed instead.
      const missed: string[] = [];

      for (const item of orderItems) {
        const { data: orderItem, error: itemError } = await supabase
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

        if (itemError || !orderItem) {
          missed.push(item.name);
          continue;
        }

        if (item.modifiers.length > 0) {
          const { error: modError } = await supabase.from('order_item_modifiers').insert(
            item.modifiers.map((m) => ({
              order_item_id: orderItem.id,
              modifier_id: m.modifier_id,
              price_adjustment: m.price_adjustment,
            }))
          );
          // The drink is on the board but its add-ins aren't — an oat-milk latte that
          // reads as a plain latte. Worth the barista's attention, not a lost order.
          if (modError) missed.push(`${item.name} (add-ins)`);
        }
      }

      // The COUNT THAT LANDED, not the count we meant to insert. The print agent waits
      // for this many drink rows before it prints, so claiming a drink that never
      // arrived leaves the whole order's labels stuck behind a cup that isn't coming.
      await markOrderItemsComplete(order.id, orderItems.length - missed.length);

      // Red card on the barista board, with what's missing on it. Best-effort — the
      // order is already paid for, so a shop without the issues migration just doesn't
      // get the red.
      if (missed.length > 0) {
        await flagOrderIssue(
          order.id,
          `Missing item — did not save: ${missed.join(', ')}. Check with the customer.`,
        );
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
      const giveParam = give ? '&give=1' : '';
      router.push(
        `/checkout/confirmation?name=${encodeURIComponent(customerName)}${waitParam}${giveParam}`,
      );
      return true;
    } catch (err) {
      // Re-thrown so handleSubmit — which owns the buttons — is the single place that
      // decides whether this tap is finished with them.
      throw err instanceof Error ? err : new Error('Something went wrong');
    }
  }

  const orderingClosed = configLoaded && !canOrderNow(status, !!unlock);

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
            <ClosedNotice settings={settings} status={status} onUnlock={setUnlock} />
          </div>
        )}

        {configLoaded && !status.isOpen && !status.isLocked && unlock && (
          <div className="mb-6 rounded-2xl border-2 border-success/40 bg-success/10 px-5 py-4">
            <p className="font-heading font-bold text-success">
              Ordering unlocked{unlock.label ? ` for ${unlock.label}` : ''} 🔓
            </p>
            {unlock.allowedCategoryName && (
              <p className="mt-1 font-body text-sm text-text-light">
                {unlock.allowedCategoryName} only.
              </p>
            )}
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <Card>
            <Input
              id={NAME_INPUT_ID}
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

          {/* The order is reviewed here and nowhere else. The menu page used to open a
              cart drawer first — a whole screen showing this same list — so this list has
              to be editable, or removing a mis-tapped drink would mean starting over. */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading font-bold text-text-dark">Your Drinks</h3>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="cursor-pointer font-accent text-xs font-semibold text-primary hover:underline"
              >
                + Add another
              </button>
            </div>

            {cart.items.length === 0 ? (
              <p className="py-4 text-center font-body text-sm text-text-light">
                Your order is empty — go back to the menu and pick a drink.
              </p>
            ) : (
              <div className="space-y-3">
                {cart.items.map((item) => (
                  <div key={item.id} className="rounded-xl bg-bg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-heading text-sm font-bold text-text-dark">
                          {item.menu_item.name}
                        </p>
                        {item.selected_modifiers.length > 0 && (
                          <p className="mt-0.5 font-body text-xs text-text-light">
                            {item.selected_modifiers.map((m) => m.name).join(', ')}
                          </p>
                        )}
                        {item.special_instructions && (
                          <p className="mt-0.5 font-body text-xs italic text-warm">
                            &ldquo;{item.special_instructions}&rdquo;
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-accent text-sm font-semibold">
                        {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`One fewer ${item.menu_item.name}`}
                          onClick={() => cartStore.updateQuantity(item.id, item.quantity - 1)}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-surface font-bold hover:bg-gray-50"
                        >
                          &minus;
                        </button>
                        <span className="w-6 text-center font-accent text-sm font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`One more ${item.menu_item.name}`}
                          onClick={() => cartStore.updateQuantity(item.id, item.quantity + 1)}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-surface font-bold hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => cartStore.removeItem(item.id)}
                        className="cursor-pointer font-body text-xs text-danger hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                  <span className="text-text-light">Coffee &amp; Tea</span>
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

          {/* Two ways out of this page, both of which place the order. Both charge the
              card the same amount — the drinks — because the $3 is a Pushpay gift, not a
              Stripe line. The only difference is where the confirmation screen sends them
              next. See src/lib/giving.ts for why the $3 can't happen on this page. */}
          {chargedWithoutOrder ? (
            /* Deliberately a dead end. Every way forward from here charges them twice. */
            <div className="rounded-2xl border-2 border-danger/40 bg-danger/5 px-5 py-4 text-center">
              <p className="font-heading font-bold text-danger">
                Your payment went through, but the order didn&apos;t save
              </p>
              <p className="mt-2 font-body text-sm text-text">
                Please show this screen to the barista at the counter — they can make your
                drink. Don&apos;t pay again.
              </p>
            </div>
          ) : orderingClosed ? (
            <Button type="button" fullWidth size="lg" disabled>
              Ordering Is Closed
            </Button>
          ) : (
            <div className="space-y-3">
              <Button
                type="button"
                fullWidth
                size="lg"
                variant="success"
                disabled={processing || cart.items.length === 0}
                onClick={() => handleSubmit(null, true)}
              >
                {processing
                  ? 'Placing your order...'
                  : `\u2615 Place Order & Give $${COFFEE_GIFT_AMOUNT}`}
              </Button>

              <Button
                type="button"
                fullWidth
                size="lg"
                disabled={processing || cart.items.length === 0}
                onClick={() => handleSubmit(null, false)}
              >
                {processing ? 'Placing your order...' : 'Place Order \u2014 No Donation'}
              </Button>

              <p className="text-center font-body text-xs text-text-light">
                {isFreeOrder
                  ? `Your drinks are free either way. The $${COFFEE_GIFT_AMOUNT} goes to the Coffee & Tea Ministry through Pushpay, on the next screen.`
                  : `Your card is charged $${cart.total.toFixed(2)} for the drinks either way. The $${COFFEE_GIFT_AMOUNT} goes to the Coffee & Tea Ministry through Pushpay, on the next screen.`}
              </p>
            </div>
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
