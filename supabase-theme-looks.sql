-- ─────────────────────────────────────────────────────────────────────────────
-- The look, alongside the colours — edited at /admin/theme.
--
-- supabase-theme.sql created theme_settings with the scheme and the per-colour
-- overrides. This adds the rest of the look: corners, shadows, text size, roominess,
-- the page background and the font pairing.
--
--   look  {"corners":"rounded","depth":"soft","textSize":"normal",
--          "roominess":"normal","background":"plain","font":"default"}
--
-- One column rather than six, because these are chosen and saved together and none of
-- them is ever queried on its own. The object above is also exactly the default, which
-- is the current app — so a shop that runs this file and never opens the page sees no
-- change at all.
--
-- Until this file runs, /admin/theme still saves colours: saveTheme() retries without
-- this column and says so on screen (src/lib/theme.ts). The look controls just have
-- nowhere to be stored, and every screen uses the standard one.
--
-- Run supabase-theme.sql first. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE theme_settings
  ADD COLUMN IF NOT EXISTS look JSONB NOT NULL
  DEFAULT '{"corners":"rounded","depth":"soft","textSize":"normal","roominess":"normal","background":"plain","font":"default"}'::jsonb;

-- theme_settings is already on the realtime publication from supabase-theme.sql, so a
-- saved look reaches every open screen the same way a saved colour does. Nothing to add.
