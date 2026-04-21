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

### Seed data
`supabase-seed.sql` — Loads sample categories, modifier groups, modifiers, and menu items to get started.

---

## All Pages / Routes

### Customer-facing

| Route | Description |
|-------|-------------|
| `/` | Main menu page — customers browse categories and items, add to cart |
| `/checkout` | Checkout — customer name, coupon, tip, Stripe card payment |
| `/checkout/confirmation` | Order confirmation screen after successful payment |

### Staff

| Route | Description | Who uses it |
|-------|-------------|-------------|
| `/tablet` | Counter POS — two-panel layout: menu left, cart right. Barista builds order, customer pays on same device | Barista at counter |
| `/barista` | Barista dashboard — real-time kanban (Pending → Making → Ready) with estimated times | Barista making drinks |
| `/live` | Public live orders screen — shows queue position, status, and wait time for all active orders | Everyone (share the URL / QR code) |

### Admin (requires login)

| Route | Description |
|-------|-------------|
| `/admin/login` | Admin login (Supabase email/password) |
| `/admin` | Dashboard — today's stats, low stock alerts, popular items |
| `/admin/menu` | Create/edit/delete categories and menu items; reorder with ▲/▼ |
| `/admin/modifiers` | Manage modifier groups (Size, Milk, Syrups, etc.) and individual options; reorder with ▲/▼ |
| `/admin/events` | Event pricing profiles — activate "Everything Free" mode or custom pricing |
| `/admin/coupons` | Coupon codes — percentage, fixed amount, or free order discounts |
| `/admin/inventory` | Track stock levels, set low-stock thresholds, log restocks |
| `/admin/orders` | Full order history — expand rows, filter by status, search by name, archive or delete |

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

---

## Events / Free Mode

Create an event at `/admin/events`. When you activate an event with "All Free" checked:
- Every item and modifier shows as $0 on the customer menu
- Checkout skips Stripe payment entirely
- Orders are marked `payment_status: 'free'`

Only one event can be active at a time.

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

Realtime is enabled on the `orders` and `order_items` tables (configured in `supabase-schema.sql`).

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
3. Go to `/admin/modifiers` to link modifier groups to the item (done automatically via `item_modifier_groups` table — currently managed via Supabase table editor directly)

**Run a free event (e.g., Sunday service):**
1. Go to `/admin/events`
2. Create or activate an event with "All Free" checked

**Share the live order board with customers:**
- Share the URL `https://<your-domain>/live` or display it on a screen at the coffee stand
- Customers can open it on their phones to track their order

**Process a counter order:**
1. Open `/tablet` on the iPad/tablet at the counter
2. Browse menu and tap items to add them
3. Enter the customer's name
4. Tap "Charge Customer →"
5. Hand the tablet to the customer to enter card details
6. Tap "Pay $X.XX" — done, order appears instantly in `/barista`
