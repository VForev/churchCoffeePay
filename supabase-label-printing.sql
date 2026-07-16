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

-- Set to now() by the 🖨 button on /barista — an explicit "print this order now" request.
-- The agent prints when this is set and label_printed_at is still NULL. It's separate from
-- label_printed_at so that ordinary status changes (which also leave label_printed_at NULL)
-- don't look like a print request when auto-print is turned off (label_settings.auto_print).
-- In auto-print mode the agent prints on order INSERT; this column drives every manual
-- print and every reprint.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_print_requested_at TIMESTAMPTZ DEFAULT NULL;
