import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/access';
import { normalizeUsPhone } from '@/lib/sms';
import { telnyxConfigured } from '@/lib/telnyx';

export const runtime = 'nodejs';

/**
 * Attach a phone number to an order that was just placed.
 *
 * The number goes into `order_sms` with the service role — the anon key can't touch that
 * table, which is the point (see supabase-sms-notifications.sql). To keep this route from
 * being a way to sign strangers up for texts, it only accepts:
 *   - an order placed in the last 15 minutes that is still waiting or being made, and
 *   - the first number for that order (a second call for the same order is ignored).
 * The worst anyone can do with it is one "your order is ready" text per real order.
 */
const MAX_ORDER_AGE_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!telnyxConfigured()) {
    return NextResponse.json({ error: 'Texting is not set up' }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  const phone = normalizeUsPhone(typeof body?.phone === 'string' ? body.phone : '');
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !phone) {
    return NextResponse.json({ error: 'Invalid order or phone number' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, created_at')
    .eq('id', orderId)
    .maybeSingle();

  if (
    !order ||
    !['pending', 'in_progress'].includes(order.status) ||
    Date.now() - new Date(order.created_at).getTime() > MAX_ORDER_AGE_MS
  ) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('order_sms')
    .upsert({ order_id: orderId, phone }, { onConflict: 'order_id', ignoreDuplicates: true });

  if (error) {
    const missing = /order_sms/.test(error.message) && /(does not exist|schema cache)/i.test(error.message);
    return NextResponse.json(
      { error: missing ? 'Run supabase-sms-notifications.sql to turn on texting.' : error.message },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
