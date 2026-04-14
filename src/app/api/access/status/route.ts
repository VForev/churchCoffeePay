import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, createSupabaseAdmin, isSessionActive, verifySession } from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = await verifySession(cookie);

  if (!sessionId) {
    return NextResponse.json({ active: false }, { status: 200 });
  }

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('access_sessions')
    .select('id, issued_at, expires_at, consumed_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ active: false }, { status: 200 });
  }

  return NextResponse.json({
    active: isSessionActive(data),
    issuedAt: data.issued_at,
    expiresAt: data.expires_at,
    consumed: !!data.consumed_at,
  });
}
