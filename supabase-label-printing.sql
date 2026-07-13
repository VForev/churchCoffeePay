-- Cup label printing.
--
-- The print agent (print-agent/) watches this column:
--   NULL      -> not printed yet, print it
--   timestamp -> already printed, leave it alone
--
-- That makes "Reprint label" on the barista board a one-liner: set it back to
-- NULL and the agent prints it again. It also means the agent can crash, be
-- restarted, or be turned on halfway through service and still catch up on
-- everything it missed instead of double-printing what it didn't.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_label_printed_at
  ON orders(label_printed_at)
  WHERE label_printed_at IS NULL;
