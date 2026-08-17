-- LOTG Coffee POS — order issue tracking + faster multi-screen updates
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- Safe to re-run: every statement is idempotent.
--
-- Adds:
--   1. An issue flag on orders, so anything that went wrong can be found again later
--   2. Realtime on order_item_modifiers, so every barista screen refreshes on any change

-- ============================================
-- 1. ISSUE FLAG
-- ============================================
-- issue_flagged_at = when a barista marked this order as having a problem.
--                    NULL means no issue. It's a timestamp rather than a boolean so
--                    reports can say *when* the trouble happened, not just that it did.
-- issue_note       = what went wrong, in the barista's words ("wrong milk, remade").
alter table orders add column if not exists issue_flagged_at timestamptz default null;
alter table orders add column if not exists issue_note text default null;

-- Partial index: the flagged orders are the tiny minority we ever filter on.
create index if not exists idx_orders_issue_flagged
  on orders(issue_flagged_at)
  where issue_flagged_at is not null;

-- ============================================
-- 2. REALTIME ON MODIFIERS OF ORDER ITEMS
-- ============================================
-- orders and order_items are already published (supabase-schema.sql). Add the third
-- table so a screen that loaded an order mid-insert still fills in its add-ins without
-- waiting for the next poll.
do $$
begin
  alter publication supabase_realtime add table order_item_modifiers;
exception when duplicate_object then null;
end $$;
