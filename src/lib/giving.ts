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
 * Coffee & Tea — the $3 gift
 * ---------------------------------------------------------------------------
 *
 * **The $3 goes through Pushpay, not Stripe.** Stripe only ever charges for the drinks;
 * `orders.tip_amount` is always 0 on this path. The gift lands in the church's Coffee &
 * Tea fund, and we never see it — same as the giving box on /yourlive.
 *
 * ORDER FIRST, THEN PUSHPAY. THIS ORDERING IS THE WHOLE DESIGN.
 * ------------------------------------------------------------
 * Pushpay can only take money on pushpay.com, and there is no way around it:
 *
 *   - Its **embedded widget is not an embedded payment**. It's a pre-fill form whose
 *     "Next" sets `window.top.location.href` to `pushpay.com/g/<handle>` — it deliberately
 *     breaks out of an iframe to do it (verified: a parent page hosting it in an
 *     `<iframe>` was itself navigated away).
 *   - Its **hosted page refuses to be framed**: `X-Frame-Options: SAMEORIGIN`.
 *   - Its config object takes exactly three keys — `handle`, `wgc`, `onSubmitCallback`.
 *     Amount, fund and recurrence aren't among them. `wgc` decodes to `{"askgp":true}`
 *     plus an HMAC, so it can't be extended.
 *   - **`rbu`/`rbt` (its "return to site" button) are off on this merchant** — the page
 *     comes back `ReturnButtonUrl: null`. Whoever goes to Pushpay is not coming back.
 *
 * So the ask sits on `/checkout/confirmation`, reached by the "Place Order & Give $3"
 * button, which places the order first. By the time this link is on screen the coffee is
 * already on the barista board, so it costs nothing if they wander off — which is exactly
 * what went wrong when the ask sat on /checkout, where the in-memory cart
 * (`src/lib/cart-store.ts`) dies with the page.
 *
 * THE PARAMETERS
 * --------------
 *   a=3        starting amount. Deliberately no `al` — they can change it.
 *   fnd=<key>  the Coffee & Tea fund.
 *   fndv=Lock  fund read-only, so a coffee gift can't land in Events by accident.
 *   r=No       one-time.
 *   rcv=false  hide the recurring selector entirely. Belt and braces with `r=No`.
 *   f[1] f[2]  Booking ID and Event Name — REQUIRED custom fields on this merchant, which
 *              Pushpay won't advance without, so they're pre-answered rather than asking a
 *              coffee customer for a booking reference. Booking ID is validated as a
 *              number, hence `0`. If those are ever made optional in the portal, drop them.
 */

/** The amount offered on the button, and pre-filled at Pushpay. */
export const COFFEE_GIFT_AMOUNT = 3;

/** $3 to Coffee & Tea, one-time, fund locked, amount editable. Shown on /checkout/confirmation. */
export const COFFEE_GIVING_LINK = `https://pushpay.com/g/4135984186?${new URLSearchParams({
  a: String(COFFEE_GIFT_AMOUNT),
  fnd: 'J2nNkYPMQkzlcuDvwZIcdw', // the Coffee & Tea fund
  fndv: 'Lock', // fund read-only
  r: 'No', // one-time
  rcv: 'false', // hide the recurring selector entirely
  'f[1]': '0', // Booking ID — required by this merchant, validated as a number
  'f[2]': 'Coffee & Tea', // Event Name — also required
}).toString()}`;
