/**
 * Run with:  npx tsx src/lib/submit-lock.test.ts
 *
 * This is the regression test for the incident: a customer on slow wifi tapped Place
 * Order three times because the first tap appeared to do nothing, and got three orders
 * and three charges. Every case below taps more than once, on purpose.
 *
 * The important one is SLOW NETWORK. That is the actual bug — the taps did not overlap
 * by a millisecond, they overlapped by however long the shop-config and spam-count round
 * trips took. If that case ever reports more than one order again, the guard is gone.
 */

import { createSubmitLock, type SubmitOutcome } from './submit-lock';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

/** Stands in for placeOrder(): counts how many times it really ran. */
function orderPlacer(delayMs: number, outcome: SubmitOutcome = 'finished') {
  let placed = 0;
  return {
    get placed() {
      return placed;
    },
    work: async (): Promise<SubmitOutcome> => {
      await sleep(delayMs);
      placed++;
      return outcome;
    },
  };
}

async function main() {
  // ── The incident ───────────────────────────────────────────────────────────
  console.log('── slow network, three rapid taps (the reported bug) ──');
  {
    const lock = createSubmitLock();
    const placer = orderPlacer(120); // two slow round trips before anything is inserted
    // Three taps in the same instant, none of them awaited by the tapper.
    const taps = [lock.run(placer.work), lock.run(placer.work), lock.run(placer.work)];
    const accepted = (await Promise.all(taps)).filter(Boolean).length;
    check('orders placed', placer.placed, 1);
    check('taps accepted', accepted, 1);
  }

  console.log('\n── taps spread out across the slow request ──');
  {
    const lock = createSubmitLock();
    const placer = orderPlacer(200);
    const first = lock.run(placer.work);
    // Impatient tapping while the first request is still in flight — the real shape of it.
    await sleep(40);
    const second = await lock.run(placer.work);
    await sleep(40);
    const third = await lock.run(placer.work);
    await first;
    check('orders placed', placer.placed, 1);
    check('second tap swallowed', second, false);
    check('third tap swallowed', third, false);
  }

  console.log('\n── the two different Place Order buttons ──');
  {
    // Give-$3 and No-Donation are separate buttons calling the same handler. Tapping one
    // then the other must not be two orders.
    const lock = createSubmitLock();
    const placer = orderPlacer(100);
    const both = [lock.run(placer.work), lock.run(placer.work)];
    await Promise.all(both);
    check('orders placed', placer.placed, 1);
  }

  console.log('\n── after success the button never comes back ──');
  {
    const lock = createSubmitLock();
    const placer = orderPlacer(10);
    await lock.run(placer.work);
    check('locked after success', lock.busy, true);
    // The browser is navigating to /checkout/confirmation; a tap landing in that gap
    // must not start a second order.
    const later = await lock.run(placer.work);
    check('later tap swallowed', later, false);
    check('orders placed', placer.placed, 1);
  }

  console.log('\n── a correctable failure DOES hand the button back ──');
  {
    // A declined card, or a name that needs a last initial. Retrying is the whole point.
    const lock = createSubmitLock();
    const placer = orderPlacer(10, 'try-again');
    await lock.run(placer.work);
    check('unlocked after try-again', lock.busy, false);
    await lock.run(placer.work);
    check('retry ran', placer.placed, 2);
  }

  console.log('\n── a thrown error holds the lock (money-safe default) ──');
  {
    const lock = createSubmitLock();
    let ran = 0;
    const boom = async (): Promise<SubmitOutcome> => {
      ran++;
      await sleep(5);
      throw new Error('charged, but the order row failed');
    };
    await lock.run(boom).catch(() => {});
    check('still locked', lock.busy, true);
    await lock.run(boom).catch(() => {});
    check('did not run again', ran, 1);
  }

  console.log('\n── /tablet: release() arms it for the next customer ──');
  {
    const lock = createSubmitLock();
    const placer = orderPlacer(10);
    await lock.run(placer.work);
    check('held after the first customer', lock.busy, true);
    lock.release(); // resetForNextOrder()
    check('armed again', lock.busy, false);
    await lock.run(placer.work);
    check('second customer charged once', placer.placed, 2);
    // And the guard still holds within that second transaction.
    lock.release();
    const slow = orderPlacer(80);
    const taps = [lock.run(slow.work), lock.run(slow.work), lock.run(slow.work)];
    await Promise.all(taps);
    check('three taps, one charge', slow.placed, 1);
  }

  console.log(`\n${failures === 0 ? '✅ PASS' : '❌ FAIL'} — ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main();
