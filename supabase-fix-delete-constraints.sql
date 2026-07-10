-- Fix delete constraints
--
-- The original schema created several foreign keys with no `on delete` clause,
-- which defaults to NO ACTION. Postgres therefore refuses to delete any row
-- that is still referenced, and the admin delete buttons fail.
--
-- Deleting a parent row here should not destroy sales history, so these all
-- use `set null`: the child row survives with its price snapshot intact, it
-- just loses the pointer to the thing that was deleted.
--
-- Run this in the Supabase SQL Editor after supabase-schema.sql.

-- An order that deducted inventory could not be deleted, because its
-- inventory_log rows pointed at it. Keep the log, drop the pointer.
alter table inventory_log
  drop constraint if exists inventory_log_order_id_fkey;
alter table inventory_log
  add constraint inventory_log_order_id_fkey
  foreign key (order_id) references orders(id) on delete set null;

-- A coupon that was ever redeemed could not be deleted.
alter table orders
  drop constraint if exists orders_coupon_id_fkey;
alter table orders
  add constraint orders_coupon_id_fkey
  foreign key (coupon_id) references coupons(id) on delete set null;

-- An event that had orders placed during it could not be deleted.
alter table orders
  drop constraint if exists orders_event_id_fkey;
alter table orders
  add constraint orders_event_id_fkey
  foreign key (event_id) references events(id) on delete set null;

-- Deliberately NOT changed:
--
--   order_items.menu_item_id           -> menu_items(id)
--   order_item_modifiers.modifier_id   -> modifiers(id)
--
-- These stay restrictive. order_items reads the item name through this join,
-- so nulling it would blank out the line items on every past receipt, and
-- cascading would delete the order lines themselves and corrupt revenue
-- totals.
--
-- The admin UI no longer offers a delete for menu items or modifiers at all.
-- Both are hidden with a Hide/Show availability toggle, which keeps every past
-- order readable. Nothing is ever removed from these two tables.
