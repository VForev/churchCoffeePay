import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/access';
import { readyMessage } from '@/lib/sms';
import { sendTelnyxSms, telnyxConfigured } from '@/lib/telnyx';

export const runtime = 'nodejs';

/**
 * Send the "your order is ready" text for one order. Called by /barista on Making → Ready.
 *
 * Safe to call any number of times, from any number of screens:
 *   - it does nothing unless the order really is Ready in the database;
 *   - the row is CLAIMED with a conditional update (waiting/failed → sending) before
 *     anything is sent, so two barista screens tapping at once send one text, not two;
 *   - once sent, the row is 'sent' and the number is wiped, so a card sent back to
 *     Making and marked Ready again doesn't text a second time.
 *
 * A failed send is left as 'failed' with the reason, and is retried the next time the
 * order is marked Ready.
 */
export async function POST(req: NextRequest) {
  if (!telnyxConfigured()) return NextResponse.json({ sent: false });

  const body = await req.json().catch(() => null);
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ sent: false, error: 'Invalid order' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, customer_name')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || order.status !== 'ready') return NextResponse.json({ sent: false });

  // Claim it. Only one caller can move a row out of waiting/failed.
  const { data: claimed, error: claimError } = await supabase
    .from('order_sms')
    .update({ status: 'sending', last_error: null })
    .eq('order_id', orderId)
    .in('status', ['waiting', 'failed'])
    .not('phone', 'is', null)
    .select('phone');

  if (claimError) {
    // Most often the migration hasn't run — which just means nobody can have asked for a text.
    return NextResponse.json({ sent: false });
  }
  const phone = claimed?.[0]?.phone as string | undefined;
  if (!phone) return NextResponse.json({ sent: false }); // didn't ask, or already handled

  const result = await sendTelnyxSms(phone, readyMessage(order.customer_name ?? ''));

  if (result.ok) {
    await supabase
      .from('order_sms')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        telnyx_message_id: result.id,
        phone: null, // done with it — don't keep numbers we no longer need
      })
      .eq('order_id', orderId);
    return NextResponse.json({ sent: true });
  }

  await supabase
    .from('order_sms')
    .update({ status: 'failed', last_error: result.error.slice(0, 500) })
    .eq('order_id', orderId);
  console.error(`[sms] order ${orderId}: ${result.error}`);
  return NextResponse.json({ sent: false, error: result.error });
}
