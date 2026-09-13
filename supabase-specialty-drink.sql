-- ─────────────────────────────────────────────────────────────────────────────
-- Drink of the day — the seasonal special at the top of the customer menu.
--
-- One row, id = 1, same shape as shop_settings / label_settings / theme_settings.
-- Set at /admin/specialty, shown on the customer menu, and on the realtime
-- publication so turning it on or off reaches every open phone immediately.
--
-- A special is NOT a menu item. It is an existing drink plus a build:
--
--   menu_item_id   the drink it is made on (a Latte)
--   modifier_ids   the add-ins that make it the special (maple, cinnamon)
--
-- That is what lets a customer still change the milk, what lets the bar make it out
-- of things it already stocks, and — the important one — what lets the card take
-- itself down when the barista 86s the syrup. A seasonal drink only exists while its
-- syrup is on the shelf, so the two are tied together rather than tracked apart.
--
-- Until this file runs there is simply no special: fetchSpecialty() returns "off"
-- on any error, the menu looks exactly as it does today, and /admin/specialty says
-- to run this.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS specialty_drink (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- The little chip above the name. "THIS SUNDAY", "NEW", "WHILE IT LASTS".
  ribbon TEXT NOT NULL DEFAULT 'THIS SUNDAY',
  name TEXT NOT NULL DEFAULT '',
  -- One line, for the small layout and under the name on the big one.
  tagline TEXT NOT NULL DEFAULT '',

  -- Built on this drink, with these add-ins already chosen.
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  modifier_ids UUID[] NOT NULL DEFAULT '{}',

  -- 'big'   the featured card — a name people read from across the room
  -- 'small' one line above the menu, for when the card is competing with too much
  display_style TEXT NOT NULL DEFAULT 'big'
    CHECK (display_style IN ('big', 'small')),

  -- The last day it shows. Nothing looks more abandoned than a "this Sunday" card
  -- three weeks later, so it takes itself down rather than waiting to be remembered.
  show_until DATE,

  -- Shown instead of the order button once the bar can't make it.
  sold_out_note TEXT NOT NULL DEFAULT 'Back next Sunday',

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO specialty_drink (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Turning the special on or off reaches every phone with the menu open. Guarded,
-- because ALTER PUBLICATION errors if the table is already published and this file
-- is meant to be safe to re-run.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE specialty_drink;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Same policy as the other settings tables: the special is public by definition —
-- it is the first thing on the customer menu — and admin is the only writer.
ALTER TABLE specialty_drink ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON specialty_drink;
CREATE POLICY "Allow all access" ON specialty_drink FOR ALL USING (true) WITH CHECK (true);
