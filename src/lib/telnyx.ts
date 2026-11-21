/**
 * Server-only: sends one SMS through Telnyx's REST API.
 *
 * No SDK — it's a single POST, and a fetch keeps the dependency list (and the Netlify
 * function bundle) as it was. Docs: https://developers.telnyx.com/docs/messaging
 *
 * Env:
 *   TELNYX_API_KEY               — Portal → Auth / API Keys (starts with KEY…)
 *   TELNYX_FROM_NUMBER           — your Telnyx number in E.164, e.g. +18885551234
 *   TELNYX_MESSAGING_PROFILE_ID  — optional; the profile the number is assigned to
 *
 * Import this ONLY from files under src/app/api. The key has no NEXT_PUBLIC_ prefix, so a
 * client component importing it would just see it missing — but keep it server-side anyway.
 */

export function telnyxConfigured(): boolean {
  return Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_FROM_NUMBER);
}

export type TelnyxSendResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendTelnyxSms(to: string, text: string): Promise<TelnyxSendResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM_NUMBER;
  if (!apiKey || !from) return { ok: false, error: 'Texting is not set up (TELNYX_API_KEY / TELNYX_FROM_NUMBER).' };

  const payload: Record<string, string> = { from, to, text };
  if (process.env.TELNYX_MESSAGING_PROFILE_ID) {
    payload.messaging_profile_id = process.env.TELNYX_MESSAGING_PROFILE_ID;
  }

  try {
    const res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      // Netlify functions time out at 10s; fail inside that so the row is marked failed
      // rather than left stuck in 'sending'.
      signal: AbortSignal.timeout(8000),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const first = body?.errors?.[0];
      const detail = first?.detail || first?.title || `HTTP ${res.status}`;
      return { ok: false, error: `Telnyx: ${detail}` };
    }
    return { ok: true, id: body?.data?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Telnyx: ${err.message}` : 'Telnyx request failed' };
  }
}
