/**
 * Run with:  npx tsx src/lib/order-insert.test.ts
 *
 * Only the error parsing is covered here — insertOrderRow() itself needs a database.
 * What matters is that missingColumnName() recognises "that column isn't here" in every
 * spelling PostgREST and Postgres use, and recognises NOTHING else: a real write failure
 * that got mistaken for a missing column would be silently dropped from the row, and on
 * the checkout path the card has already been charged by then.
 */

import { missingColumnName } from './order-insert';

/** Errors that ARE a missing column, and the name they should yield. */
const MISSING: Array<[{ code?: string; message?: string }, string]> = [
  [
    { code: 'PGRST204', message: "Could not find the 'giving_intent' column of 'orders' in the schema cache" },
    'giving_intent',
  ],
  [
    { code: 'PGRST204', message: "Could not find the 'device_id' column of 'orders' in the schema cache" },
    'device_id',
  ],
  [
    { code: '42703', message: 'column "event_id" of relation "orders" does not exist' },
    'event_id',
  ],
  [
    { code: '42703', message: 'column "device_id" does not exist' },
    'device_id',
  ],
];

/** Errors that are NOT a missing column. Every one of these must come back null. */
const NOT_MISSING: Array<{ code?: string; message?: string }> = [
  { code: 'P0001', message: 'ORDER_RATE_LIMIT: too many orders' },
  { code: '23502', message: 'null value in column "total" violates not-null constraint' },
  { code: '23503', message: 'insert or update on table "orders" violates foreign key constraint' },
  { code: '42501', message: 'new row violates row-level security policy for table "orders"' },
  { message: 'TypeError: Failed to fetch' },
  {},
];

let failures = 0;

console.log('── missing columns ───────────────────────────');
for (const [error, expected] of MISSING) {
  const got = missingColumnName(error);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${JSON.stringify(error.message)} -> ${JSON.stringify(got)}`);
}

console.log('\n── real failures (must be null) ──────────────');
for (const error of NOT_MISSING) {
  const got = missingColumnName(error);
  const ok = got === null;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${JSON.stringify(error.message ?? null)} -> ${JSON.stringify(got)}`);
}

console.log(
  `\n${failures === 0 ? '✅ PASS' : '❌ FAIL'} — ${MISSING.length + NOT_MISSING.length} cases, ${failures} failed`,
);
if (failures > 0) process.exit(1);
