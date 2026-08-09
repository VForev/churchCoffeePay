-- Church branding on cup labels — the Light of the Gospel mark and name printed
-- across the top of every cup. Edited at /admin/labels.
--
-- Adds four columns to label_settings (see supabase-label-settings.sql). Safe to re-run.
--
-- Until this runs, the app still shows and prints the branding — normalizeLabelSettings()
-- in src/lib/labels.ts defaults it on — but /admin/labels has nowhere to save changes to
-- it, so the toggles won't stick.

ALTER TABLE label_settings
  ADD COLUMN IF NOT EXISTS show_logo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE label_settings
  ADD COLUMN IF NOT EXISTS show_church_name BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE label_settings
  ADD COLUMN IF NOT EXISTS church_name TEXT NOT NULL DEFAULT 'Light of the Gospel';

-- Size multiplier for the mark and the name together. Clamped to 0.6–1.6 in the app.
ALTER TABLE label_settings
  ADD COLUMN IF NOT EXISTS brand_scale NUMERIC NOT NULL DEFAULT 1;
