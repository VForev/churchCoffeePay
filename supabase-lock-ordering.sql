-- "Lock Everything" — a fourth ordering override that stops orders from everyone,
-- including anyone holding a valid access code. Set at /admin/settings.
--
-- 'closed' still lets an approved group unlock with a code (see supabase-access-codes.sql).
-- 'locked' is the state with no way round it, for when ordering has to genuinely stop.
--
-- Safe to re-run. Until this runs, choosing "Lock Everything" fails to save — the old
-- CHECK constraint rejects the value — so the shop stays on whatever it was.

-- Drop whatever CHECK is currently guarding the column, by looking it up rather than by
-- name: the original was created inline with the table, so its name is whatever Postgres
-- generated at the time.
DO $$
DECLARE con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'shop_settings'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%ordering_override%'
  LOOP
    EXECUTE format('ALTER TABLE shop_settings DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE shop_settings
  ADD CONSTRAINT shop_settings_ordering_override_check
  CHECK (ordering_override IN ('auto', 'open', 'closed', 'locked'));
