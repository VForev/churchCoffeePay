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
 * A second, differently-shaped ask: a fixed $3 one-time gift to the church's
 * **Coffee & Tea** fund, offered on the last screen before someone places their order.
 *
 * This is NOT Pushpay's embedded widget, and it can't be. The widget's loader reads
 * exactly three keys off `window.pushpayEmbeddedConfig` — `handle`, `wgc` and
 * `onSubmitCallback` — and takes everything else (fund list, default fund, whether a gift
 * is recurring by default) from the merchant's own Pushpay settings. There is no amount,
 * no amount lock, no fund lock and no recurrence override a host page can pass it, and the
 * `wgc` token is signed by Pushpay so we can't extend it. Dropped in as-is on this account
 * the widget opens on a *recurring* gift to *Tithes* with an empty amount box — the
 * opposite of all three things this box is for. A preconfigured giving link does support
 * every one of them, so that's what this is.
 *
 * Most of the locking is already baked into PUSHPAY_LINK itself: that short link expands
 * to `fnd=<Coffee & Tea>&fndv=Lock&r=No&rcv=False`, i.e. the fund is fixed and read-only
 * and the recurring selector is hidden. **If that short link is ever regenerated in the
 * Pushpay portal, check it still carries those** — nothing here can tell that it stopped,
 * and the gift would quietly land in the default fund (Tithes) instead.
 *
 * The two parameters we add are the ones the short link doesn't set:
 *   a=3      the amount
 *   al=true  make it read-only, so $3 is $3
 *
 * Deliberately no `rbu`/`rbt` here: this account returns `ReturnButtonUrl: null` for them,
 * so they'd be noise. The box opens in a new tab instead — see below for why that matters.
 */
export const COFFEE_GIFT_AMOUNT = 3;

/** The Coffee & Tea fund, locked to a one-time $3. Static — no origin needed. */
export const COFFEE_GIVING_LINK = `${PUSHPAY_LINK}?a=${COFFEE_GIFT_AMOUNT}&al=true`;
