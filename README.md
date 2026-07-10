# LOTG Coffee — Point of Sale & Mobile Ordering

A full-stack coffee shop system built for **Light of the Gospel Church**. Customers order from their phones or at the counter, baristas work orders off a real-time dashboard, and admins run the menu, pricing, coupons, and inventory from a single panel.

Everything lives in one Next.js app talking to one Supabase database, with Stripe handling card payments.

---

## Table of Contents

- [How the system works](#how-the-system-works)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [The pages](#the-pages)
  - [Customer pages](#customer-pages)
  - [Staff pages](#staff-pages)
  - [Admin pages](#admin-pages)
- [How ordering works, end to end](#how-ordering-works-end-to-end)
- [Core concepts](#core-concepts)
  - [The cart](#the-cart)
  - [Modifiers](#modifiers)
  - [Order status flow](#order-status-flow)
  - [Wait time estimates](#wait-time-estimates)
  - [Events and free mode](#events-and-free-mode)
  - [Coupons](#coupons)
  - [Inventory](#inventory)
  - [Real-time updates](#real-time-updates)
- [Data model](#data-model)
- [API routes](#api-routes)
- [Project layout](#project-layout)
- [Design system](#design-system)
- [Deployment](#deployment)
- [Common tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

---

## How the system works

There are three groups of people using this app, and each has its own set of pages.

**Customers** either scan a QR code and order on their phone (`/`), or order at the counter while a barista taps it in on a tablet (`/tablet`). Either way they pay by card through Stripe, and either way the order lands in the same `orders` table.

**Baristas** watch `/barista`, a three-column board that updates the instant a new order comes in. They move each order left to right as they make it: Pending → Making → Ready → Completed.

**Everyone** can watch `/live`, a public screen showing every active order, its position in the queue, and roughly how many minutes until it's done. Put it on a TV at the coffee stand or share the URL so people can watch from their seats.

**Admins** log in at `/admin` to change anything: menu items, prices, modifier options, discount codes, free-drink events, and stock levels.

The database is the single source of truth. Every page reads from Supabase, and the barista and live pages subscribe to Supabase Realtime so a status change on one device shows up on every other device within a second, with no refresh.

---

## Tech stack

| Layer | What we use |
|-------|-------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth — email/password, admin only |
| Payments | Stripe (Payment Intents + Stripe.js card element) |
| Real-time | Supabase Realtime (Postgres change subscriptions over WebSocket) |
| Hosting | Netlify |

Customer and barista pages have no login at all. They're meant to be opened from a QR code or left running on a tablet. Only `/admin/*` requires a Supabase Auth session.

---

## Getting started

```bash
npm install
npm run dev
```

The dev server binds to `0.0.0.0`, so it's reachable both at `http://localhost:3000` and at `http://<your-machine-ip>:3000`. That second address is the important one — it's how you test the customer flow on a real phone and the POS flow on a real tablet while developing.

```bash
npm run build    # production build
npm run start    # serve the production build
npm run serve    # build, then start
npm run lint     # eslint
```

---

## Environment variables

Create `.env.local` in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # safe to expose, RLS-protected
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # SERVER ONLY — never expose

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Session / access control
ACCESS_SECRET=<random hex>
SESSION_SIGNING_KEY=<random hex>
```

Anything prefixed `NEXT_PUBLIC_` is bundled into the browser build. The service role key and Stripe secret key are read only inside API routes (`src/app/api/`) and must never appear in a client component.

Generate the random secrets with:

```bash
openssl rand -hex 32
```

---

## Database setup

All SQL lives in the project root. Run each file in the **Supabase SQL Editor** (Dashboard → SQL Editor → New Query).

**1. Base schema — run first:**

```
supabase-schema.sql
```

This creates every table and index, enables row-level security, and adds permissive `Allow all access` policies on every table.

> **Security note.** Those policies allow anyone holding the public anon key — which ships in the browser bundle — to read and write every table, including `coupons` and `orders`. That's fine for a church coffee stand on a trusted network, and it's what makes the no-login barista and customer pages work. It is not appropriate if this app is ever exposed to the open internet with real money at stake. Tightening those policies is the first thing to do before that happens.

**Enable Realtime.** The schema does *not* add the tables to the Realtime publication. Do it once in the SQL editor:

```sql
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
```

Without this, `/barista` and `/live` load once and then never update.

**2. Migrations — run after the base schema:**

| File | What it adds |
|------|--------------|
| `supabase-add-customer-phone.sql` | `customer_phone` column on `orders` |
| `supabase-archive-orders.sql` | `archived_at` on `orders` (soft delete) and `display_order` on `modifiers` (reordering) |
| `supabase-access-sessions.sql` | `access_sessions` table used by the Stripe webhook |

The archive migration is required — the customer, live, and admin order pages all filter on `archived_at`, so queries will error without it.

**3. Sample data — optional:**

```
supabase-seed.sql
```

Loads a starter menu: categories, modifier groups, modifiers, and menu items. Useful for getting a working screen in under a minute.

**4. Create your first admin:**

Supabase Dashboard → Authentication → Users → Add User. Enter an email and password, then sign in at `/admin/login`. There's no self-serve signup by design.

---

## The pages

### Customer pages

#### `/` — the menu

The page customers land on after scanning the QR code. On mount it fetches, in parallel:

- active categories, ordered by `display_order`
- available menu items, ordered by `display_order`
- the currently active event (if any)
- the current queue depth, used to show an estimated wait at the top

Tapping an item opens the **modifier selector** — a modal where the customer picks size, milk, syrups, and adds special instructions. Confirming adds a line to the cart. The cart lives in memory on the client; nothing is written to the database until payment succeeds.

If an active event has `is_all_free` set, every price on this page renders as **Free** and the modifier selector charges nothing for add-ons.

#### `/checkout` — payment

Customers enter their name, optionally apply a coupon code, choose a tip, and pay with a card via Stripe's `CardElement`.

The coupon field validates against the `coupons` table in real time: the code must exist, be active, be unexpired, and be under its usage cap. If it passes, the discount is applied to the cart immediately so the customer sees the new total before paying.

When the total is `$0` — because of a free event, or a coupon that zeroes the order — the Stripe step is skipped entirely and the order is written with `payment_status: 'free'`.

#### `/checkout/confirmation` — thank you

A simple success screen. Reads the customer's name and estimated wait from the query string, and offers two buttons: track the order on `/live`, or start another order.

---

### Staff pages

#### `/tablet` — counter POS

Designed for an iPad in landscape at the coffee stand. Two panels: menu on the left, running cart on the right.

The barista taps items while talking to the customer, types the customer's name, and hits **Charge Customer**. The right panel flips to a payment view, the tablet is handed across the counter, and the customer taps in their card and pays. Order created, cart cleared, ready for the next person.

Orders placed here are tagged `order_source: 'counter'` (vs. `'mobile'` from `/`), so you can tell later how people are actually ordering.

The payment step is isolated in a `PaymentPanel` component. If you ever want a physical tap-to-pay reader, [Stripe Terminal](https://stripe.com/terminal) drops in there without touching the rest of the flow.

#### `/barista` — the order board

Three columns — **Pending**, **Making**, **Ready** — with one card per order. Each card shows the customer name, every item, every modifier, and any special instructions.

Each card has one button that advances it:

```
[Start] → in_progress    [Mark Ready] → ready    [Complete] → completed
```

Completed orders drop off the board. The page holds a Supabase Realtime subscription on the `orders` table and refetches on any change, so an order placed on a phone across the room appears here within a second.

#### `/live` — public order screen

Shows every order that is pending, in progress, or ready, sorted oldest first. Each row gets a live countdown: how many minutes until this order should be done, recalculated every tick against the current time.

Orders that flip to **Ready!** are briefly highlighted so someone glancing up at the TV catches it. Like `/barista`, this page is driven by a Realtime subscription.

Share the URL directly or point a QR code at it.

---

### Admin pages

Everything under `/admin` sits behind a Supabase Auth check in `src/app/admin/layout.tsx`. No session means an immediate redirect to `/admin/login`.

| Route | What it does |
|-------|--------------|
| `/admin/login` | Email + password sign-in |
| `/admin` | Dashboard: today's revenue and order count, low-stock alerts, most popular items |
| `/admin/menu` | Create, edit, delete, and reorder categories and menu items |
| `/admin/modifiers` | Manage modifier groups (Size, Milk, Syrups…) and the options inside them |
| `/admin/events` | Pricing profiles — activate "everything free" mode or per-item overrides |
| `/admin/coupons` | Create discount codes: percentage off, fixed amount off, or whole order free |
| `/admin/inventory` | Stock levels, low-stock thresholds, restock logging |
| `/admin/orders` | Full order history — expand rows, filter, search, archive, or hard delete |

The admin sidebar also carries quick links that open `/barista`, `/live`, and `/tablet` in new tabs, so you can jump between managing and running the stand.

---

## How ordering works, end to end

Take a mobile order that costs $8.50 with a $1.50 tip.

1. **Browse.** The customer opens `/`, taps a latte, picks Large + Oat Milk + Vanilla in the modifier modal, and confirms. `cartStore.addItem()` computes the line total as base price plus modifier adjustments and notifies every subscribed component.

2. **Checkout.** They go to `/checkout`, type their name, pick a 15% tip. The cart recalculates: `total = (subtotal - discount) + tip`.

3. **Payment intent.** The browser POSTs the amount in cents to `/api/checkout`. That route runs on the server, creates a Stripe Payment Intent with the secret key, and returns only the `client_secret`.

4. **Card confirmation.** Stripe.js calls `confirmCardPayment()` with the card details. The card number never touches our server — it goes from the browser straight to Stripe.

5. **Order written.** On success the client inserts the `orders` row (`payment_status: 'paid'`, `stripe_payment_id` set), then one `order_items` row per line, then the `order_item_modifiers` rows for each line's selections.

6. **Side effects.** If a coupon was used, its `times_used` is incremented. Then, for every item and every modifier, the app looks up linked ingredients in `item_ingredients`, subtracts the used quantity from `inventory_items.current_stock`, and writes an `inventory_log` row with `reason: 'order'`.

7. **Broadcast.** Postgres fires the change, Supabase Realtime pushes it, and `/barista` and `/live` both refetch. The barista sees the new ticket before the customer has put their phone away.

8. **Confirmation.** The customer is redirected to `/checkout/confirmation` with their name and estimated wait.

The counter flow at `/tablet` is identical from step 3 onward — the only difference is that `order_source` is `'counter'` instead of `'mobile'`.

A Stripe webhook at `/api/webhooks/stripe` listens for `payment_intent.succeeded` and `payment_intent.payment_failed`. It verifies the signature against `STRIPE_WEBHOOK_SECRET` and, when a payment intent carries an `access_session_id`, marks that access session consumed.

---

## Core concepts

### The cart

`src/lib/cart-store.ts` is a small hand-rolled store — no Redux, no Zustand. A module-level `state` object, a `Set` of listener callbacks, and a `notify()` that calls them all. Components subscribe through the `useCart()` hook in `src/lib/hooks.ts`, which wraps React's `useSyncExternalStore`.

Every mutation (`addItem`, `removeItem`, `updateQuantity`, `setTip`, `applyCoupon`) runs `recalculate()` before notifying, so subtotal, discount, and total are always consistent when a component reads them.

The cart is **client-side only and not persisted**. Refreshing the page empties it. That's deliberate: a stale cart on a shared tablet is worse than no cart.

### Modifiers

A **modifier group** is a question ("What size?"). A **modifier** is an answer ("Large, +$0.75"). Groups are linked to items through the `item_modifier_groups` join table, so one Syrups group can serve every drink on the menu.

Groups have two flags:

- `is_required` — the customer must choose at least one option before adding the item
- `allow_multiple` — the customer can select several (syrups, extra shots)

The selector UI adapts to size. Under 8 options it renders a button grid. At 8 or more — a 30-syrup list, say — it automatically switches to a searchable, scrollable list with removable chips for what's been picked. You don't configure this; it's based on the option count.

### Order status flow

```
pending ──► in_progress ──► ready ──► completed
   │             │            │
   └─────────────┴────────────┴──────► cancelled
```

`/barista` drives the happy path. `/admin/orders` can set any status, including `cancelled`.

Payment status is tracked separately as `unpaid`, `paid`, or `free`. An order can be `ready` and `free`, or `completed` and `paid` — the two axes are independent.

### Wait time estimates

One minute per item, across the whole queue.

```
estimatedMinutes = (items in every pending/in_progress order placed before yours)
                 + (items in your order)
```

Three orders ahead of you with 2, 1, and 3 items, and your order has 2 items → 8 minutes.

`/live` takes it one step further and shows a live countdown: it computes `createdAt + estimatedMinutes`, subtracts the current clock, and clamps at zero. So a number that says "4 min" actually ticks down to "3 min" while you watch.

The same number is shown on `/`, `/checkout`, and the confirmation page so the customer's expectation is set before they pay.

### Events and free mode

An **event** is a pricing profile. Create one at `/admin/events`, tick **All Free**, activate it, and:

- every item and modifier renders as `Free` on the customer menu and tablet
- checkout skips Stripe entirely
- orders are stored with `payment_status: 'free'` and a `total` of `0`

Only one event can be active at a time. Events can also carry per-item and per-modifier price overrides (`event_item_prices`, `event_modifier_prices`) if you want a Sunday discount rather than a giveaway.

Deactivating the event immediately restores normal pricing everywhere — no rebuild, no redeploy.

### Coupons

Three discount types:

| Type | Behavior |
|------|----------|
| `percentage` | `discount = subtotal × (value / 100)` |
| `fixed_amount` | `discount = min(value, subtotal)` — never goes negative |
| `free_item` | `discount = subtotal` — the entire order is free |

Coupons can carry an expiry date and a max-uses cap. The checkout page checks both before applying, and `times_used` is incremented after a successful order.

Note that tips are added *after* the discount, so a "free order" coupon still lets someone tip.

### Inventory

Link ingredients to menu items and modifiers at `/admin/inventory`. When an order is placed, the app walks every item and every selected modifier, finds the linked ingredients, and deducts `quantity_used × quantity` from stock.

Every deduction writes an `inventory_log` row. Restocks and manual corrections write log rows too, with `reason` set to `restock`, `adjustment`, or `waste`. Items below their `low_stock_threshold` surface as alerts on the admin dashboard.

Inventory is tracked, not enforced — running out of oat milk does not stop someone from ordering an oat milk latte. It just shows up red on the dashboard.

### Real-time updates

Both `/barista` and `/live` open a Supabase Realtime channel and refetch on any change to the `orders` table:

```typescript
const channel = supabase
  .channel('barista-orders')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
    fetchOrders();
  })
  .subscribe();

return () => { supabase.removeChannel(channel); };
```

Refetching the whole list on every change is not the most efficient thing possible, but at church-coffee-stand volume it's a handful of rows and it's impossible to get out of sync.

This only works if `orders` and `order_items` are in the `supabase_realtime` publication. See [Database setup](#database-setup) — it's a manual step.

---

## Data model

```
categories ──< menu_items ──< item_modifier_groups >── modifier_groups ──< modifiers
                   │                                                          │
                   │                                                          │
orders ──< order_items ──< order_item_modifiers ──────────────────────────────┘
  │
  ├── coupons          (which code was used)
  └── events           (which pricing profile was active)

inventory_items ──< item_ingredients >── menu_items / modifiers
       │
       └──< inventory_log ──> orders
```

Key tables:

- **`orders`** — customer name, status, `subtotal` / `discount_amount` / `tip_amount` / `total`, payment status, Stripe payment id, source (`counter` or `mobile`), `archived_at` for soft delete
- **`order_items`** — one row per line in the cart, with `quantity`, the `item_price` actually charged, and special instructions
- **`order_item_modifiers`** — one row per selected option, storing the `price_adjustment` at the time of sale

Prices are stored as `decimal(10,2)` **dollars**, not cents. The one place cents appear is the Stripe call, which multiplies by 100 right before creating the Payment Intent.

Order items and their modifiers snapshot the price they were sold at. Raising the price of a latte tomorrow doesn't rewrite yesterday's receipts.

---

## API routes

Only two things run on the server. Everything else talks to Supabase directly from the browser.

#### `POST /api/checkout`

Takes `{ amount }` in cents, rejects anything under `50` (Stripe's minimum charge), creates a Payment Intent with `automatic_payment_methods` enabled, and returns `{ clientSecret }`. The Stripe secret key never leaves this file.

#### `POST /api/webhooks/stripe`

Verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`, then handles `payment_intent.succeeded` by marking the associated access session consumed. Uses the service-role Supabase client from `src/lib/access.ts` so it can write regardless of RLS. Register it in the Stripe dashboard at:

```
https://<your-domain>/api/webhooks/stripe
```

---

## Project layout

```
src/
├── app/
│   ├── (customer)/
│   │   ├── page.tsx                   # menu — browse, customize, add to cart
│   │   └── checkout/
│   │       ├── page.tsx               # name, coupon, tip, Stripe card payment
│   │       └── confirmation/page.tsx  # success screen
│   ├── tablet/page.tsx                # counter POS, two-panel layout
│   ├── barista/page.tsx               # real-time order board
│   ├── live/page.tsx                  # public queue display
│   ├── admin/
│   │   ├── layout.tsx                 # auth gate + sidebar nav
│   │   ├── login/page.tsx
│   │   ├── page.tsx                   # dashboard
│   │   ├── menu/page.tsx
│   │   ├── modifiers/page.tsx
│   │   ├── events/page.tsx
│   │   ├── coupons/page.tsx
│   │   ├── inventory/page.tsx
│   │   └── orders/page.tsx
│   ├── api/
│   │   ├── checkout/route.ts          # creates Stripe Payment Intent
│   │   └── webhooks/stripe/route.ts   # verifies + handles Stripe events
│   ├── layout.tsx
│   └── globals.css                    # Tailwind v4 theme, CSS custom properties
├── components/
│   ├── menu/
│   │   ├── MenuCard.tsx               # one item tile
│   │   ├── CategoryTabs.tsx
│   │   └── ModifierSelector.tsx       # customization modal
│   ├── cart/CartDrawer.tsx            # slide-out cart
│   └── ui/                            # Button, Card, Modal, Input, Badge
├── lib/
│   ├── supabase.ts                    # browser client (anon key)
│   ├── access.ts                      # server client (service role key)
│   ├── stripe.ts                      # Stripe.js loader
│   ├── cart-store.ts                  # cart state, observer pattern
│   ├── hooks.ts                       # useCart()
│   └── utils.ts                       # formatPrice, toCents, generateId, cn
└── types/index.ts                     # every shared TypeScript interface
```

---

## Design system

Pulled from [lotgchurch.com](https://www.lotgchurch.com/) so the ordering page feels like part of the church's site. Defined as CSS custom properties in `src/app/globals.css` and exposed to Tailwind v4.

| Token | Hex | Used for |
|-------|-----|----------|
| `--color-primary` | `#4054B2` | Navy — buttons, links, active states |
| `--color-primary-light` | `#5A6FCC` | Button hover |
| `--color-secondary` | `#6EC1E4` | Light blue accents |
| `--color-success` | `#23A455` | Ready orders, confirmations |
| `--color-success-light` | `#61CE70` | Success hover |
| `--color-warm` | `#6B5D4B` | Brown — special instructions |
| `--color-warning` | `#F59E0B` | Amber — pending orders |
| `--color-danger` | `#DC2626` | Errors, destructive actions |
| `--color-bg` | `#F0F4F7` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, modals |
| `--color-text` | `#54595F` | Body text |

Fonts: **Kumbh Sans** for headings (`font-heading`), **Nunito** for body copy (`font-body`), **Roboto** for numbers and UI chrome (`font-accent`).

---

## Deployment

Hosted on Netlify. `netlify.toml` is already configured:

```toml
[build]
  command = "next build"
  publish = ".next"
```

To deploy:

1. Connect the GitHub repo in the Netlify dashboard.
2. Add every variable from `.env.local` under **Site Settings → Environment Variables**. Netlify's secret scanner is already told to ignore the three `NEXT_PUBLIC_*` keys, since those are meant to ship to the browser.
3. Deploy, then register the Stripe webhook against your live domain: `https://<your-domain>/api/webhooks/stripe`, listening for `payment_intent.succeeded` and `payment_intent.payment_failed`.
4. Swap the Stripe keys from `pk_test_` / `sk_test_` to `pk_live_` / `sk_live_` when you're ready to take real money. Get a fresh `STRIPE_WEBHOOK_SECRET` for the live webhook — the test one won't validate.

---

## Common tasks

**Add a menu item.** `/admin/menu` → **+ Menu Item** → name, category, price, description. To attach modifier groups, link them in the `item_modifier_groups` table (currently managed through the Supabase table editor).

**Add 30 syrups.** `/admin/modifiers` → find the Syrups group → **+ Option** for each. Once the group hits 8 options the customer UI switches to a searchable list on its own.

**Run a free Sunday.** `/admin/events` → create or activate an event with **All Free** checked. Deactivate it when service ends.

**Take a counter order.** Open `/tablet` on the iPad → tap items → type the customer's name → **Charge Customer** → hand the tablet over → customer pays → the ticket appears on `/barista` instantly.

**Put the queue on a TV.** Open `/live` full-screen in a browser. It never needs a refresh.

**Look up an old order.** `/admin/orders` → filter by status, search by customer name, or pick a date. Expand any row for the full item list with modifiers. **Archive** hides an order (recoverable via *Show Archived*); **Delete** removes it permanently.

**Test a payment.** Card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.

---

## Troubleshooting

**Orders don't appear on `/barista` or `/live`.** Realtime isn't enabled on the table. Supabase Dashboard → Database → Replication → make sure `orders` and `order_items` are in the `supabase_realtime` publication.

**Queries fail with "column archived_at does not exist".** You skipped `supabase-archive-orders.sql`. Run it.

**Payment fails with "Invalid amount".** `/api/checkout` rejects anything under 50 cents — that's Stripe's floor. A near-zero order should be taking the free path instead; check whether the total is genuinely `0`.

**Webhook returns 400.** The signature isn't validating. The `STRIPE_WEBHOOK_SECRET` in your environment has to match the specific endpoint in the Stripe dashboard, and test-mode and live-mode endpoints have different secrets.

**Admin pages bounce to login in a loop.** No user exists yet. Create one in Supabase Dashboard → Authentication → Users → Add User.

**The cart empties on refresh.** That's intentional — cart state is in memory only, never persisted.

**Stripe.js won't load.** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is missing or wrong. Note that `src/lib/supabase.ts` quietly falls back to placeholder values when Supabase env vars are absent, so a misconfigured environment shows up as failing queries rather than a crash on boot.

---

Built for Light of the Gospel Church. ☕
