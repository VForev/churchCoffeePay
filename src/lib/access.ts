// Node.js-runtime helpers (API routes, webhooks).
// Do NOT import this file from src/middleware.ts — use access-edge.ts instead.

export {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
  constantTimeKeyMatch,
  isSessionActive,
} from './access-edge';
export type { AccessSession } from './access-edge';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase admin client is not configured');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
