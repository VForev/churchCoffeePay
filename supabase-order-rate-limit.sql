-- Stopping one person spam-ordering.
--
-- Orders are inserted straight from the customer's browser with the public anon key,
-- so ANY check written in JavaScript is a suggestion — clear the site data, or open a
-- private tab, and it's gone. The only place a limit actually holds is inside the
-- database, on the way in. That's what this trigger is.
--
-- The rule: more than 3 orders from the same phone (or the same customer name) inside
-- 10 minutes is not a real coffee order, it's someone hammering the button. The 4th is
-- rejected. Both numbers are editable at /admin/settings.
--
-- Counter orders are ALWAYS exempt. /tablet is the barista's own device and would trip
-- the limit within one busy minute; a limit is about the public, not about stopping
-- staff serving the queue in front of them.

-- ============================================
-- 1. WHICH PHONE PLACED THE ORDER
-- ============================================
-- A random id kept in the browser's localStorage (src/lib/device.ts). It is not a
-- person and not a login — just "the same browser as five seconds ago", which is
-- exactly the question being asked. Name matching below catches the cleared-storage
-- case; nothing here can catch someone with two phones, and nothing needs to.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS device_id TEXT;

-- The trigger's lookup: this device, recently. Partial, because a NULL device_id
-- (an older browser tab, or an order placed before this shipped) is never matched.
CREATE INDEX IF NOT EXISTS idx_orders_device_recent
  ON orders(device_id, created_at DESC)
  WHERE device_id IS NOT NULL;

-- ============================================
-- 2. THE LIMITS, EDITABLE BY THE ADMIN
-- ============================================
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS spam_limit_enabled BOOLEAN NOT NULL DEFAULT TRUE;
-- "More than 3 in the window" — so 3 is fine, the 4th is refused.
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS spam_max_orders INT NOT NULL DEFAULT 3;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS spam_window_minutes INT NOT NULL DEFAULT 10;

-- ============================================
-- 3. THE TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION enforce_order_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg          RECORD;
  window_start TIMESTAMPTZ;
  recent_count INT;
  who          TEXT;
BEGIN
  -- The barista's own tablet never counts. See the note at the top of this file.
  IF NEW.order_source = 'counter' THEN
    RETURN NEW;
  END IF;

  SELECT spam_limit_enabled, spam_max_orders, spam_window_minutes
    INTO cfg
    FROM shop_settings
   WHERE id = 1;

  -- No settings row yet (a database mid-setup) means no configured limit to enforce.
  -- Refusing every order because a settings row is missing would be far worse than
  -- letting them through.
  IF NOT FOUND OR cfg.spam_limit_enabled IS NOT TRUE OR coalesce(cfg.spam_max_orders, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  window_start := now() - make_interval(mins => GREATEST(coalesce(cfg.spam_window_minutes, 10), 1));

  -- Cancelled orders don't count toward the limit: an order the shop itself threw out
  -- must not lock the customer out of re-placing it.
  SELECT count(*)
    INTO recent_count
    FROM orders o
   WHERE o.created_at >= window_start
     AND o.order_source <> 'counter'
     AND o.status <> 'cancelled'
     AND (
           (NEW.device_id IS NOT NULL AND o.device_id = NEW.device_id)
           OR lower(btrim(o.customer_name)) = lower(btrim(NEW.customer_name))
         );

  IF recent_count >= cfg.spam_max_orders THEN
    who := coalesce(nullif(btrim(NEW.customer_name), ''), 'this device');
    -- ORDER_RATE_LIMIT is the marker the app greps for (src/lib/rate-limit.ts) so it
    -- can show a human sentence instead of a Postgres error. Keep it in the message.
    RAISE EXCEPTION
      'ORDER_RATE_LIMIT: % already has % orders in the last % minutes.',
      who, recent_count, cfg.spam_window_minutes
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_rate_limit ON orders;
CREATE TRIGGER trg_enforce_order_rate_limit
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_rate_limit();
