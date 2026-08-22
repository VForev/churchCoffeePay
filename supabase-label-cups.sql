-- Per-cup label printing, and the fix for "only the first cup printed".
--
-- Two columns, both optional: the app and the print agent work without them (they
-- fall back to the old behaviour), so running this is an upgrade, not a requirement.
--
-- 1. orders.item_count
--    The number of drinks lines the order HAS, stamped by the app once every
--    order_item row is safely inserted.
--
--    This is the fix for multi-drink orders printing only one cup. The app inserts
--    the order row first and its items one at a time afterwards, so the print
--    agent's realtime event routinely arrives when the order has one drink on it —
--    and it printed that one drink, marked the order printed, and the rest never
--    came out. With this column the agent knows how many drinks to wait for.
--
-- 2. orders.label_print_cups
--    Which cups a print request is for: NULL (or empty) = the whole order, which is
--    what the "Print all cups" button sends. The per-cup 🖨 buttons on /barista send
--    a single cup number, e.g. '{2}', for a remake or a peeled-off label. The agent
--    clears it back to NULL once it has printed.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_count INT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_print_cups INT[];
