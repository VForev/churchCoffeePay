-- Labels are printed by the barista, one cup at a time.
--
-- Printing used to fire automatically the moment an order landed, and the barista's
-- only button was "print all cups". That prints labels for drinks nobody has started
-- and, on a remake, five stickers to replace one. Now nothing prints on its own: the
-- barista taps Print next to the cup they're about to make.
--
-- Nothing about ordering depends on this — it only changes when ink hits the roll.
-- The switch still exists at /admin/labels for anyone who wants the old behaviour
-- back; this just changes which way it points out of the box.

ALTER TABLE label_settings ALTER COLUMN auto_print SET DEFAULT FALSE;
UPDATE label_settings SET auto_print = FALSE WHERE id = 1;

-- ============================================
-- WHICH CUPS HAVE ACTUALLY COME OFF THE ROLL
-- ============================================
-- With nothing printing automatically, the barista's live question on a five-drink
-- order is "have I already done cup 3?". label_printed_at can't answer it — it's one
-- stamp for the whole order, and a single-cup print sets it just the same as a
-- five-cup one. So the agent accumulates the cup numbers it has actually printed here.
--
-- Cup numbers are the ones from orderCups() in src/lib/cups.ts — the same numbering
-- the label itself prints, so "CUP 3 OF 5" on the sticker and the board's cup 3 are
-- always the same drink.
--
-- Never cleared by a reprint: a cup that printed twice has still printed. It is only
-- reset if the order's drinks change, which the app doesn't allow.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_printed_cups INT[];
