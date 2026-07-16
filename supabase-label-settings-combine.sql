-- "Combine categories onto one line" for cup labels, set at /admin/labels.
--
-- Adds one column to label_settings (see supabase-label-settings.sql). Safe to re-run.
-- Until this runs, every modifier category prints on its own line (the default) and the
-- combine control on /admin/labels has nothing to save into.
--
-- Stored as JSONB: an array of arrays of modifier-group names that should share a line,
-- e.g. [["Size","Milk"]] prints the size and milk together on one line.

ALTER TABLE label_settings
  ADD COLUMN IF NOT EXISTS modifier_combine JSONB NOT NULL DEFAULT '[]'::jsonb;
