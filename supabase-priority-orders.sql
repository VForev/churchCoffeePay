-- Priority codes — let certain people (the pastor before preaching, the worship team
-- between sets) jump their order to the front of the line.
--
-- A priority code is an ordinary coupon with one extra flag, entered in the same code
-- box at checkout and on /tablet. It can also carry a discount, or none (0% off).
-- An order placed with one is stamped `is_priority`, and /barista and /live put it
-- ahead of every other order that hasn't been started yet.
--
-- Until this runs, nothing changes: codes can't be marked priority (the admin page says
-- to run this file) and no order is ever expedited.
--
-- Safe to re-run.

alter table coupons add column if not exists is_priority boolean not null default false;
alter table orders  add column if not exists is_priority boolean not null default false;

notify pgrst, 'reload schema';
