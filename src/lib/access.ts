import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SESSION_COOKIE = 'coffee_session';
export const SESSION_TTL_SECONDS = 60 * 60;

function getSigningKey(): string {
  const key = process.env.SESSION_SIGNING_KEY;
  if (!key || key.length < 16) {
    throw new Error('SESSION_SIGNING_KEY is not configured');
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSigningKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export async function signSession(id: string): Promise<string> {
  const mac = await hmac(id);
  return `${id}.${mac}`;
}

export async function verifySession(cookieValue: string | undefined | null): Promise<string | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf('.');
  if (dot <= 0) return null;
  const id = cookieValue.slice(0, dot);
  const mac = cookieValue.slice(dot + 1);
  if (!id || !mac) return null;
  const expected = await hmac(id);
  if (!timingSafeEqual(mac, expected)) return null;
  return id;
}

export function constantTimeKeyMatch(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(provided, expected);
}

export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin client is not configured');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AccessSession = {
  id: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
};

export function isSessionActive(row: AccessSession | null | undefined, now = Date.now()): boolean {
  if (!row) return false;
  if (row.consumed_at) return false;
  if (new Date(row.expires_at).getTime() <= now) return false;
  return true;
}
