import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  constantTimeKeyMatch,
  createSupabaseAdmin,
  signSession,
} from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  // Use the Host header so local dev (0.0.0.0) redirects back to localhost,
  // not 0.0.0.0 (which the browser treats as a different origin and drops the cookie).
  const host = req.headers.get('host') ?? req.nextUrl.host;
  const proto = req.nextUrl.protocol ?? 'http:';
  const origin = `${proto}//${host}`;

  if (!constantTimeKeyMatch(key, process.env.ACCESS_SECRET)) {
    return NextResponse.redirect(new URL('/access-denied', origin), 302);
  }

  const supabase = createSupabaseAdmin();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await supabase
    .from('access_sessions')
    .insert({ expires_at: expiresAt })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.redirect(new URL('/access-denied', origin), 302);
  }

  const cookieValue = await signSession(data.id);
  const res = NextResponse.redirect(new URL('/', origin), 302);
  res.cookies.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
