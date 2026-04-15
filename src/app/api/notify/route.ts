import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { createSupabaseAdmin } from '@/lib/access';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { orderId } = await req.json();

  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
  }

  const supabase = createSupabaseAdmin();
  const { data: order, error } = await supabase
    .from('orders')
    .select('customer_name, customer_phone')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (!order.customer_phone) {
    return NextResponse.json({ sent: false, reason: 'No phone number on order' });
  }

  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `Hi ${order.customer_name}! Your LOTG Coffee order is ready for pickup. Come grab it! ☕`,
      from: fromNumber,
      to: order.customer_phone,
    });

    return NextResponse.json({ sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send SMS';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
