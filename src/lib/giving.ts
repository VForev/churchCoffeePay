/**
 * Pushpay giving — the church's real donation platform, used for the "give" box shown
 * after an order is placed and on the live order screen.
 *
 * This is separate from the donation box at checkout. That one is a line on the coffee
 * order, charged through Stripe and stored in `orders.tip_amount`. This one hands the
 * person off to Pushpay and never touches our database — the money goes straight to the
 * church, and nothing here knows or records whether they gave.
 *
 * Two ways in, in this order:
 *  1. The embedded widget (`embedded.pushpay.com`), which keeps them on our page.
 *  2. The plain Pushpay link, if that script is blocked or fails — which happens on
 *     locked-down church wifi and in strict mobile browsers more often than you'd think.
 *
 * All three values below are public — they ship in the page either way. To point this at
 * a different Pushpay campaign, replace them with the snippet Pushpay generates for it.
 */

/** The church's Pushpay handle. */
export const PUSHPAY_HANDLE = 'lightofthegospelspokane';

/**
 * The embedded widget's signed config. It encodes the return-to URL
 * (https://lotgcoffee.netlify.app/live), so finishing a gift in the widget brings the
 * person back to the live order screen — that URL is baked into the token and can only
 * be changed by regenerating the snippet in Pushpay.
 */
export const PUSHPAY_WGC =
  'eyJyYnUiOiJodHRwczovL2xvdGdjb2ZmZWUubmV0bGlmeS5hcHAvbGl2ZSIsInJidCI6IkRvbmF0aW9uIiwiYXNrZ3AiOnRydWV9:tQPWkpdptDePQeJk1UD-1t58Rpw';

/** The direct Pushpay page, used when the embedded widget can't load. */
export const PUSHPAY_LINK = 'https://ppay.co/2Wtl1NeKi5Y';

/** The script the embedded widget loads from. */
export const PUSHPAY_SCRIPT_SRC = 'https://embedded.pushpay.com?version=1.0.0';

/**
 * The direct link with a "back to the coffee orders" button on the far side.
 *
 * `rbu`/`rbt` are Pushpay's return-button URL and label — the same pair the embedded
 * token carries. Building it from the live origin rather than a hard-coded domain means
 * the netlify site, a preview deploy and localhost each send people back to themselves.
 * If Pushpay ever stops honouring the parameters the giving page still works; the person
 * just doesn't get a button back, which is why this is the fallback and not the default.
 */
export function pushpayLinkWithReturn(origin: string): string {
  if (!origin) return PUSHPAY_LINK;
  const params = new URLSearchParams({ rbu: `${origin}/live`, rbt: 'Back to coffee orders' });
  return `${PUSHPAY_LINK}?${params.toString()}`;
}
