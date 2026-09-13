-- ─────────────────────────────────────────────────────────────────────────────
-- The app's colours, edited at /admin/theme.
--
-- One row, id = 1 — same shape as shop_settings and label_settings. Every screen
-- subscribes to it, so switching the theme in admin repaints the customer menu,
-- the barista board and the lobby TV without anyone touching them.
--
--   preset     which built-in scheme is in use (see THEME_PRESETS in src/lib/theme.ts)
--   overrides  the individual colours someone changed on top of it, {token: "#RRGGBB"}
--
-- Storing the overrides separately is what lets "the red scheme, but with a lighter
-- page" be two fields instead of a sixth preset — and what lets a preset be corrected
-- later without wiping the shop's own edits.
--
-- Until this file runs, the app looks exactly as it does today: every read in
-- src/lib/theme.ts falls back to the Navy preset, which is the same set of values
-- hard-coded in globals.css. Nothing breaks; /admin/theme just says to run this.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS theme_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  preset TEXT NOT NULL DEFAULT 'navy',
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO theme_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Every open screen repaints on save. Guarded, because ALTER PUBLICATION errors if
-- the table is already published and this file is meant to be safe to re-run.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE theme_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Same policy as the other settings tables: the colours are public by definition —
-- they ship in the page to every customer's phone — and the admin panel is the only
-- thing with a reason to write them.
ALTER TABLE theme_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON theme_settings;
CREATE POLICY "Allow all access" ON theme_settings FOR ALL USING (true) WITH CHECK (true);
