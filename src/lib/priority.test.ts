/**
 * Run with:  npx tsx src/lib/priority.test.ts
 *
 * compareQueue() decides who is next on /barista and what position and wait /live
 * shows. A priority order must jump everything that's waiting, and nothing that's
 * already being made.
 */

import { compareQueue } from './priority';
import type { OrderStatus } from '@/types';

function order(id: string, status: OrderStatus, minute: number, is_priority = false) {
  return { id, status, is_priority, created_at: `2026-11-08T10:${String(minute).padStart(2, '0')}:00Z` };
}

const CASES: Array<[string, ReturnType<typeof order>[], string[]]> = [
  [
    'no priority orders: oldest first, exactly as before',
    [order('b', 'pending', 2), order('a', 'pending', 1), order('c', 'pending', 3)],
    ['a', 'b', 'c'],
  ],
  [
    'a priority order placed last goes ahead of everyone waiting',
    [order('a', 'pending', 1), order('b', 'pending', 2), order('p', 'pending', 9, true)],
    ['p', 'a', 'b'],
  ],
  [
    'but never ahead of a drink already being made',
    [order('a', 'pending', 1), order('m', 'in_progress', 5), order('p', 'pending', 9, true)],
    ['m', 'p', 'a'],
  ],
  [
    'two priority orders keep their own first-come order',
    [order('p2', 'pending', 8, true), order('a', 'pending', 1), order('p1', 'pending', 4, true)],
    ['p1', 'p2', 'a'],
  ],
];

let failures = 0;
for (const [name, input, expected] of CASES) {
  const got = [...input].sort(compareQueue).map((o) => o.id);
  const ok = got.join() === expected.join();
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${got.join(', ')}`}`);
}

console.log(`\n${failures === 0 ? '✅ PASS' : '❌ FAIL'} — ${CASES.length} cases, ${failures} failed`);
if (failures > 0) process.exit(1);
