-- ─────────────────────────────────────────────────────────────────────────────
-- Coffee & Tea $3 gift — which of the two Place Order buttons the customer tapped.
--
--   TRUE   "Place Order & Give $3"      — they said they would give
--   FALSE  "Place Order — No Donation"  — they declined
--   NULL   never asked: counter orders on /tablet, write-in orders, and every
--          order placed before this migration ran
--
-- This records the CHOICE, not the money. The $3 goes to Pushpay, which never tells
-- us whether it actually arrived — so nothing derived from this column may ever be
-- reported as a donation received. /admin says exactly what it is: "said they'd give".
--
-- Until this runs, checkout drops the column from the insert and carries on (an order
-- must never fail over a metric), and the dashboard panel says to run this file.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS giving_intent BOOLEAN DEFAULT NULL;

-- The dashboard filters on it inside a date window; the index keeps that cheap once
-- there are a few thousand Sundays' worth of orders.
CREATE INDEX IF NOT EXISTS idx_orders_giving_intent ON orders(giving_intent);
