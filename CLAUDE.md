# LOTG Coffee POS — Project Guide

## What This Is

A full-stack coffee shop point-of-sale and ordering system for **Light of the Gospel Church** (LOTG). It supports two ordering workflows:

1. **Mobile ordering** — Customers scan a QR code or visit the URL on their phone, browse the menu, and pay with a card.
2. **Counter ordering** — A barista uses the tablet page to input the order while talking to the customer, then hands the tablet to the customer to pay.

Baristas manage orders in real time on the barista dashboard. Admins manage everything (menu, pricing, events, coupons, inventory) from the admin panel. Customers can track their order status live.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password for admin only) |
| Payments | Stripe (card payments via Stripe.js) |
| Real-time | Supabase Realtime (WebSocket subscriptions) |
| SMS | Twilio (optional, integrated) |
| QR Codes | qrcode.react |
| Hosting | Netlify (configured for `next start --hostname 0.0.0.0`) |

---

## Running Locally

```bash
npm install
npm run dev
```

The dev server starts on `http://localhost:3000` and is also accessible on your local network at `http://<your-ip>:3000` (useful for testing on a real phone or tablet).

```bash
npm run build   # production build
npm run start   # start production server
```

---

## Environment Variables

Create a `.env.local` file in the project root. All of these are required:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=         # Project URL from Supabase dashboard
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Anon/public key from Supabase dashboard
SUPABASE_SERVICE_ROLE_KEY=        # Service role key (server-side only)

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=   # pk_test_... or pk_live_...
STRIPE_SECRET_KEY=                    # sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET=                # whsec_... from Stripe webhook settings

# Session / Access
ACCESS_SECRET=         # Random hex string for access control
SESSION_SIGNING_KEY=   # Random hex string for session signing

# Twilio (SMS — optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

---

## Database Setup

### First-time setup
Run `supabase-schema.sql` in the **Supabase SQL Editor** (Dashboard → SQL Editor → New Query).

### Migrations (run after initial setup)

**`supabase-add-customer-phone.sql`** — Adds `customer_phone` column to orders.

**`supabase-archive-orders.sql`** — Required for soft-delete (archive) and modifier reordering:
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_archived_at ON orders(archived_at);
ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
```

**`supabase-access-sessions.sql`** — Auth session configuration.

**`supabase-lock-ordering.sql`** — Required for the **Lock Everything** button at
`/admin/settings`. Widens the `ordering_override` CHECK to allow `'locked'`. Until it runs,
choosing Lock Everything fails to save and the shop stays on whatever it was.

**`supabase-label-branding.sql`** — Adds the church logo / church name columns to
`label_settings`. Until it runs, labels still print the branding (it defaults on in code)
but the toggles at `/admin/labels` have nowhere to save.

**`supabase-v2-features.sql`** — **Required** for sold-out flags, shop settings, ordering hours, and per-drink modifier overrides. Safe to re-run. Adds:
- `menu_items.is_sold_out` and `modifiers.is_sold_out` — barista "86" flags
- `shop_settings` — service banner, donation toggle, open/closed override (single row, `id = 1`)
- `ordering_hours` — one row per weekday (0 = Sunday)
- `item_modifier_overrides` — hide or lock one option on one drink
- Realtime on `menu_items`, `modifiers`, `shop_settings`, `ordering_hours`

Until this migration runs, the app falls back to sensible defaults (nothing sold out, always open, donations on) rather than erroring.

**`supabase-order-issues.sql`** — Required for **flagging problem orders** on the barista
board. Adds `orders.issue_flagged_at` / `orders.issue_note`, and puts
`order_item_modifiers` on the realtime publication so every barista screen refreshes on
any part of an order changing. Until it runs, the board works normally but flagging an
issue fails with a message naming this file.

**`supabase-label-cups.sql`** — Required for **every cup of a multi-drink order to print**,
and for the per-cup 🖨 buttons on `/barista`. Adds `orders.item_count` (how many drinks the
order has, stamped once they're all inserted) and `orders.label_print_cups` (which cups a
print request is for). Until it runs, ordering and whole-order printing work as before, but
the agent has to guess when an order has finished arriving and per-cup printing says to run
this file.

**`supabase-order-timing.sql`** — Required for the **How long orders took** panel on
`/admin` and the "made in" time on barista History rows. Adds `orders.started_at`,
`orders.ready_at` and `orders.completed_at`, stamped by `/barista` as the barista moves a
card. Until it runs, the board works normally, shows a one-line notice, and the dashboard
panel says which file to run. Orders placed before it can't be back-filled — there's no
honest value to back-fill them with.

**`supabase-manual-printing.sql`** — Flips label printing to **manual, one cup at a time**
(`label_settings.auto_print` defaults to FALSE) and adds `orders.label_printed_cups`, so
the board can show which cups have already come off the roll. Without it, printing still
works per cup; every cup just always looks unprinted.

**`supabase-order-rate-limit.sql`** — Required for the **spam-order limit**. Adds
`orders.device_id`, the three `shop_settings.spam_*` columns, and the `BEFORE INSERT`
trigger that actually enforces the limit. Until it runs there is no limit at all, and
`/admin/settings` says so when you try to save one.

### Seed data
`supabase-seed.sql` — Loads sample categories, modifier groups, modifiers, and menu items to get started.

---

## All Pages / Routes

### Customer-facing

| Route | Description |
|-------|-------------|
| `/` | Main menu page — customers browse categories and items, add to cart |
| `/checkout` | "Place Your Coffee Order" — customer name, coupon, donation, Stripe card payment. The word "checkout" is deliberately gone from the UI: customers read it as "order already placed" and bail. Name requires **first + last name, last initial is enough** (`validateFullName` in `src/lib/profanity.ts`) — one letter is what tells two Sarahs apart when the barista calls the order. |
| `/checkout/confirmation` | Order confirmation screen after successful payment — plus the Pushpay giving box |

### Staff

| Route | Description | Who uses it |
|-------|-------------|-------------|
| `/tablet` | Counter POS — two-panel layout: menu left, cart right. Barista builds order, customer pays on same device | Barista at counter |
| `/barista` | Barista dashboard — three tabs: **Orders** (real-time kanban with search, back buttons, undo, issue flagging and a 🖨 print button per cup) , **Sold Out / 86** (mark drinks and add-ins out of stock) and **History** (past orders with their make time, reprint any single cup, issues-only filter) | Barista making drinks |
| `/live` | Public live orders screen — queue position, status and wait time for all active orders. **No giving box** | The lobby TV (share the URL / QR code) |
| `/yourlive` | The same board, plus the Pushpay giving box under the queue | A customer on their own phone — where "Track Order" and the confirmation screen send them |

### Admin (requires login)

| Route | Description |
|-------|-------------|
| `/admin/login` | Admin login (Supabase email/password) |
| `/admin` | Dashboard — analytics filtered by time range and event; how long orders took; problem orders; low stock alerts |
| `/admin/menu` | Create/edit/delete categories and menu items; reorder with ▲/▼ |
| `/admin/modifiers` | Manage modifier groups (Size, Milk, Syrups, etc.) and individual options; reorder with ▲/▼ |
| `/admin/events` | Event pricing profiles — activate "Everything Free" mode or custom pricing |
| `/admin/coupons` | Coupon codes — percentage, fixed amount, or free order discounts |
| `/admin/inventory` | Track stock levels, set low-stock thresholds, log restocks |
| `/admin/orders` | Full order history — expand rows, filter by status, search by name, archive or delete |
| `/admin/labels` | Cup label layout — roll size, what's on the label, text sizes, live preview, test print |
| `/admin/print-setup` | Non-technical, step-by-step guide to installing the printer software on the shop PC; downloads the agent bundle |
| `/admin/settings` | Service banner text, weekly ordering hours, force open/closed, **lock everything**, donation on/off, coupon box on/off, **spam-order limit** |

---

## Key Files

```
src/
├── app/
│   ├── (customer)/page.tsx          # Customer menu / ordering
│   ├── (customer)/checkout/page.tsx # Stripe checkout
│   ├── tablet/page.tsx              # Counter POS page
│   ├── barista/page.tsx             # Barista real-time dashboard
│   ├── live/page.tsx                # Public order status screen
│   ├── admin/                       # All admin pages
│   └── api/checkout/route.ts        # Stripe PaymentIntent API
├── components/
│   ├── menu/ModifierSelector.tsx    # Customization modal (supports 30+ syrup dropdowns)
│   ├── menu/MenuCard.tsx            # Item card
│   ├── cart/CartDrawer.tsx          # Slide-out cart
│   └── ui/                          # Button, Card, Modal, Input, Badge
├── lib/
│   ├── cart-store.ts                # Client-side cart state (observer pattern)
│   ├── shop.ts                      # Open/closed/locked logic — canOrderNow() lives here
│   ├── order-timing.ts              # How long an order took — the only place it's computed
│   ├── rate-limit.ts                # Spam-order limit, around the database trigger
│   ├── device.ts                    # Random per-browser id, used only by the spam limit
│   ├── order-issues.ts              # Problem-order flag: reasons, hasIssue(), error copy
│   ├── logo.ts                      # Church mark as base64; shared with the print agent
│   ├── giving.ts                    # Pushpay handle, token and link
│   ├── supabase.ts                  # Supabase client
│   ├── access.ts                    # Admin service-role client
│   └── utils.ts                     # formatPrice, generateId, cn()
└── types/index.ts                   # All TypeScript interfaces
```

---

## Supabase Dashboard

**Project URL:** `https://errkudkpnrjzyjboemwy.supabase.co`

Direct links:
- **Table Editor:** https://supabase.com/dashboard/project/errkudkpnrjzyjboemwy/editor
- **SQL Editor:** https://supabase.com/dashboard/project/errkudkpnrjzyjboemwy/sql
- **Auth Users:** https://supabase.com/dashboard/project/errkudkpnrjzyjboemwy/auth/users
- **Realtime:** https://supabase.com/dashboard/project/errkudkpnrjzyjboemwy/realtime

To create the first admin user: Auth → Users → Add User → enter email/password. Then log in at `/admin/login`.

---

## Stripe Dashboard

- **Test mode payments:** https://dashboard.stripe.com/test/payments
- **Live mode payments:** https://dashboard.stripe.com/payments
- **Webhooks:** https://dashboard.stripe.com/webhooks

Webhook endpoint to register: `https://<your-domain>/api/webhooks/stripe`

Events to listen for: `payment_intent.succeeded`, `payment_intent.payment_failed`

Use test card `4242 4242 4242 4242` (any future date, any CVC) for local testing.

---

## Branding & Design

Based on [lotgchurch.com](https://www.lotgchurch.com/).

### Color Palette

| Variable | Hex | Use |
|----------|-----|-----|
| `--color-primary` | `#4054B2` | Navy blue — buttons, links, active states |
| `--color-primary-light` | `#5A6FCC` | Button hover |
| `--color-secondary` | `#6EC1E4` | Light blue — accents |
| `--color-success` | `#23A455` | Green — ready orders, confirmations |
| `--color-success-light` | `#61CE70` | Green hover |
| `--color-warm` | `#6B5D4B` | Brown — special instructions, accents |
| `--color-bg` | `#F0F4F7` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, modals |
| `--color-text` | `#54595F` | Body text |
| `--color-danger` | `#DC2626` | Red — errors, delete actions |
| `--color-warning` | `#F59E0B` | Amber — pending orders |

### Fonts
- **Headings:** Kumbh Sans (`font-heading`)
- **Body:** Nunito (`font-body`)
- **Accents/UI:** Roboto (`font-accent`)

---

## Order Workflow

### Status flow
```
pending → in_progress → ready → completed
                              ↘ cancelled
```

Baristas can move an order **backwards** if they tapped the wrong card:
- "Making" cards have a **← Back to Pending** button
- "Ready" cards have a **← Back to Making** button
- Tapping "Order Picked Up" removes the card from the board, so an **Undo** bar appears for 12 seconds to put it back in Ready

### Wait time calculation
Used on `/live` and `/barista`:
- **1 minute per item** across the entire queue
- `estimatedMinutes = (items in all orders placed before yours) + (items in your order)`
- Example: 3 orders ahead with 2+1+3 items, your order has 2 items → **8 min** estimated wait

### Order sources
- `mobile` — customer ordered from their phone via the menu page
- `counter` — barista entered the order via the tablet POS page

---

## Modifier System

Modifier groups are linked to menu items. Each group can be:
- **Required** — customer must choose at least one option (e.g., Size, Milk)
- **Allow Multiple** — customer can pick several (e.g., Syrups, Extras)

**For groups with 8+ options** (like a 30-syrup list), the ordering UI automatically switches from a button grid to a searchable scrollable list with removable chips.

To add 30 syrups: Go to `/admin/modifiers` → find the Syrups group → click `+ Option` for each syrup. They'll appear in the searchable dropdown automatically once the count hits 8.

### Per-drink options (the Americano problem)

Modifier groups are shared across the menu, but each drink can override them. Go to **`/admin/menu` → the drink → `Options`**:

- **Group checkbox** — whether the drink offers that group at all. Uncheck **Milk** on an Americano and the group vanishes for that drink only.
- **Per-option state** — inside a linked group, each option is one of:
  - **Shown** — customer can pick it (the default)
  - **Hidden** — not offered on this drink (e.g. Pumpkin syrup only on seasonal drinks)
  - **Locked** — always included, customer cannot remove or swap it. Shows as a 🔒 "Included" chip.

Stored in `item_modifier_overrides`. A locked option in a single-select group fixes that group's choice entirely. Locking two options in a single-select group doesn't make sense — the admin UI warns you, and only the first applies.

The shared loader `src/lib/menu.ts` (`fetchItemModifierGroups`) applies all of this and is used by both the customer menu and the tablet POS.

---

## Dashboard Analytics

`/admin` is driven by two controls at the top, and every number under them comes from
the same fetched set — nothing on the page can disagree with anything else.

- **Time range** — Today / Yesterday / Last 7 days / Last 30 days / All time / Custom range
- **Event** — All events / Regular service (no event) / any specific event
- **Reset to today** — puts both controls back to the default

It reports orders, revenue, drinks made, average order, donations, discounts, busiest
hours, hot vs cold split, phone vs counter, top drinks, top add-ins, a **How long orders
took** panel (see below), a **Problem orders** panel (see *Problem-order stats* below), and
a per-event comparison table (click a row to filter the whole page to that event).
Cancelled orders are excluded everywhere.

**Event tagging:** orders now save `event_id` — whatever event was active when the order
was placed. Orders taken **before this change have `event_id = NULL`** and show up under
"Regular service (no event)", so per-event history only goes back to when this shipped.

### How long orders took — `/admin`

How long each order took to make, under the same time-range and event filters as
everything else. It reports **average**, **typical (median)**, **fastest**, **slowest**,
a distribution of make times, average make time **by hour ordered**, and **every order
with its own time**, slowest first.

Two different durations, side by side, because they answer different questions:

| | Measured | Says |
|---|---|---|
| **Made in** | Start Making → Mark Ready | how fast the bar is |
| **Ordered → ready** | order placed → Mark Ready | what the customer actually felt, queue included |

A bar can be quick while the wait is long — that's a staffing answer, not a training one,
and reporting only one of the two hides which. Barista **History** rows show the same
"made in" figure on the row itself.

**The arithmetic lives in `src/lib/order-timing.ts` and nowhere else.** Three screens ask
this question and an average that contradicts the list under it is worse than no average.

Things that keep the numbers honest:

- **Nothing is invented.** The stamps are written by `/barista` (`statusStamps()`) as the
  barista moves a card, and the back buttons unwind them: a card tapped into Making by
  mistake and sent back to Pending *loses* its `started_at`, while one sent back from Ready
  keeps it and loses `ready_at`, so a remake is counted inside the same make time. An order
  marked Ready without ever being started reports as untimed, not as a drink that took zero
  seconds.
- **Forgot-to-tap outliers are dropped, not clamped.** Past `MAX_SANE_MINUTES` (45) the
  card was left in Making until someone cleared the board at noon. Clamping it would still
  claim the drink took 45 minutes, which is just as untrue.
- **Untimed orders are listed, with the reason.** The panel says how many of the window's
  orders it actually covers. An average quietly computed over half a morning is how a number
  stops being trusted.
- **A missing migration doesn't take the page down.** The main query asks for the timing
  columns and, if they aren't there, re-runs without them; only this one panel goes quiet
  and names `supabase-order-timing.sql`.

## Stopping Spam Orders

Someone hammering the order button — a bored kid, a stuck finger, a joke — puts junk on the
barista board mid-service. **More than 3 orders from the same phone (or the same name)
inside 10 minutes is refused.** Both numbers are editable at `/admin/settings` → *Stopping
spam orders*.

**The limit is a Postgres trigger, not JavaScript** (`supabase-order-rate-limit.sql`).
Orders are inserted straight from the customer's browser with the public anon key, so
anything checked only in the app is bypassed by clearing site data or opening a private
tab. The trigger is on `BEFORE INSERT ON orders` and is the enforcement; everything in
`src/lib/rate-limit.ts` is presentation around it. **Never "fix" a failure by removing the
trigger.**

- **`/tablet` is never limited.** It's `order_source = 'counter'` and would trip the limit
  within one busy minute. A limit is about the public, not about stopping staff serving the
  queue in front of them.
- **Matched on device OR name.** `orders.device_id` is a random string in localStorage
  (`src/lib/device.ts`) — not a fingerprint, not a login, just "the same browser as five
  seconds ago". Clearing storage doesn't hand anyone a fresh allowance, because the name
  still matches. Nothing here catches someone with two phones, and nothing needs to.
- **Checkout checks BEFORE charging.** The trigger fires on the insert, which in the
  checkout flow happens *after* Stripe has taken the money — being refused there would mean
  a charged customer with no order. So `checkSpamLimit()` reads the count up front, and
  that's the path customers actually hit. If the two are ever raced (two tabs submitted
  together) and the card was already charged, the message says so and sends them to the
  barista rather than swallowing it.
- **Write-in orders matter most.** `CustomOrderBox` takes no card at all, which makes it the
  easiest thing on the site to hammer — the limit's own words go straight to the customer
  there.
- **Cancelled orders don't count** toward the limit: an order the shop threw out must not
  lock the customer out of re-placing it.
- **No settings row, or the limit switched off, means no limit** — refusing every order
  because a row is missing would be far worse than letting them through.

## Cup Label Printing

**Nothing prints automatically. The barista prints each cup as they make it**, from the
per-cup list on the order card at `/barista`. Full setup instructions are in
**`print-agent/README.md`** — that's the file to hand to whoever sets up the shop PC.

The website never talks to the printer. It can't: Safari on iPad has no Web Bluetooth,
and the CLABEL 221B has no documented protocol. Instead, `print-agent/` is a small Node
script that runs **on the shop PC** with the printer plugged in over USB. It subscribes
to the same Supabase Realtime `orders` feed the barista board uses and prints through the
normal Windows printer driver. If the PC is off or the printer jams, orders still flow —
nothing about ordering depends on the printer.

- **Migrations:** run `supabase-label-printing.sql` (adds `orders.label_printed_at`),
  `supabase-label-settings.sql` (adds the `label_settings` table behind `/admin/labels`),
  `supabase-label-cups.sql` (see *One label per cup* below) and
  `supabase-manual-printing.sql` (see *Printing one cup at a time* below).
- **`label_printed_at` is the whole state machine.** NULL = not printed. The agent only
  prints NULL rows and stamps them when done, so it can crash, restart, or be switched on
  halfway through service and catch up without double-printing.
- **Reprint** = set it back to NULL. That's what the 🖨 buttons on the barista card do.
- **Hot/cold on the label** comes from the same `src/lib/temperature.ts` the barista board
  uses — the agent imports it directly, so the cup band and the screen can never disagree.

### One label per cup — and why a 3-drink order used to print 1

A quantity of 3 is three separate labels, not "x3" on one. **The cups are numbered in one
place, `orderCups()` in `src/lib/cups.ts`**, which both the agent and the barista board
import — so `CUP 2 OF 5` on the roll and the board's **Print cup 2** button always mean the
same drink. (Cups sort by `order_items.id`: that table has no `created_at` and PostgREST
promises no row order, so insertion order isn't available to either side. Arbitrary but
*identical everywhere* is the property that matters.)

The bug this fixes: the app inserts the order row first, then its drinks **one at a time**,
each a separate round trip. The agent's realtime event routinely arrived when only the first
drink existed — so it printed one `CUP 1 OF 1` label, stamped the order printed, and the
rest never came out. Worst on `/tablet`, where orders are biggest.

Two guards, and the agent needs neither to be perfect:

- The app stamps **`orders.item_count`** once every drink row is in (`markOrderItemsComplete`
  in `src/lib/label-print.ts`). The agent waits for that many drinks. Best-effort on the app
  side — an order must still go through on a database that's a migration behind.
- Failing that (no migration, or a browser that died mid-insert) the agent waits for the
  drink count to **stop growing** — 2s of no new rows — and gives up after 15s and prints
  what's there. A late cup beats no cup.

Orders older than a minute skip the wait entirely; they finished arriving long ago.

### One print job per order — the feed

An order's cups go to the printer as **one job with a page per cup**, rendered by
`renderLabelsPdf()` in `print-agent/label.ts`. A job per cup is what made the roll stop
advancing cleanly: the printer took a burst of back-to-back jobs, each re-initialising the
media, and the second label printed across the gap. One multi-page job is exactly what the
driver does when you print N copies from any normal program, so the feed is its problem
again rather than ours. `PRINT_SEPARATE_JOBS=1` in the agent's `.env` restores a job per
cup, spaced by `PRINT_JOB_DELAY_MS`, for a printer that handles multi-page badly.

**Every `text()` call in `label.ts` must pass a `height`.** PDFKit starts a new page when
text would run past the bottom of the current one — and here a new page is a new *label*,
so an unbounded line sitting within one line-height of the bottom silently feeds an extra
sticker with one stray line on it. `NO_PAGE_BREAK` (PDFKit's own `height: Infinity` idiom,
the one `heightOfString` uses) is what the single-line draws pass; the blocks that lay out
real content pass their true available height so they clip with an ellipsis instead. The
first line of any `text()` call is always drawn before that check runs, so capping the
height never loses anything.

If cups after the first still come out wrong, it's the printer, not the labels: run
`npm run test-feed` in `print-agent/` (a pretend 3-cup order, printed the real way) and
follow the calibration steps in `print-agent/README.md`. Gap sensing and media type live
in Windows' Printing Preferences and nothing in this repo can set them.

### Printing one cup at a time — there is no "print all"

**There is no whole-order print button, and auto-print is off by default.** Every order
card carries a list with **one row per cup** — the drink, its add-ins, and its own 🖨
Print button — and that list is the printing UI, not a reprint menu hidden behind a
toggle. Same list in **History** (expand any order), for a drink someone brings back
after pickup.

Why it went this way: printing the whole order the moment it lands puts stickers on the
bar for drinks nobody has started, and one dropped cup then costs a fresh set of five with
four strays to bin. Printing the cup you are about to make keeps the label and the cup in
the same hand.

- **`CupPrintList` in `src/app/barista/page.tsx` is the one definition of that list**, used
  by both the live card and History, so the two can't drift.
- **`orders.label_printed_cups`** is which cups have physically come off the roll. The
  agent *accumulates* into it (never replaces), so printing cup 3 doesn't wipe cups 1 and 2,
  and a reprint never un-marks a cup — a cup that printed twice has still printed. Rows show
  ✓ printed, and the heading counts how many are left to do.
- Everything still goes through `requestLabelPrint(orderId, cups)` in
  `src/lib/label-print.ts`. `cups` is `[2]` from the buttons; `null` (the whole order) is
  kept in the API because the agent and the migration fallback still understand it, not
  because anything in the UI sends it.

`auto_print` still exists at **`/admin/labels` → When to print** for a shop that wants the
old behaviour — it just defaults off now, including on a database that hasn't run
`supabase-manual-printing.sql`. An unexpected auto-print burns a roll unattended; an
unexpected manual mode is one visible button.

Prints for one order are **chained** in the agent, not dropped: tapping "print cup 3" while
cup 1 is still spooling queues it, and each run re-reads `label_printed_at` afterwards, so a
duplicate realtime event still can't print twice.

### Editing the layout — `/admin/labels`

Roll size, what appears on the label, and text sizes are all edited in the browser and
stored in `label_settings` (single row, `id = 1`). The agent subscribes to that table, so
**saving in admin changes the next label that prints** — nobody has to touch the shop PC.
The 🖨 **Send test label** button stamps `test_print_requested_at`, which the agent watches;
that's the only way to confirm physical alignment, since a screen can't tell you the label
is sitting straight in the printer.

**The layout is defined exactly once, in `src/lib/labels.ts` (`labelMetrics`), in millimetres.**
The admin preview converts those millimetres to pixels; the print agent converts the same
millimetres to PDF points. Neither one decides a size on its own. This is the whole reason
the preview can be trusted — if the two sides computed their own type sizes they would
drift within a week and the preview would quietly start lying. **Change a size in
`labelMetrics()`, never in the preview component or the PDF renderer.**

The one thing the preview can't reproduce is PDFKit's shrink-to-fit on a long name, which
it approximates with CSS. The roll is still the final word.

### Making the milk stand out

Every modifier category on the label has three levels of emphasis — **Normal**, **Bold**,
**Black box** — set per category at `/admin/labels` → *Modifier categories* → **Stand out**.

**Milk is Bold out of the box, with nothing configured.** It's the one add-in where getting
it wrong isn't a preference but a problem (oat and almond are on the label because somebody
can't drink dairy), and it's the line a barista scans for while steaming. Matched on the
group *name* (`/\bmilks?\b/i` in `defaultEmphasisFor()`), so a shop calling the group "Milk
Options" or "Milks" gets it too, and nothing has to be set up before Sunday.

**Black box** is white text reversed out of a black chip, the same trick as the HOT/COLD
band — on a 1-bit thermal printer a black block is the only genuinely loud emphasis there
is, since there's no colour and no grey. The chip is drawn to the width of its own text, so
"Oat Milk" gets a chip the size of "Oat Milk", not a bar across the sticker. It costs a
little height; if the chip won't fit the printable width, it falls back to bold rather than
printing half a black block with the milk name cut out of it.

Like every other measurement, the emphasis is resolved once in `groupStyle()` in
`src/lib/labels.ts` and read by both the admin preview and the PDF renderer — set it in one
and the other follows.

### Church branding on the label

Every cup carries the **Light of the Gospel** mark and name, in a row under the HOT/COLD
band. Both are switchable, the name is editable, and the pair share one size slider —
`/admin/labels` → **Church branding**.

The artwork is a **pure-black silhouette embedded as base64 in `src/lib/logo.ts`**, not a
file in `public/`. That's the only form both sides can reach: the preview runs in a browser
and the agent runs on the shop PC, and a shared image file would have to be copied into
both. Black, because thermal printers are 1-bit and the brown original dithers into mush at
3mm tall. The full-colour logo for web use is `public/lotg-logo.png`.

**It costs about a line and a half of modifiers on a 50 × 30 roll.** That's a real trade —
check the preview, or turn it off, if the shop runs short labels with busy drinks.

One ordering hazard the agent has to handle: the web app inserts the order row **before**
its `order_items`, so a realtime event can arrive when the order still has zero drinks on
it. The agent polls briefly for the items rather than printing a blank label.

### Getting the agent onto the shop PC — `/admin/print-setup`

A non-technical, numbered walkthrough for whoever sets up the shop computer. It hands them
a **Download printer software** button and prefills the `.env` with the shop's Supabase URL
and anon key (both are public `NEXT_PUBLIC_*` values, and the page sits behind admin login).

The download is `public/print-agent.zip`, **generated by `scripts/build-agent-zip.mjs`**, a
dependency-free pure-Node ZIP writer. It runs automatically via the `predev` / `prebuild`
npm scripts, so the bundle is always rebuilt from current source and is **never committed**
(it's gitignored). The zip contains `print-agent/` plus the two `src/lib` files the agent
imports, at their real relative paths, so `../src/lib/...` still resolves once unzipped.
If you change any agent file, the next `npm run dev` or `npm run build` re-bundles it — no
manual step.

## Hot / Cold on the Barista Board

`/barista` cards lead with the cup to grab — a bold **HOT CUP** / **COLD CUP** chip at
the top of the card and again on each drink. It's derived, not a column: `src/lib/temperature.ts`
reads the drink's modifiers first (a "Temperature" group's Hot/Iced), then falls back to
the drink's name ("Cold Brew" is never hot). When it genuinely can't tell, it shows no
chip rather than a wrong one.

Cards are also tinted and striped in their column's color — amber pending, navy making,
green ready — so status reads from across the bar.

The chips are deliberately oversized — `text-2xl` on the card summary, `text-lg` per drink.
They're read from the other end of the bar by someone who is already reaching for a cup,
so they outrank the customer's name in size. Shrinking them to "fit more on screen" is the
change that quietly puts a hot drink in a cold cup.

## Searching the Live Board

The Orders tab has a search box above the columns. It matches the customer name, the drink
name, any add-in and any special instruction — every word typed has to appear somewhere, so
"iced sarah" finds Sarah's iced drink.

It filters **what's shown, never what's counted**: wait times still come from the whole
queue (`calcWaitMinutes` is always passed the unfiltered `orders`), and the header still
reports the real totals. A filtered board quoting a shorter wait than the real one would be
worse than no search at all.

## Multiple Barista Screens

More than one person works the board at once — a phone at the bar, the till, the tablet by
the till. `/barista` is built for that:

- **Every table an order lives in is subscribed** — `orders`, `order_items` and
  `order_item_modifiers` — so a screen that loaded an order in the split second before its
  drinks were inserted fills itself in instead of showing an empty card.
- **Realtime bursts are coalesced.** One order arriving is a row per drink and a row per
  add-in, all in the same instant. They're debounced (120ms) into a single refetch.
- **A poll runs underneath the websocket** — every 15s while connected, every 4s while not —
  plus a refetch on tab focus, visibility and `online`. A tablet that slept or dropped
  church wifi comes back with a socket that *looks* connected; the poll is what saves it.
- **The header says which state it's in.** A green pulsing "Live" or a red "Reconnecting…".
  A dead feed must never look like a quiet morning.
- **Taps apply locally first**, before the round trip, so a card never feels stuck.
- **Status writes are conditional**: `.eq('status', <what this screen was showing>)`. If
  another screen already moved the order, the write matches no row and a bar says so,
  rather than one barista silently dragging a drink back out of Ready.
- **Stale responses are dropped.** Refetches carry a sequence number, so a slow early query
  can't land on top of a newer one and rewind the board.
- The **Sold Out / 86** tab subscribes to `menu_items` and `modifiers` too, so whoever runs
  out of oat milk can flip it on whatever screen is nearest.

## Flagging Problem Orders

Anything that goes wrong gets flagged from the board — wrong drink, a remake, a card that
wouldn't read — and the flag stays on the order permanently. The point is being able to pull
up every problem order after service instead of trying to remember them.

- **Flag it:** any order card → **⚠ Flag an issue**. Tap one of the quick reasons (wrong
  drink, remade/spilled, missing item, machine problem, payment problem, complaint, long
  wait), add free text if useful, save. Two taps at most — anything longer doesn't get used
  mid-rush, which makes the record worthless.
- **A flagged card outranks its column color** — red strip, red ring and a red banner with
  the note, so the one card with a problem is the one you spot first.
- **Find them later:** `/barista` → History → **⚠ Issues only** (includes orders still on
  the board, which is usually the one you want), or `/admin/orders` → **⚠ Issues only** pill,
  which also has a *Flagged issues* summary card and shows the note on each row.
- **Clear it** from the card banner, from History, or from the admin row when it's dealt
  with. On a flagged card the **Clear issue** button and the delete **×** sit side by side
  in the banner — the × is normally absolutely positioned in that exact corner, so on a
  flagged card it moves into the banner row rather than sitting on top of Clear.

`issue_flagged_at` is a timestamp rather than a boolean so a report can say *when* it
happened. The shared helpers live in `src/lib/order-issues.ts` — the quick reasons,
`hasIssue()`, `issueReasons()` (used by the dashboard tally), and the "run the migration"
error message every page shows.

### Problem-order stats — `/admin`

A **Problem orders** panel on the dashboard, under the same time-range and event filters as
everything else. It answers the three questions that change what you'd actually do:

- **What went wrong** — flagged orders grouped by reason. An order counts once per reason
  on it. Notes are built from the quick-reason chips, so they usually quote them verbatim;
  `issueReasons()` matches those and drops anything hand-typed into "Written in by hand"
  rather than losing it from the tally.
- **When it went wrong** — by hour flagged, so you can see the 10am rush in the data.
- **Drinks in flagged orders** — the same drink turning up repeatedly is worth a look.
- **Every flagged order** — name, time and note, newest first, with a link to Order History.

Plus four tiles: flagged orders, issue rate as a % of orders, drinks involved, clean orders.

Two things keep the numbers honest:

- **The issue query is separate from the main analytics query.** The columns come from a
  migration, so if a shop hasn't run it that one query fails and the panel says *run
  supabase-order-issues.sql* — the rest of the dashboard is untouched. It never shows a
  zero it can't stand behind.
- **It excludes cancelled orders, exactly like the rest of the page**, so "issue rate"
  divides two numbers counted the same way. A flag on a cancelled order is still visible at
  `/admin/orders`, which lists every status.

Red bars mean a problem, navy bars mean trade — `BarList` and `HourChart` take a `tone`
prop and nothing else changes between them.

## Ordering of Modifier Groups

The ▲/▼ buttons at `/admin/modifiers` are the single source of truth for the order
customers see when customizing a drink, and for the option order inside each group.
Moving a group renumbers the whole list `0,1,2,…` rather than swapping two values —
seeded rows all share `display_order = 0`, and swapping 0 with 0 is why the buttons
used to appear to do nothing.

`item_modifier_groups.display_order` still exists but is ignored: it was never set to
anything meaningful, and sorting by it was silently overriding the admin's chosen order.

## Events / Free Mode

Create an event at `/admin/events`. When you activate an event with "All Free" checked:
- Every item and modifier shows as $0 on the customer menu
- Checkout skips Stripe payment entirely
- Orders are marked `payment_status: 'free'`

Only one event can be active at a time.

---

## Sold Out ("86") — Barista Controlled

When you run out of something mid-service, the barista flips it themselves — no admin login needed.

**`/barista` → "Sold Out / 86" tab.** Tap any drink or add-in to toggle it. Tap again to restock.

- A sold-out **drink** greys out on the customer menu with a red **SOLD OUT** badge and can't be tapped.
- A sold-out **add-in** (oat milk, a syrup) shows struck-through and disabled inside the customization modal, so customers see *why* it's unavailable instead of wondering where it went.
- If **every** option in a *required* group is sold out, the drink can't be made — the modal blocks "Add to Order" and says so.

Updates reach every open phone instantly via Supabase Realtime on `menu_items` and `modifiers`. No refresh.

**Two different "off" switches — don't confuse them:**

| Flag | Set by | Meaning | Customer sees |
|------|--------|---------|---------------|
| `is_available` | Admin (`/admin/menu` → Hide) | Off the menu entirely | Nothing — item isn't listed |
| `is_sold_out` | Barista (`/barista` → 86 tab) | Ran out today | Greyed out, "Sold Out" |

---

## Ordering Hours

Customers can only place orders inside the windows set at **`/admin/settings`**.

- **Weekly schedule** — per weekday, toggle open and set an open/close time. Sunday 9:00–11:30am is the default.
- **Override** — four states:
  - **Follow Schedule** (default) — auto opens/closes on the hours above
  - **Force Open** — take orders now regardless of the schedule (started early)
  - **Force Closed** — stop taking orders now (ran out of milk, packing up)
  - **🔒 Lock Everything** — see below

### 🔒 Lock Everything

Force Closed still lets an approved group in with an access code. **Lock Everything is the
state with no way round it** — that is the entire point of it, and the only difference
between the two.

When locked:
- The "Have an access code?" box disappears from the closed notice — nobody is sent hunting
  for a code that can't work.
- An unlock **already granted** stops counting, so a phone that typed a code five minutes
  ago is closed out too, and the code is wiped from memory.
- Checkout re-checks the lock against the database immediately before charging, so an order
  can't slip through from a page that has been sitting open. Same for a write-in order.
- `/tablet` is unaffected. It's the barista's own device and never looked at ordering hours;
  a lock is about the public, not about stopping staff serving someone at the counter.

The rule lives in one place — `canOrderNow(status, hasUnlock)` in `src/lib/shop.ts`. Ask it
rather than re-writing the condition, or a lock will be honoured on one page and missed on
another.

When closed, the menu is still fully browsable but the cart button reads **"Ordering Is Closed"** and checkout is blocked. Checkout also **re-checks the schedule at submit time**, so an order can't slip through on a page that's been sitting open since before closing.

Times are compared against the **device's local clock** — fine for a walk-up stand where staff and customers are in the same timezone.

The big banner (service title, subtitle, open/closed state, "serving until 11:30 AM", weekly schedule) is `src/components/ShopBanner.tsx`, shown on both `/` and `/live`. Edit its text at `/admin/settings`.

---

## Donations (formerly Tips)

Every customer-facing "tip" is now a **donation**, and it can be switched off entirely.

- **`/admin/settings` → Donations** — toggle on/off, rename the label, set quick amounts (e.g. `1,2,5`).
- When **off**, the donation box disappears from both `/checkout` and `/tablet`. Any amount already entered is zeroed out.

**Database note:** the amount is still stored in `orders.tip_amount` — the column was left alone so existing orders and reports keep working. Only the UI language changed. Client-side, `CartState` calls it `donation_amount` and maps to `tip_amount` on insert.

---

## Giving to the Church (Pushpay)

Separate from the checkout donation above, and easy to confuse — **there are two "give"
boxes and they do different things.**

| | Coffee & Tea $3 gift | Pushpay giving box |
|---|---|---|
| Where | `/checkout` button → `/checkout/confirmation` | `/checkout/confirmation`, `/yourlive` |
| When | Chosen before ordering, paid after | After the order is placed |
| Amount | **$3 pre-filled**, editable | Whatever they pick |
| Fund | **Locked to Coffee & Tea** | Donor chooses |
| Money goes | Straight to the church, via Pushpay | Straight to the church, via Pushpay |
| Recorded | Nowhere — we never see it | Nowhere — we never see it |

### The $3 Coffee & Tea gift — two buttons, then Pushpay

`/checkout` ends in **two buttons**, and both charge the card the same amount (the drinks):

- **☕ Place Order & Give $3** — places the order, lands on the confirmation screen, and
  **redirects itself to Pushpay after a 5-second countdown** with the $3 filled in. *Go
  now* skips the wait; *Not now* cancels it and leaves the link as a button.
- **Place Order — No Donation** — places the order, normal confirmation screen

The ask is a choice *between the buttons* rather than a box further up the page, so nobody
reaches the bottom having missed it, and declining takes one tap.

**The $3 does not go through Stripe.** `orders.tip_amount` is always 0 on this path;
Stripe only ever sees the drinks. The gift goes to the church's Pushpay Coffee & Tea fund
and never touches our database.

#### Order first, then Pushpay — this ordering is the whole design

Pushpay can only take money on pushpay.com. All of this was tested against the real
merchant handle:

- The **embedded widget is not an embedded payment.** It's a pre-fill form whose "Next"
  sets `window.top.location.href` to `pushpay.com/g/<handle>`. It **breaks out of an
  iframe** to do it — a parent page hosting it in an `<iframe>` was itself navigated away.
- The **hosted page refuses to be framed**: `X-Frame-Options: SAMEORIGIN`.
- Its config object takes exactly three keys — `handle`, `wgc`, `onSubmitCallback`. Amount,
  fund and recurrence are **not** among them. `wgc` decodes to `{"askgp":true}` plus an
  HMAC, so it can't be extended.
- **`rbu`/`rbt` (Pushpay's "return to site" button) are off on this merchant** — the page
  comes back `ReturnButtonUrl: null`. Whoever goes to Pushpay is not coming back.

The countdown is deliberate rather than an instant redirect: it's a one-way trip (see
`ReturnButtonUrl: null` above), so "Order Placed!" and the wait time need a few seconds to
actually be read first. It uses `location.href`, not `window.open` — a redirect on a timer
has no user gesture behind it and mobile Safari blocks popups opened that way.

So the order is placed **first**, and the Pushpay link only appears once it's on the
barista board. Then wandering off costs nothing. This is exactly what went wrong when the
ask sat on `/checkout` itself: the cart is in memory only (`src/lib/cart-store.ts` — no
localStorage), so leaving that page threw the whole coffee order away.

`handleSubmit(e, give)` takes the choice as an argument; `give` only decides whether
`&give=1` is added to the confirmation URL. It always calls `cartStore.setDonation(0)`, and
it reads a **copy** of the store rather than the `useCart()` snapshot — that snapshot is a
render behind, and the function awaits Stripe and several inserts, so nothing should be
able to move the totals underneath a charge in flight.

**The two buttons are not gated on `donations_enabled`** — they are the ask, so hiding them
behind a setting would just make the feature disappear.

`COFFEE_GIVING_LINK` in `src/lib/giving.ts` is just `PUSHPAY_LINK` with **`a=3`** on the
end. That short link is already preconfigured on Pushpay's side and expands to
`fnd=<Coffee & Tea>&fndv=Lock&r=No&rcv=False` — fund locked, one-time, recurring selector
gone — so the only thing left to add is the amount. Deliberately no `al`, so $3 is a
starting point they can change.

Don't re-send `fnd`/`r`/`rcv` alongside it; the short link already sets them and duplicate
query keys are asking for trouble. **If the short link is ever regenerated in the Pushpay
portal, check it still carries the fund lock** — nothing in the code can tell that it
stopped, and gifts would quietly land in the default fund instead.

The church's other Pushpay merchant (the numeric "Events" handle) is **deliberately not
used here.** It marks **Booking ID** and **Event Name** as required custom fields, so
Pushpay won't take the $3 until a coffee customer supplies a booking reference. The short
link's merchant has no custom fields at all — the giving page is just the amount and the
payment method.

### /live vs /yourlive

Both routes render the same `src/components/LiveOrders.tsx`, which takes one prop —
`showGiving`. One component, not two pages, so the queue maths and the wait countdown can't
drift between the screen on the wall and the screen in someone's hand.

- **`/live`** — the lobby TV and the shared QR code. Read from across the room by people who
  aren't touching it, so an ask for money would be clutter.
- **`/yourlive`** — a customer's own phone, after ordering. Someone is holding this one, so
  the giving box belongs here.

The customer-facing links (the **Track Order** button on the menu, **Track Your Order Live**
on the confirmation screen) point at `/yourlive`. `/live` is what goes on the TV, in the QR
code, and in the print agent's startup file.

---

## Coupons On/Off

`/admin/settings` → **Coupons**. Untick it and the coupon box disappears from both `/checkout` and `/tablet` — useful when you aren't running any codes, since an empty coupon field just makes people feel they're missing a deal.

Turning it off doesn't delete anything. Codes at `/admin/coupons` stay exactly as they are and start working again the moment you re-enable the box. If a coupon was already applied to a cart when you flip it off, it's dropped from that cart.

---

## Inventory Tracking

- Link ingredients to menu items and modifiers at `/admin/inventory`
- Stock automatically deducts when orders are placed
- Low-stock alerts appear on the admin dashboard
- Manually log restocks with notes

---

## Tablet / Counter Ordering Notes

The `/tablet` page is designed for a tablet in landscape mode at the coffee stand. After the barista builds the order and the customer pays:

**Future Stripe Terminal integration:** To add a physical card reader (tap-to-pay), use **Stripe Terminal** — it works natively with the existing Stripe setup. The payment step in `/tablet/page.tsx` is isolated in `PaymentPanel` to make this swap straightforward. See: https://stripe.com/terminal

---

## Real-time (Supabase Subscriptions)

Both `/barista` and `/live` use Supabase Realtime:

```typescript
const channel = supabase
  .channel('channel-name')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
    fetchOrders(); // refetch on any change
  })
  .subscribe();
```

Realtime is enabled on the `orders` and `order_items` tables (configured in `supabase-schema.sql`)
and on `order_item_modifiers` (`supabase-order-issues.sql`).

`/barista` does more than this — several screens run it at once, so it also polls, coalesces
event bursts, and guards against stale responses. See **Multiple Barista Screens** above
before changing its subscription.

---

## Admin Order Management

- **Expand** any order row to see full item list with modifiers
- **Archive** (soft-delete) — hides from default view, recoverable via "Show Archived" toggle
- **Delete** — permanently removes from database (irreversible, requires confirmation)
- **Filter** by status pill (All / Pending / Making / Ready / Completed / Cancelled)
- **Search** by customer name
- **Date filter** to view a specific day's orders

---

## Deployment (Netlify)

The `npm run dev` and `npm run start` commands bind to `0.0.0.0` so they work on Netlify and local network access.

For Netlify:
1. Connect the GitHub repo in the Netlify dashboard
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Add all environment variables from `.env.local` in Netlify → Site Settings → Environment Variables
5. Register the Stripe webhook URL pointing to your Netlify domain

---

## Common Tasks

**Add a new menu item:**
1. Go to `/admin/menu`
2. Click `+ Menu Item`, fill in name, category, price, description
3. Click **`Options`** on the new item to choose which modifier groups it offers, and to hide or lock individual options on it

**Set the service time / ordering window:**
1. Go to `/admin/settings`
2. Set the **Service Banner** title and subtitle (the big header customers see)
3. Under **Ordering Hours**, tick each day you serve and set open/close times
4. Use **Force Closed** if you run out and need to stop orders immediately

**Mark something sold out mid-service:**
1. On the tablet, open `/barista` → **Sold Out / 86** tab
2. Tap the drink or add-in you ran out of — customers see it as Sold Out instantly
3. Tap again to restock

**Find one order on a busy board:**
1. `/barista` → Orders tab → type into the search box
2. Search a name, a drink or a note — "oat" finds every oat milk order on the board
3. Clear it when you're done; wait times were never affected by the filter

**Print a cup label (this is how every label gets printed now):**
1. `/barista` → the order's card → the cup list → **🖨 Print** next to the drink you're
   about to make. Printed cups show ✓; the heading counts how many are left.
2. Already picked up? Same list under History → expand the order → **Reprint a cup label**

**Track an order that went wrong:**
1. On the order's card, tap **⚠ Flag an issue**
2. Tap a reason (wrong drink, remade, machine problem…), add a note if it helps, save
3. Review them all afterwards at `/barista` → History → **⚠ Issues only**, or
   `/admin/orders` → **⚠ Issues only**

**"Could not find the 'X' column of 'shop_settings' in the schema cache":**
1. That column comes from a migration this database hasn't run. `/admin/settings` names it
   and the file that adds it — usually `supabase-v2-features.sql` (safe to re-run).
2. Already run it? PostgREST is caching an old schema: Supabase → **Settings → API →
   Reload schema**, or `NOTIFY pgrst, 'reload schema';` in the SQL editor.
3. The save is **column-by-column resilient** (`saveShopSettings()`): it drops whichever
   column the database rejects and saves the rest, so Force Closed still works while a
   migration is outstanding. An all-or-nothing write is how "stop ordering now" dies on a
   coupon toggle nobody touched.

**Stop all ordering immediately, including access codes:**
1. Go to `/admin/settings` → **Ordering Availability**
2. Choose **🔒 Lock Everything** and save
3. Put it back on **Follow Schedule** when you're ready to reopen

**See how long orders are taking:**
1. Go to `/admin` and pick a time range (and an event, if you're comparing)
2. Read the **How long orders took** panel — average, typical, fastest, slowest, and
   every order with its own time
3. Only orders where the barista tapped **Start Making** and then **Mark Ready** are timed

**Change how many orders one person can place:**
1. Go to `/admin/settings` → **Stopping spam orders**
2. Set the number of orders and the window, or untick it entirely
3. Counter orders on `/tablet` are never limited

**Make an add-in stand out on the label:**
1. Go to `/admin/labels` → **Modifier categories** → find the category
2. Under **Stand out**, pick Bold or Black box (Milk is already Bold)
3. Check the preview on the right, then 🖨 **Send test label** to see it on the roll

**Turn off donation requests:**
1. Go to `/admin/settings` → **Donations**
2. Untick "Ask customers for a donation" — the box disappears from checkout and the tablet

**Run a free event (e.g., Sunday service):**
1. Go to `/admin/events`
2. Create or activate an event with "All Free" checked

**Share the live order board with customers:**
- Put `https://<your-domain>/live` on the screen at the coffee stand — no giving box on it
- For a QR code or a link people open on their phones, use `https://<your-domain>/yourlive`
  instead: same board, with the giving box under the queue

**Process a counter order:**
1. Open `/tablet` on the iPad/tablet at the counter
2. Browse menu and tap items to add them
3. Enter the customer's name
4. Tap "Charge Customer →"
5. Hand the tablet to the customer to enter card details
6. Tap "Pay $X.XX" — done, order appears instantly in `/barista`
