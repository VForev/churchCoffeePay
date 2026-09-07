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
 * Coffee & Tea — the $3 ask on /checkout
 * ---------------------------------------------------------------------------
 *
 * THE $3 ASK ON /checkout IS NOT PUSHPAY. It's an amount added to the Stripe charge the
 * customer is already making (`cartStore.setDonation`, stored on the order as
 * `tip_amount`), because that is the only way to ask for it without navigating away.
 *
 * This was tried the Pushpay way first, and it cannot work on /checkout. Pushpay only ever
 * takes payment on pushpay.com:
 *
 *   - The **embedded widget** is not an embedded payment. It's a pre-fill form whose
 *     "Next" button sets `window.top.location.href` to `pushpay.com/g/<handle>` — it
 *     deliberately breaks out of an iframe to do it (verified: a parent page hosting it in
 *     an `<iframe>` was itself navigated away).
 *   - The **hosted giving page can't be framed**: it sends `X-Frame-Options: SAMEORIGIN`.
 *   - Its config object takes exactly three keys — `handle`, `wgc`, `onSubmitCallback`.
 *     Amount, fund and recurrence aren't among them; they come from the merchant's Pushpay
 *     settings. `wgc` decodes to `{"askgp":true}` plus an HMAC, so it can't be extended.
 *
 * `onSubmitCallback` DOES suppress the redirect — the widget hands you `{ redirectUrl }`
 * and stays put — but the customer still has to reach that URL to pay, so it only moves
 * the problem to "which tab". Since /checkout's cart is in memory only
 * (`src/lib/cart-store.ts` — no localStorage), any of those routes risks the coffee order
 * itself. Hence Stripe.
 *
 * The trade, stated plainly: this money lands in **Stripe with the coffee, not in the
 * Pushpay Coffee & Tea fund**. Reconciling that is a bookkeeping job, not a code one.
 */

/** The headline amount for the Coffee & Tea ask. One tap on /checkout. */
export const COFFEE_GIFT_AMOUNT = 3;

/**
 * The verified Pushpay route to the same fund — $3 pre-filled but editable, one-time,
 * fund locked, with the merchant's two required custom fields pre-answered so a coffee
 * customer is never asked for a booking reference.
 *
 * **Nothing renders this today**, on purpose: it navigates away, which is the whole thing
 * /checkout can't afford. It's kept, and known to work, for a page where leaving is free —
 * `/checkout/confirmation` is the obvious one, since the order is already placed by then.
 */
export const COFFEE_GIVING_LINK = `https://pushpay.com/g/4135984186?${new URLSearchParams({
  a: String(COFFEE_GIFT_AMOUNT),
  fnd: 'J2nNkYPMQkzlcuDvwZIcdw', // the Coffee & Tea fund
  fndv: 'Lock', // fund read-only
  r: 'No', // one-time
  rcv: 'false', // hide the recurring selector entirely
  'f[1]': '0', // Booking ID — required by this merchant, validated as a number
  'f[2]': 'Coffee & Tea', // Event Name — also required
}).toString()}`;
