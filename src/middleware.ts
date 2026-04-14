import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isSessionActive, verifySession } from '@/lib/access-edge';

export const config = {
  matcher: ['/', '/checkout', '/checkout/:path*'],
};

async function fetchSession(sessionId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const endpoint = `${url}/rest/v1/access_sessions?id=eq.${encodeURIComponent(sessionId)}&select=id,issued_at,expires_at,consumed_at`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    id: string;
    issued_at: string;
    expires_at: string;
    consumed_at: string | null;
  }>;
  return rows[0] ?? null;
}

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = await verifySession(cookie);

  const deniedUrl = new URL('/access-denied', req.url);

  if (!sessionId) {
    return NextResponse.redirect(deniedUrl);
  }

  const row = await fetchSession(sessionId);
  if (!isSessionActive(row)) {
    return NextResponse.redirect(deniedUrl);
  }

  return NextResponse.next();
}
