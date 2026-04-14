import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { SESSION_COOKIE, verifySession } from '@/lib/access';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { amount } = await req.json();

    if (!amount || amount < 50) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const cookie = req.cookies.get(SESSION_COOKIE)?.value;
    const sessionId = await verifySession(cookie);
    if (!sessionId) {
      return NextResponse.json({ error: 'Access session missing' }, { status: 401 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { access_session_id: sessionId },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
