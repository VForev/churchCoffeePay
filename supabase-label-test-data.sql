-- Carries the exact label the admin was previewing when they hit "Send test label",
-- so the shop PC prints that instead of a canned sample. Set at /admin/labels.
--
-- Adds one column to label_settings (see supabase-label-settings.sql). Safe to re-run.
-- NULL means "no preview supplied" — the agent then prints its built-in sample.

ALTER TABLE label_settings
  ADD COLUMN IF NOT EXISTS test_label_data JSONB DEFAULT NULL;
