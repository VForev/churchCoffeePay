-- More cup-label customization, set at /admin/labels.
--
-- Adds three columns to the existing label_settings table (see
-- supabase-label-settings.sql). Safe to re-run. Until this runs, the app falls back
-- to the defaults (drink in normal case, left-aligned, footer at normal size) rather
-- than erroring — but SAVING on /admin/labels needs these columns to exist.

-- Drink name in CAPITALS, like uppercase_name but for the drink line.
ALTER TABLE label_settings ADD COLUMN IF NOT EXISTS uppercase_drink BOOLEAN NOT NULL DEFAULT FALSE;

-- Centre the name, drink and modifiers instead of aligning them left.
ALTER TABLE label_settings ADD COLUMN IF NOT EXISTS center_text BOOLEAN NOT NULL DEFAULT FALSE;

-- Size multiplier for the bottom order-code/time line and the cup counter.
-- Clamped to 0.6–1.6 in the app, same as the other _scale columns.
ALTER TABLE label_settings ADD COLUMN IF NOT EXISTS footer_scale NUMERIC NOT NULL DEFAULT 1;
