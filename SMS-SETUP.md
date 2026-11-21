# Text When Ready — Telnyx SMS Setup & Status

**Last updated:** 20 Nov 2026
**Status:** Code is finished and working. **Texts will not go out yet**: the Telnyx number still has
to be registered with the US carriers (step 3 under *What's left to do*).

---

## Where things stand

| Item | Status |
|---|---|
| Code (checkout, tablet, barista, server routes) | ✅ Done, builds, tests pass |
| `TELNYX_API_KEY` in `.env.local` | ✅ Set, and the key works |
| `TELNYX_FROM_NUMBER` in `.env.local` | ✅ Set, valid format |
| `TELNYX_MESSAGING_PROFILE_ID` in `.env.local` | ✅ Set: profile **"LOTG Coffee"**, enabled |
| Number attached to the messaging profile | ✅ Yes (it's a **local / "longcode"** number) |
| Database migration `supabase-sms-notifications.sql` | ✅ Run: `order_sms` table exists and the public key can't read it |
| Telnyx account level | ❌ **Too low.** 10DLC registration is blocked: *"This feature is not permitted at this account level"* |
| Carrier registration (10DLC or toll-free) | ❌ **Not done.** Until it is, US carriers block the texts |
| Telnyx keys added in **Netlify** | ❓ Not confirmed |
| Site deployed with the `/text-messages` page | ❓ Not confirmed (registration needs the live URL) |

Until registration is approved, marking an order Ready tries to send, Telnyx or the carrier
rejects it, and the barista board shows **"Couldn't text Sarah K — call their name."** Orders
themselves are never affected.

---

## What's left to do (pick up here)

### 1. Restart the dev server
Next.js only reads `.env.local` at startup. After any env change, stop and re-run `npm run dev`.

### 2. Upgrade the Telnyx account
Telnyx Portal → **Account → Verifications** → complete the business-level verification
(business details, payment method). This is what unlocks 10DLC registration.

### 3. Register the number with the carriers (required for US texting)

The current number is a **local (10DLC)** number, so register it through **Messaging → 10DLC**:

**a. Brand**
- Legal name: Light of the Gospel Church
- Entity type: **Non-profit**
- **EIN** (the church's federal tax ID). Required.
- Address, website (`https://www.lotgchurch.com/`), contact person and email

**b. Campaign**
- Use case: **Customer Care** or **Account Notification**
- Description: *"One-time transactional text telling a coffee-bar customer their order is ready
  for pickup. One message per order. No marketing."*
- Sample message (copy exactly):
  `LOTG Coffee: Hi Sarah K, your order is ready at the coffee bar! Reply STOP to opt out.`
- Opt-in description: *"On the order page (or at the counter), the customer types their mobile
  number into an optional box labelled 'Text me when it's ready'. Text next to the box states
  the sender, one message per order, msg & data rates may apply, STOP/HELP, and links to our
  text message terms. Leaving it blank means no text."*
- Opt-in / terms URL: `https://<your-live-domain>/text-messages`. **Must be the deployed site.**
  Include a screenshot of the checkout phone box if asked.
- Message volume: low (e.g. under 1,000/month)
- Opt-out keywords: STOP. Help keywords: HELP.

**c. Attach the number to the campaign** once it's approved.

Approval usually takes a few days, sometimes up to ~2 weeks. Small brand/campaign fees apply.

**Alternative: a toll-free number instead.** Buy a toll-free number in Telnyx, attach it to
the "LOTG Coffee" messaging profile, and submit **Messaging → Toll-Free Verification** with
the same information as above (the EIN is required here too). There's no monthly campaign
fee. If you switch, change `TELNYX_FROM_NUMBER` to the new number (format `+18885551234`).

### 4. Set up STOP / HELP replies
In the "LOTG Coffee" messaging profile settings, confirm STOP opt-outs are handled
automatically, and set a HELP auto-reply such as:
`LOTG Coffee order alerts. Questions? Ask at the coffee bar. Reply STOP to opt out.`

### 5. Add the keys to Netlify and redeploy
Netlify → Site settings → Environment variables. Add the same three values as `.env.local`:
```
TELNYX_API_KEY=KEY...
TELNYX_FROM_NUMBER=+1XXXXXXXXXX
TELNYX_MESSAGING_PROFILE_ID=...
```
Then trigger a redeploy.

### 6. Test it end to end (after registration is approved)
1. On your own phone, open the menu, add a drink, and go to checkout
2. Type your mobile number in **📱 Text me when it's ready** and place the order
3. On `/barista`: **Start Making** → **Mark Ready**
4. The text should arrive within a few seconds
5. If the barista board shows "Couldn't text…", the message after it is Telnyx's own reason

---

## How it works

**Customer side.** `/checkout` and `/tablet` show an optional phone box, **📱 Text me when it's
ready**. Typing a number is the opt-in; blank means no text. It only appears when the
Telnyx env vars are set. A badly typed number is caught **before** the card is charged.

**Barista side.** When a card goes **Making → Ready**, the board asks the server to send the
text. The customer gets:

> LOTG Coffee: Hi Sarah K, your order is ready at the coffee bar! Reply STOP to opt out.

**Guarantees built in:**
- **One text per order, ever.** Several barista screens, back-and-forth taps, or undoing a
  pickup can't text twice. The server claims the order before sending.
- **Phone numbers are private.** They are not stored on the `orders` table, which is
  readable by anyone with the site's public key. They live in `order_sms`, which only the
  server can read, and each number is **deleted as soon as its text is sent**.
- **Texting can never break an order.** Saving the number and sending the text are both
  best-effort. If either fails, the order still goes through.
- **A failed text is retried** the next time that order is marked Ready.
- US and Canada numbers only. Messages are plain text (no emoji) so each one costs a single SMS
  segment.

```
checkout / tablet ──(order saved)──▶ POST /api/sms/subscribe {orderId, phone} ─▶ order_sms table
barista Making → Ready ────────────▶ POST /api/sms/order-ready {orderId} ──────▶ Telnyx → customer
```

---

## Files

| File | What it is |
|---|---|
| `supabase-sms-notifications.sql` | Migration: creates the locked `order_sms` table (already run) |
| `src/lib/sms.ts` | Phone number parsing, the message text, browser-side calls |
| `src/lib/sms.test.ts` | Tests (`npm run test:sms`) |
| `src/lib/telnyx.ts` | Sends the SMS via Telnyx's API (server only) |
| `src/app/api/sms/route.ts` | `GET /api/sms`: is texting switched on? |
| `src/app/api/sms/subscribe/route.ts` | Saves the number against a just-placed order |
| `src/app/api/sms/order-ready/route.ts` | Sends the "ready" text, once |
| `src/components/ReadyTextOptIn.tsx` | The phone box and its legal small print (used on checkout and tablet) |
| `src/app/text-messages/page.tsx` | Public SMS terms & privacy page, the opt-in link carriers require |
| `src/app/(customer)/checkout/page.tsx` | Phone box added under the name |
| `src/app/tablet/page.tsx` | Phone box added under the name |
| `src/app/barista/page.tsx` | `textIfReady()` sends on Making → Ready |

The `CLAUDE.md` section **"Text When Ready (Telnyx SMS)"** has the developer-level detail.

---

## Rules: don't break these

- **Never make the phone box required**, and never pre-fill or auto-opt people in. Carriers
  will reject or suspend the number.
- **If you change the wording next to the box, change `/text-messages` to match** (and vice
  versa). Carriers compare the form, the terms page and the registration.
- **Keep the message plain ASCII.** One emoji or curly apostrophe can double the cost per
  text.
- **Never store phone numbers on `orders`.** Anyone can read that table.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Phone box doesn't appear | Telnyx env vars missing, or the dev server wasn't restarted after adding them. On Netlify: add the vars and redeploy |
| Barista sees "Couldn't text … call their name" | Read the reason after it. Most likely the number isn't registered yet (10DLC / toll-free), or the account balance is empty |
| Customer replied STOP and now never gets texts | Correct behaviour. Carriers and Telnyx block that number until they text START |
| Numbers not saving (console: "Run supabase-sms-notifications.sql") | Run that file in the Supabase SQL editor |
| Texts stopped after working | Check the Telnyx balance and the number/campaign status in the portal |

---

## Side notes / later ideas

- **Twilio is unused.** The `twilio` npm package and the `TWILIO_*` lines in `.env.local`
  were never wired up. They can be removed.
- **Write-in orders** (`CustomOrderBox`) don't offer the phone box yet. Easy to add.
- The confirmation screen could say "We'll text you when it's ready." Not done yet.
- Existing `npm run lint` errors in `src/app/barista/page.tsx` (`playNotification`,
  `fetchAll`) were already there before this work and are unrelated.

## Reference links
- Telnyx messaging docs: https://developers.telnyx.com/docs/messaging
- Choosing a sender type (10DLC vs toll-free): https://developers.telnyx.com/docs/messaging/getting-started/choosing-your-sender-type
- Toll-free verification: https://developers.telnyx.com/docs/messaging/toll-free-verification
- 10DLC opt-in form rules: https://support.telnyx.com/en/articles/10684260-10dlc-opt-in-form
- What is 10DLC: https://telnyx.com/resources/what-is-10dlc
