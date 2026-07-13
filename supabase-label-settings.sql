-- Editable cup-label layout, set at /admin/labels.
--
-- One row, id = 1 — same shape as shop_settings. The print agent on the shop PC
-- reads this row and subscribes to it, so saving in admin changes the next label
-- that prints. No restart, no editing files on the PC.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS label_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- The sticker itself, not the backing paper.
  width_mm NUMERIC NOT NULL DEFAULT 50,
  height_mm NUMERIC NOT NULL DEFAULT 30,
  margin_mm NUMERIC NOT NULL DEFAULT 2,

  show_temp_band BOOLEAN NOT NULL DEFAULT TRUE,
  show_cup_counter BOOLEAN NOT NULL DEFAULT TRUE,
  show_modifiers BOOLEAN NOT NULL DEFAULT TRUE,
  show_note BOOLEAN NOT NULL DEFAULT TRUE,
  show_footer BOOLEAN NOT NULL DEFAULT TRUE,
  uppercase_name BOOLEAN NOT NULL DEFAULT FALSE,

  -- Type size multipliers. Clamped to 0.6–1.6 in the app.
  name_scale NUMERIC NOT NULL DEFAULT 1,
  drink_scale NUMERIC NOT NULL DEFAULT 1,
  modifier_scale NUMERIC NOT NULL DEFAULT 1,

  -- The "Send test label" button stamps this; the agent prints when it changes.
  test_print_requested_at TIMESTAMPTZ DEFAULT NULL,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO label_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- The agent watches this table live, so a save in admin reaches the printer.
-- Guarded because ALTER PUBLICATION ... ADD TABLE errors if it's already there,
-- and this file is meant to be safe to re-run.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE label_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
