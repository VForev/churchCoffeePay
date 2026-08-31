-- How long each order took to make.
--
-- The board already knows an order's status, but not WHEN it changed — so nothing
-- could ever answer "how long did that latte take?". These three stamps are written
-- by /barista as the barista moves a card, and read by the "How long orders took"
-- panel on /admin.
--
-- All three are nullable and stay NULL on orders taken before this ran, so the panel
-- reports on what it actually has rather than inventing zeroes. Existing orders are
-- not back-filled: there is no honest value to back-fill them with.
--
--   started_at    the barista tapped "Start Making"   (pending    -> in_progress)
--   ready_at      the barista tapped "Mark Ready"     (in_progress -> ready)
--   completed_at  the customer picked it up           (ready      -> completed)
--
-- MAKE TIME is ready_at - started_at: hands actually on the drink.
-- WAIT TIME is ready_at - created_at: what the customer experienced, queue included.
-- Both are computed in src/lib/order-timing.ts — never re-derive them anywhere else.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- The analytics panel filters by created_at and then reads these, so the existing
-- created_at index does the work. This one is only for "orders that were timed".
CREATE INDEX IF NOT EXISTS idx_orders_ready_at ON orders(ready_at) WHERE ready_at IS NOT NULL;
