import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, createSupabaseAdmin, verifySession } from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = await verifySession(cookie);

  if (!sessionId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  await supabase
    .from('access_sessions')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('consumed_at', null);

  return NextResponse.json({ ok: true });
}
