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

-- The order categories print in on the label, as a JSON array of group names, e.g.
-- ["Syrups","Milk","Size"]. Groups not listed fall in after these, in /admin/modifiers
-- order. Edited with the ▲/▼ buttons on /admin/labels.
ALTER TABLE label_settings
  ADD COLUMN IF NOT EXISTS modifier_group_order JSONB NOT NULL DEFAULT '[]'::jsonb;
