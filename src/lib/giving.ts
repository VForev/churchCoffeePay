/**
 * Pushpay giving — the church's real donation platform, used for the "give" box shown
 * after an order is placed and on the live order screen.
 *
 * This is separate from the donation box at checkout. That one is a line on the coffee
 * order, charged through Stripe and stored in `orders.tip_amount`. This one hands the
 * person off to Pushpay and never touches our database — the money goes straight to the
 * church, and nothing here knows or records whether they gave.
 *
 * It is a plain link, not Pushpay's embedded widget. The widget keeps people on our page,
 * but it's a third-party script: church wifi and strict mobile browsers block it often
 * enough that a giving box which only works sometimes is worse than one that always works.
 *
 * Both values below are public — they ship in the page. To point this at a different
 * Pushpay campaign, replace the link with the new one.
 */

/** The church's Pushpay giving page. */
export const PUSHPAY_LINK = 'https://ppay.co/2Wtl1NeKi5Y';

/**
 * Where Pushpay sends someone once they're done: /yourlive, the customer's own copy of the
 * order board — not /live, which is the lobby TV.
 */
const RETURN_PATH = '/yourlive';

/**
 * The link with a "back to the coffee orders" button on the far side.
 *
 * `rbu`/`rbt` are Pushpay's return-button URL and label. Building it from the live origin
 * rather than a hard-coded domain means the netlify site, a preview deploy and localhost
 * each send people back to themselves. If Pushpay ever stops honouring the parameters the
 * giving page still works — the person just doesn't get a button back.
 */
export function pushpayLinkWithReturn(origin: string): string {
  if (!origin) return PUSHPAY_LINK;
  const params = new URLSearchParams({
    rbu: `${origin}${RETURN_PATH}`,
    rbt: 'Back to coffee orders',
  });
  return `${PUSHPAY_LINK}?${params.toString()}`;
}

/**
 * ---------------------------------------------------------------------------
 * The $3 Coffee & Tea box on /checkout
 * ---------------------------------------------------------------------------
 *
 * A second, differently-shaped ask: a $3 one-time gift to the church's **Coffee & Tea**
 * fund, offered on the last screen before someone places their order. $3 is the starting
 * amount, not a cap — they can type something else.
 *
 * WHY THIS IS A LINK AND NOT PUSHPAY'S EMBEDDED WIDGET
 * ----------------------------------------------------
 * The widget was tried, in a real browser, against this exact handle. It renders, and it
 * can be pre-filled. It still can't be used here, for one reason that isn't fixable from
 * our side: **its "Next" button navigates the top window to `pushpay.com/g/<handle>`.**
 * It is not an embedded payment at all — it's a pre-fill form that hands off to the same
 * hosted giving page this link opens, and it breaks out of an iframe to do it (verified:
 * a parent page hosting it in an `<iframe>` was itself navigated away). The cart lives in
 * memory only (`src/lib/cart-store.ts` — no localStorage), so on /checkout that redirect
 * throws away the customer's whole order on the way to giving $3. There is no wrapper,
 * sandbox or handler that prevents it.
 *
 * Two smaller things, for whoever revisits this:
 *   - The widget takes exactly three keys off `window.pushpayEmbeddedConfig` — `handle`,
 *     `wgc`, `onSubmitCallback`. Amount, fund and recurrence are NOT among them; they come
 *     from the merchant's Pushpay settings, which on this handle default to the *Event*
 *     fund with an empty amount box. `wgc` is signed by Pushpay, so it can't be extended.
 *   - Since it redirects to this same page anyway, the link skips a whole form step.
 *
 * WHAT THE PARAMETERS DO
 * ----------------------
 *   a=3        starting amount. Deliberately no `al` (amount lock) — they can change it.
 *   fnd=<key>  the Coffee & Tea fund.
 *   fndv=Lock  fund shown read-only, so a coffee gift can't land in Events by accident.
 *   r=No       one-time.
 *   rcv=false  hide the recurring selector entirely. Belt and braces with `r=No`.
 *   f[1] f[2]  Booking ID and Event Name. These are REQUIRED custom fields on this
 *              merchant and Pushpay refuses to advance without them, so they're pre-filled
 *              — otherwise a coffee customer is asked for a booking reference. Booking ID
 *              is validated as a number, hence `0`. If those two fields are ever made
 *              optional in the Pushpay portal, these can go.
 */

/** Pushpay merchant handle — "Light of the Gospel Events". */
const COFFEE_HANDLE = '4135984186';

/** The Coffee & Tea fund on that merchant. */
const COFFEE_FUND_KEY = 'J2nNkYPMQkzlcuDvwZIcdw';

/** Starting amount. Not a lock — the customer can type over it. */
export const COFFEE_GIFT_AMOUNT = 3;

/** $3 to Coffee & Tea, one-time, fund locked. Static — no origin needed. */
export const COFFEE_GIVING_LINK = `https://pushpay.com/g/${COFFEE_HANDLE}?${new URLSearchParams({
  a: String(COFFEE_GIFT_AMOUNT),
  fnd: COFFEE_FUND_KEY,
  fndv: 'Lock',
  r: 'No',
  rcv: 'false',
  'f[1]': '0',
  'f[2]': 'Coffee & Tea',
}).toString()}`;
