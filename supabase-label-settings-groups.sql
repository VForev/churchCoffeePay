-- Per-modifier-group control for cup labels, set at /admin/labels.
--
-- Adds one column to label_settings (see supabase-label-settings.sql). Safe to re-run.
-- Until this runs, every modifier category shows on the label at the normal size (the
-- default), and the per-category controls on /admin/labels have nothing to save into.
--
-- Stored as JSONB: a map from modifier-group name to { "show": bool, "scale": number }.
-- Groups not present in the map use the defaults (shown, ×1), so a brand-new group added
-- at /admin/modifiers shows on the label automatically.

ALTER TABLE label_settings
  ADD COLUMN IF NOT EXISTS modifier_group_styles JSONB NOT NULL DEFAULT '{}'::jsonb;
