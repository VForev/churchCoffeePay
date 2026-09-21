'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { markOrderItemsComplete } from '@/lib/label-print';
import { insertOrderRow } from '@/lib/order-insert';
import { useSubmitLock, type SubmitOutcome } from '@/lib/submit-lock';
import { getDeviceId } from '@/lib/device';
import { rememberMyOrder } from '@/lib/my-order';
import { fetchSpamSettings, isSpamLimitError, orderInsertError } from '@/lib/rate-limit';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { TextArea } from '@/components/ui/Input';
import { validateFullName, MAX_NAME_LENGTH } from '@/lib/profanity';
import {
  verifyAccessCode,
  clearActiveUnlock,
  CUSTOM_ORDER_ITEM_ID,
  type AccessUnlock,
} from '@/lib/access-code';
import { fetchShopConfig, getShopStatus } from '@/lib/shop';

/**
 * Free-text "write your own order" box, shown only when an access code allows it
 * (e.g. a brothers' meeting). The typed request rides along as the hidden Custom Order
 * item's special instructions, so it lands on the barista board and printed label like
 * any other order. It's a free order — no payment, no cart.
 */
export default function CustomOrderBox({
  unlock,
  queueWait,
}: {
  unlock: AccessUnlock;
  queueWait: number | null;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /**
   * Same guard as /checkout, for the same reason: `submitting` is state and only greys
   * the button on the next render, while submit() awaits the shop config and the access
   * code first. Write-ins take no card, which makes them the easiest thing on the site
   * to send twice by tapping twice.
   */
  const sendLock = useSubmitLock();

  const note = unlock.customOrderNote?.trim() || "We'll do our best — if we can't make it, we won't. Sorry!";

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const nameCheck = validateFullName(name);
    if (!nameCheck.ok) {
      setNameError(nameCheck.error ?? 'Please enter a valid name');
      return;
    }
    setNameError('');

    if (!request.trim()) {
      setError('Write what you’d like first.');
      return;
    }

    await sendLock.run(sendOrder);
  }

  /**
   * Everything past the first await. It is a separate function so the lock wraps it
   * whole — this used to be four hand-written `sending.current = false` lines, one per
   * bail-out, and the fifth bail-out somebody adds later is a button that never comes
   * back. Returning 'try-again' is now the only way out that re-arms it.
   */
  async function sendOrder(): Promise<SubmitOutcome> {
    setSubmitting(true);
    setError('');

    // A lock stops write-ins too, and this page may have been sitting open since before
    // it went on — so ask the database, not the state we loaded with.
    const config = await fetchShopConfig();
    if (getShopStatus(config.settings, config.hours).isLocked) {
      clearActiveUnlock();
      setSubmitting(false);
      setError('Ordering has been closed — your order was not sent.');
      return 'try-again';
    }

    // Re-verify the code is still active and still allows write-ins before we place it.
    const fresh = await verifyAccessCode(unlock.code);
    if (!fresh || !fresh.allowCustomOrder) {
      clearActiveUnlock();
      setSubmitting(false);
      setError('This code can no longer place write-in orders — check with the team.');
      return 'try-again';
    }

    // `device_id` comes from supabase-order-rate-limit.sql; a shop that hasn't run it
    // has no spam limit, which is the documented behaviour — it must not also mean every
    // write-in order fails. insertOrderRow drops the column and places the order.
    const { data: order, error: orderError } = await insertOrderRow<{ id: string }>({
      customer_name: name.trim(),
      status: 'pending',
      subtotal: 0,
      discount_amount: 0,
      tip_amount: 0,
      total: 0,
      payment_status: 'free',
      order_source: 'mobile',
      device_id: getDeviceId(),
    });

    if (orderError || !order) {
      setSubmitting(false);
      // Write-ins are free and take no card, which makes them the easiest thing on the
      // site to hammer — so the spam limit's own words go straight to the customer here
      // rather than a generic "something went wrong" they'd just retry through.
      setError(
        isSpamLimitError(orderError)
          ? orderInsertError(orderError, await fetchSpamSettings())
          : 'Something went wrong sending your order. Please try again.',
      );
      return 'try-again';
    }

    const { error: itemError } = await supabase.from('order_items').insert({
      order_id: order.id,
      menu_item_id: CUSTOM_ORDER_ITEM_ID,
      quantity: 1,
      item_price: 0,
      special_instructions: request.trim(),
    });

    if (itemError) {
      // Don't leave a blank order sitting on the board if the item failed to attach.
      await supabase.from('orders').delete().eq('id', order.id);
      setSubmitting(false);
      setError('Something went wrong sending your order. Please try again.');
      return 'try-again';
    }

    // One drink, and it's now safely in — lets the printer print immediately
    // instead of waiting to see whether more drinks are still arriving.
    await markOrderItemsComplete(order.id, 1);

    // Same as a paid order: the live board pins this to the top of their own screen.
    rememberMyOrder(order.id);

    const waitParam = queueWait !== null ? `&wait=${queueWait + 1}` : '';
    router.push(`/checkout/confirmation?name=${encodeURIComponent(name.trim())}${waitParam}`);
    // Held: the order is sent and the browser is navigating. The button must not come
    // back underneath a route transition.
    return 'finished';
  }

  return (
    <Card className="border-2 border-warm/30 bg-warm/5">
      <h3 className="font-heading text-lg font-bold text-text-dark">Write your own order</h3>
      <p className="mt-1 font-body text-sm text-warm">{note}</p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <Input
          label="First & Last Name"
          placeholder="e.g. Sarah K"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          error={nameError}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError('');
          }}
          required
        />
        <TextArea
          label="What would you like?"
          rows={3}
          placeholder="e.g. A decaf oat milk latte, extra hot"
          value={request}
          onChange={(e) => {
            setRequest(e.target.value);
            if (error) setError('');
          }}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" fullWidth size="lg" disabled={submitting || !request.trim()}>
          {submitting ? 'Sending…' : 'Send my order'}
        </Button>
      </form>
    </Card>
  );
}
