import { NextResponse } from 'next/server';
import { telnyxConfigured } from '@/lib/telnyx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Whether to show the "Text me when it's ready" box at all. */
export async function GET() {
  return NextResponse.json({ enabled: telnyxConfigured() });
}
