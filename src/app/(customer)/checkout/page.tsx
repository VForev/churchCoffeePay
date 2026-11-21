'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { markOrderItemsComplete } from '@/lib/label-print';
import { insertOrderRow } from '@/lib/order-insert';
import { describeCode, isUnlockOnly, lookupCode, recordCodeUses } from '@/lib/codes';
import { useSubmitLock, type SubmitOutcome } from '@/lib/submit-lock';
import { flagOrderIssue } from '@/lib/order-issues';
import { getDeviceId } from '@/lib/device';
import { rememberMyOrder } from '@/lib/my-order';
import { fetchQueueDrinkCount } from '@/lib/queue';
import { deductInventory } from '@/lib/inventory';
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
import { ClosedNotice, ORDER_CODE_BOX_ID } from '@/components/ShopBanner';
import { COFFEE_GIFT_AMOUNT } from '@/lib/giving';
import { validateFullName, MAX_NAME_LENGTH } from '@/lib/profanity';
import type { ShopSettings, OrderingHours } from '@/types';

/** Stable handle for the name box, so a validation failure can scroll it back into view. */
const NAME_INPUT_ID = 'customer-name';

/**
 * "Place Your Coffee Order" — the phone's one review screen, and where the order goes in.
 *
 * **Phone orders are free.** There is no card box on this page and nothing here talks to
 * Stripe: drinks are free at this coffee bar (an "Everything Free" event, a free menu, or
 * a code that takes the whole order off). Should a cart ever arrive here with a price on
 * it — the free event was switched off, say — the page says so and sends them to the
 * counter, where /tablet still takes cards. It never places an unpaid order for a drink
 * that has a price.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponNote, setCouponNote] = useState('');
  const [processing, setProcessing] = useState(false);
  /** Which of the two buttons is in flight, so only that one shows the spinner. */
  const [processingGive, setProcessingGive] = useState<boolean | null>(null);
  /**
   * One tap, one order. `processing` only changes what the button says; this is what
   * makes a second tap a no-op, because it is set synchronously inside the tap rather
   * than a render later. See src/lib/submit-lock.ts for the incident behind it.
   */
  const submitLock = useSubmitLock();
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
  const cartItemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  /** Something in the cart has a price, and this page doesn't take cards. */
  const needsPayment = cart.items.length > 0 && cart.total > 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [config, queue, { data: activeEvent }] = await Promise.all([
        fetchShopConfig(),
        fetchQueueDrinkCount(),
        supabase.from('events').select('id').eq('is_active', true).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setSettings(config.settings);
      setHours(config.hours);
      setActiveEventId(activeEvent?.id ?? null);
      setQueueWait(queue);
      setConfigLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Turning coupons off at /admin/settings only hides the empty code box. A code that's
  // already been typed in stays — it may be the same code that opened the shop and made
  // the order priority, and quietly stripping that is worse than one leftover discount.
  // To stop a code working, switch the code itself off at /admin/coupons.

  /**
   * The code box on the page. One typed code does every job it has: its discount and
   * priority go in the cart, and if it opens ordering that's remembered too, so it still
   * counts if the shop closes before they tap Place Order.
   */
  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    setCouponNote('');

    const result = await lookupCode(couponCode);
    setCouponLoading(false);

    if (!result.ok) {
      setCouponError(result.error);
      return;
    }
    if (result.unlock) {
      setActiveUnlock(result.unlock);
      setUnlock(result.unlock);
    }
    if (result.coupon && !isUnlockOnly(result.coupon)) {
      cartStore.applyCoupon(result.coupon);
      setCouponCode('');
    } else {
      // Valid, but there's nothing for it to do while the shop is open.
      setCouponNote('Code accepted — there’s nothing to take off this order.');
    }
  }

  /**
   * One tap, one order. This is the guard; placeOrder() below is the work.
   *
   * `processing` alone was never enough. It is React state, so it disables the buttons a
   * render later — and placeOrder awaits the shop config, the access code and the spam
   * count before it ever reaches that point. On church wifi that is a second or more in
   * which both buttons are still live, so a customer who tapped three times because
   * nothing appeared to happen placed three separate orders, each a real card on the
   * barista board. The ref is written inside the same tap, and is what actually makes
   * the second tap a no-op.
   *
   * On the success path the lock is deliberately NOT released: placeOrder has already
   * called router.push(), and re-enabling a live "Place Order" button behind a route
   * transition is the same hazard wearing a different hat.
   */
  async function handleSubmit(give: boolean) {
    await submitLock.run(async (): Promise<SubmitOutcome> => {
      setProcessing(true);
      setProcessingGive(give);
      try {
        // True once the order is in the database and the browser is navigating away.
        if (await placeOrder(give)) return 'finished';
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
      // A correctable stop — a name needing a last initial, the shop having closed, an
      // insert that was refused. Nothing was placed, so the buttons come back.
      setProcessing(false);
      setProcessingGive(null);
      return 'try-again';
    });
  }

  /**
   * Places the order. Returns true once it is in the database and the browser is
   * navigating away — handleSubmit above reads that to decide whether the buttons come
   * back. Never call this directly: the guard is what keeps one tap to one order.
   *
   * `give` is which of the two Place Order buttons was tapped. The $3 goes to Pushpay on
   * the next screen, never through this page, so `tip_amount` is always 0.
   *
   * The order is placed FIRST and the Pushpay handoff happens after, on the confirmation
   * screen. That ordering is the whole design: Pushpay can only take money on its own
   * site, it refuses to be framed, and `rbu` (its return button) is off on this merchant,
   * so anyone sent there is gone. Once the order is in the database that costs nothing —
   * sending them there *before* placing it is what used to lose the coffee order.
   */
  async function placeOrder(give: boolean): Promise<boolean> {
    // Nothing is ever added to the order here; see above.
    cartStore.setDonation(0);
    // A copy, not the store's own object: `getState()` returns the live mutable state, and
    // this function is long — it awaits several queries and inserts. Anything that touched
    // the cart meanwhile would otherwise change what's being placed underneath it.
    const cart = { ...cartStore.getState() };

    if (cart.items.length === 0) return false;

    // This name goes up on the lobby TV, so it has to pass before anything is placed.
    const nameCheck = validateFullName(cart.customer_name);
    if (!nameCheck.ok) {
      const message = nameCheck.error ?? 'Please enter a valid name';
      setNameError(message);
      // Shown at the button as well as at the field, and the field is scrolled back into
      // view. The name box is at the top of a long phone page and the buttons are at the
      // bottom: an error that only appears up there reads as "the button did nothing",
      // which is exactly how someone ends up tapping Place Order over and over.
      setError(message);
      document.getElementById(NAME_INPUT_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    setNameError('');

    // No card box on this page — see the comment on CheckoutPage.
    if (cart.total > 0) {
      setError('Phone orders are free-only right now. Please order at the counter.');
      return false;
    }

    // Re-check against the live schedule — the shop may have closed while this page sat open.
    // If closed, an access code can still let this order through, but only after we
    // re-verify it against the DB so a code disabled mid-service can't slip past.
    const freshConfig = await fetchShopConfig();
    const freshStatus = getShopStatus(freshConfig.settings, freshConfig.hours);

    // A lock beats everything, including a code entered before the lock went on. This is
    // the last gate before the order goes in, so it's checked here as well as on the page.
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

    // Spam limit, read up front so the customer gets the friendly message. The database
    // trigger is what actually enforces it (see src/lib/rate-limit.ts).
    const spamBlock = await checkSpamLimit(cart.customer_name);
    if (spamBlock) {
      setError(spamBlock);
      return false;
    }

    setError('');

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

    const orderRow = {
      customer_name: cart.customer_name.trim(),
      status: 'pending',
      subtotal: cart.subtotal,
      discount_amount: cart.discount_amount,
      tip_amount: 0,
      total: 0,
      payment_status: 'free',
      stripe_payment_id: null,
      coupon_id: cart.coupon?.id || null,
      order_source: 'mobile',
      event_id: activeEventId,
      device_id: getDeviceId(),
      // Priority comes from either code: the one in the code box, or the one that
      // opened the shop. Only sent when true, so a shop without supabase-codes.sql
      // never pays a retry for it.
      ...((cart.coupon?.is_priority || getActiveUnlock()?.isPriority) && { is_priority: true }),
    };

    // `giving_intent` is which button they tapped, and it is the *choice*, not the
    // money — Pushpay never tells us whether the $3 arrived (see src/lib/giving.ts).
    //
    // It, `device_id` and `event_id` all come from migrations a shop may not have run.
    // insertOrderRow() drops whichever of the three this database turns out not to have
    // and inserts the rest — a rejected insert inserts nothing, so the retry can't
    // double-order. A missing metric column must never be what loses somebody their coffee.
    const { data: order, error: orderError } = await insertOrderRow<{ id: string }>({
      ...orderRow,
      giving_intent: give,
    });

    // The trigger can still refuse this if two tabs were submitted together and raced
    // past the pre-check above. Its Postgres error must never reach the screen raw.
    if (orderError || !order) {
      throw new Error(
        isSpamLimitError(orderError)
          ? spamBlockMessage(await fetchSpamSettings())
          : orderInsertError(orderError),
      );
    }

    // Safely in the database — from here the live board can pin it to the top of
    // this phone's screen. Nothing else knows which order is theirs.
    rememberMyOrder(order.id);

    // From here on the order exists. Whatever happens next, this tap ends on the
    // confirmation screen — handing the buttons back now would invite a second order.
    try {
      // Drinks go in one at a time, and a failure here used to be swallowed: the order
      // was on the board, just short a drink, with nothing anywhere saying so. Count what
      // actually landed instead.
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
          .select('id')
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
            })),
          );
          // The drink is on the board but its add-ins aren't — an oat-milk latte that
          // reads as a plain latte. Worth the barista's attention, not a lost order.
          if (modError) missed.push(`${item.name} (add-ins)`);
        }
      }

      // The COUNT THAT LANDED, not the count we meant to insert. The print agent waits
      // for this many drink rows before it prints, so claiming a drink that never
      // arrived leaves the whole order's labels stuck behind a cup that isn't coming.
      // The bookkeeping after it is independent and best-effort, so it runs side by side
      // rather than one round trip after another in front of the confirmation screen.
      // allSettled, never all: the order is already in, and one of these throwing must not
      // hand the buttons back for a second tap that would place it twice.
      await Promise.allSettled([
        markOrderItemsComplete(order.id, orderItems.length - missed.length),
        // Red card on the barista board, with what's missing on it. Best-effort — a shop
        // without the issues migration just doesn't get the red.
        missed.length > 0
          ? flagOrderIssue(
              order.id,
              `Missing item — did not save: ${missed.join(', ')}. Check with the customer.`,
            )
          : null,
        // Who used which code — the record /admin/coupons searches. Also what counts the
        // use toward a code's max uses.
        recordCodeUses({
          orderId: order.id,
          customerName: cart.customer_name,
          source: 'mobile',
          coupon: cart.coupon,
          unlock: getActiveUnlock(),
          shopClosed: !freshStatus.isOpen,
          discountAmount: cart.discount_amount,
        }),
        deductInventory(
          order.id,
          cart.items.map((item) => ({
            menuItemId: item.menu_item.id,
            modifierIds: item.selected_modifiers.map((m) => m.id),
            quantity: item.quantity,
          })),
        ),
      ]);
    } catch {
      // A network drop mid-way. The order row is in and on the board; anything short is
      // the barista's to sort out, not a reason to place it again.
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
  }

  const orderingClosed = configLoaded && !canOrderNow(status, !!unlock);
  const emptyCart = cart.items.length === 0;

  return (
    <div className="min-h-screen bg-bg pb-10">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-3 py-3">
          <button
            onClick={() => router.push('/')}
            aria-label="Back to the menu"
            className="flex h-10 w-10 cursor-pointer touch-manipulation items-center justify-center rounded-full text-text-dark transition-colors hover:bg-gray-100 active:scale-95"
          >
            <svg aria-hidden className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M12.7 4.3a1 1 0 0 1 0 1.4L8.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z" />
            </svg>
          </button>
          <h1 className="font-heading text-xl font-bold">Place Your Coffee Order</h1>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {orderingClosed && (
          <ClosedNotice
            settings={settings}
            status={status}
            onUnlock={setUnlock}
            onCode={cartStore.applyCoupon}
            atCheckout
          />
        )}

        {configLoaded && !status.isOpen && !status.isLocked && unlock && (
          <div className="rounded-2xl border-2 border-success/40 bg-success/10 px-5 py-4">
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

        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <Card className="p-5">
            <StepTitle n={1}>Your name</StepTitle>
            <Input
              id={NAME_INPUT_ID}
              aria-label="First and last name"
              placeholder="First name + last initial, e.g. Sarah K"
              value={cart.customer_name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="done"
              error={nameError}
              onChange={(e) => {
                cartStore.setCustomerName(e.target.value);
                if (nameError) setNameError('');
                if (error && error === nameError) setError('');
              }}
              onBlur={(e) => {
                const check = validateFullName(e.target.value);
                if (e.target.value.trim() && !check.ok) setNameError(check.error ?? '');
              }}
              required
            />
            <p className="mt-2 font-body text-xs text-text-light">
              A last initial is enough — it&apos;s how we tell two Sarahs apart when we call
              your order.
            </p>
          </Card>

          {/* The order is reviewed here and nowhere else. The menu page used to open a
              cart drawer first — a whole screen showing this same list — so this list has
              to be editable, or removing a mis-tapped drink would mean starting over. */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <StepTitle n={2} className="mb-0">
                Your drinks
                {cartItemCount > 0 && (
                  <span className="ml-2 font-accent text-sm font-semibold text-text-light">
                    {cartItemCount}
                  </span>
                )}
              </StepTitle>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="cursor-pointer rounded-full bg-primary/10 px-3 py-1.5 font-accent text-xs font-semibold text-primary transition-colors hover:bg-primary/15 active:scale-95"
              >
                + Add another
              </button>
            </div>

            {emptyCart ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
                <p className="mb-1 text-3xl">☕</p>
                <p className="font-body text-sm text-text-light">
                  Your order is empty — go back to the menu and pick a drink.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {cart.items.map((item) => (
                  <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-heading text-base font-bold text-text-dark">
                          {item.menu_item.name}
                        </p>
                        {item.selected_modifiers.length > 0 && (
                          <p className="mt-0.5 font-body text-sm text-text-light">
                            {item.selected_modifiers.map((m) => m.name).join(' · ')}
                          </p>
                        )}
                        {item.special_instructions && (
                          <p className="mt-1 font-body text-sm italic text-warm">
                            &ldquo;{item.special_instructions}&rdquo;
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-accent text-sm font-semibold text-text-dark">
                        {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex items-center rounded-full bg-gray-100 p-0.5">
                        <QtyButton
                          label={
                            item.quantity === 1
                              ? `Remove ${item.menu_item.name}`
                              : `One fewer ${item.menu_item.name}`
                          }
                          onClick={() => cartStore.updateQuantity(item.id, item.quantity - 1)}
                        >
                          {item.quantity === 1 ? (
                            <svg aria-hidden className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M8 2a1 1 0 0 0-1 1v1H4a1 1 0 0 0 0 2h12a1 1 0 1 0 0-2h-3V3a1 1 0 0 0-1-1H8Zm-3 6 .8 8.1A2 2 0 0 0 7.8 18h4.4a2 2 0 0 0 2-1.9L15 8H5Z" />
                            </svg>
                          ) : (
                            <>&minus;</>
                          )}
                        </QtyButton>
                        <span className="w-8 text-center font-accent text-sm font-bold text-text-dark">
                          {item.quantity}
                        </span>
                        <QtyButton
                          label={`One more ${item.menu_item.name}`}
                          onClick={() => cartStore.updateQuantity(item.id, item.quantity + 1)}
                        >
                          +
                        </QtyButton>
                      </div>
                      {item.quantity > 1 && (
                        <button
                          type="button"
                          onClick={() => cartStore.removeItem(item.id)}
                          className="cursor-pointer font-body text-xs text-danger hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* While closed, the code box lives in the notice at the top — one box, not two. */}
          {!orderingClosed && (settings.coupons_enabled || cart.coupon) && (
            <Card className="p-5">
              <h3 className="mb-3 font-heading text-base font-bold text-text-dark">Have a code?</h3>
              {cart.coupon ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-success/10 p-3">
                  <div className="min-w-0">
                    <span className="font-accent font-semibold text-success">{cart.coupon.code}</span>
                    <span className="ml-2 text-sm text-text-light">
                      {describeCode(cart.coupon, 'customer')}
                    </span>
                    {cart.coupon.is_priority && (
                      <p className="mt-0.5 text-sm font-semibold text-text-dark">
                        ⚡ Your order goes to the front of the line
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => cartStore.removeCoupon()}
                    className="shrink-0 cursor-pointer text-xs text-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <Input
                    aria-label="Code"
                    placeholder="Enter code"
                    value={couponCode}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyCoupon();
                      }
                    }}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponNote('');
                      setCouponError('');
                    }}
                    error={couponError}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={applyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    loading={couponLoading}
                    className="shrink-0 border border-gray-200"
                  >
                    Apply
                  </Button>
                </div>
              )}
              {couponNote && <p className="mt-2 text-sm text-success">{couponNote}</p>}
            </Card>
          )}

          {/* Totals, and the wait, in one place. */}
          {!emptyCart && (
            <Card className="p-5">
              {(cart.discount_amount > 0 || cart.subtotal > 0) && (
                <div className="mb-2 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-light">Subtotal</span>
                    <span className="font-accent">${cart.subtotal.toFixed(2)}</span>
                  </div>
                  {cart.discount_amount > 0 && (
                    <div className="flex justify-between text-sm text-success">
                      <span>Code</span>
                      <span className="font-accent">-${cart.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
              <div
                className={`flex items-baseline justify-between font-heading text-lg font-bold ${
                  cart.discount_amount > 0 || cart.subtotal > 0 ? 'border-t border-gray-100 pt-2' : ''
                }`}
              >
                <span>Total</span>
                <span className={needsPayment ? 'text-text-dark' : 'text-success'}>
                  {needsPayment ? `$${cart.total.toFixed(2)}` : 'Free'}
                </span>
              </div>

              {queueWait !== null && !orderingClosed && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3">
                  <span aria-hidden className="text-xl leading-none">
                    &#8987;
                  </span>
                  <p className="font-body text-sm text-text">
                    Ready in about{' '}
                    <strong className="font-accent text-primary">
                      ~{queueWait + cartItemCount} min
                    </strong>
                    <span className="block text-xs text-text-light">
                      Based on the current line plus your order
                    </span>
                  </p>
                </div>
              )}
            </Card>
          )}

          {needsPayment && (
            <div className="rounded-2xl border-2 border-warning/40 bg-warning/10 px-5 py-4">
              <p className="font-heading font-bold text-text-dark">
                Phone orders are free-only right now
              </p>
              <p className="mt-1 font-body text-sm text-text">
                Something in your order has a price, and we don&apos;t take cards on this
                page. Please order at the counter — the barista can take payment there.
              </p>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-danger/10 px-4 py-3 text-center font-body text-sm font-semibold text-danger"
            >
              {error}
            </p>
          )}

          {/* Two ways out of this page, both of which place the same free order. The only
              difference is where the confirmation screen sends them next — see
              src/lib/giving.ts for why the $3 can't happen on this page. */}
          {orderingClosed && !status.isLocked ? (
            /* Not a dead button: the code box is at the top of a long phone page, and a
               disabled button down here reads as "broken" to someone who has a code. */
            <Button
              type="button"
              fullWidth
              size="lg"
              variant="ghost"
              className="border-2 border-warning/50"
              onClick={() => {
                const box = document.getElementById(ORDER_CODE_BOX_ID);
                box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                box?.querySelector('input')?.focus();
              }}
            >
              Enter Your Code Above to Order
            </Button>
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
                disabled={processing || emptyCart || needsPayment}
                loading={processing && processingGive === true}
                onClick={() => handleSubmit(true)}
              >
                {processing && processingGive === true
                  ? 'Placing your order…'
                  : `☕ Place Order & Give $${COFFEE_GIFT_AMOUNT}`}
              </Button>

              <Button
                type="button"
                fullWidth
                size="lg"
                disabled={processing || emptyCart || needsPayment}
                loading={processing && processingGive === false}
                onClick={() => handleSubmit(false)}
              >
                {processing && processingGive === false
                  ? 'Placing your order…'
                  : 'Place Order — No Donation'}
              </Button>

              <p className="px-2 text-center font-body text-xs leading-relaxed text-text-light">
                {`Your drinks are free either way. The $${COFFEE_GIFT_AMOUNT} goes to the Coffee & Tea Ministry through Pushpay, on the next screen.`}
              </p>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}

function StepTitle({
  n,
  children,
  className = 'mb-3',
}: {
  n: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`flex items-center gap-2.5 font-heading text-base font-bold text-text-dark ${className}`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-accent text-xs font-bold text-white">
        {n}
      </span>
      {children}
    </h2>
  );
}

function QtyButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-surface font-bold text-text-dark shadow-sm transition-transform active:scale-90"
    >
      {children}
    </button>
  );
}
