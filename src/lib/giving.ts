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
 * Tea fund, and we never see it.
 *
 * It is the PUSHPAY_LINK short link above with one parameter added. That link is already
 * preconfigured on Pushpay's side and expands to:
 *
 *     fnd=J2nNkYPMQkzlcuDvwZIcdw   the Coffee & Tea fund
 *     fndv=Lock                    fund read-only
 *     r=No & rcv=False             one-time, recurring selector hidden entirely
 *
 * ...so all this adds is `a=3` — the amount, pre-filled and deliberately editable (no
 * `al`, which would lock it). Nothing else is needed, and nothing else should be added:
 * passing `fnd`/`r`/`rcv` again would duplicate keys the short link already sets.
 *
 * **If that short link is ever regenerated in the Pushpay portal, check it still carries
 * the fund lock.** Nothing in the code can tell that it stopped, and gifts would quietly
 * land in the merchant's default fund instead.
 *
 * The other Pushpay merchant (the numeric "Events" handle) is deliberately NOT used here:
 * it marks **Booking ID** and **Event Name** as required custom fields, so a coffee
 * customer gets asked for a booking reference before Pushpay will take $3. This link has
 * no custom fields at all — just the amount and the payment method.
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
 */

/** The amount offered on the button, and pre-filled at Pushpay. */
export const COFFEE_GIFT_AMOUNT = 3;

/** $3 to Coffee & Tea, one-time, fund locked, amount editable, no extra fields to fill. */
export const COFFEE_GIVING_LINK = `${PUSHPAY_LINK}?a=${COFFEE_GIFT_AMOUNT}`;

/**
 * ---------------------------------------------------------------------------
 * Recording the choice — `orders.giving_intent`
 * ---------------------------------------------------------------------------
 *
 * Which of the two Place Order buttons was tapped: `true` for "Give $3", `false` for
 * "No Donation", `null` for an order that was never asked (counter orders on /tablet,
 * write-in orders, anything placed before supabase-giving-intent.sql ran).
 *
 * **It is the choice, not the money.** Pushpay never tells us whether the $3 arrived, so
 * this column can only ever answer "how many said yes" — never "how much came in". Any
 * screen reporting it has to say so, or a number that means one thing will be read as the
 * other.
 */
export const GIVING_INTENT_COLUMN = 'giving_intent';

/**
 * True when a failed write is only failing because this database hasn't run
 * supabase-giving-intent.sql yet.
 *
 * PostgREST answers a missing column with PGRST204 and names it in the message
 * ("Could not find the 'giving_intent' column of 'orders' in the schema cache").
 * The caller retries without the column: a metric must never cost someone their coffee.
 */
export function isMissingGivingIntent(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  return (error.message ?? '').includes(GIVING_INTENT_COLUMN);
}
