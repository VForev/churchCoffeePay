import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isSessionActive, verifySession } from '@/lib/access-edge';

export const config = {
  matcher: ['/', '/checkout', '/checkout/:path*'],
};

type SessionRow = { id: string; issued_at: string; expires_at: string; consumed_at: string | null };
type FetchResult = { row: SessionRow | null; unreachable: boolean };

// Returns the session row, or null if not found/unreachable.
// 'unreachable' flag lets the caller distinguish a network error from a missing session.
async function fetchSession(sessionId: string): Promise<FetchResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { row: null, unreachable: true };

  const endpoint = `${url}/rest/v1/access_sessions?id=eq.${encodeURIComponent(sessionId)}&select=id,issued_at,expires_at,consumed_at`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { row: null, unreachable: true };
    const rows = (await res.json()) as SessionRow[];
    return { row: rows[0] ?? null, unreachable: false };
  } catch {
    // Network error or timeout — treat as unreachable, not as denied
    return { row: null, unreachable: true };
  }
}

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = await verifySession(cookie);

  const deniedUrl = new URL('/access-denied', req.url);

  // No valid cookie signature → deny immediately (no DB lookup needed)
  if (!sessionId) {
    return NextResponse.redirect(deniedUrl);
  }

  const { row, unreachable } = await fetchSession(sessionId);

  // If Supabase was unreachable (timeout/network error), fail open so a slow
  // cold-start doesn't kick out a legitimate user who has a valid signed cookie.
  if (unreachable) {
    return NextResponse.next();
  }

  // Session not found, expired, or consumed → deny
  if (!isSessionActive(row)) {
    return NextResponse.redirect(deniedUrl);
  }

  return NextResponse.next();
}
