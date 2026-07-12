-- LOTG Coffee POS — v2 features
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- Safe to re-run: every statement is idempotent.
--
-- Adds:
--   1. Sold-out ("86") flags on menu items and modifiers, flippable by baristas
--   2. Shop settings — service banner, donation toggle, open/closed override
--   3. Weekly ordering hours
--   4. Per-item modifier overrides — hide or lock an option on one drink only

-- ============================================
-- 1. SOLD OUT FLAGS
-- ============================================
-- is_available  = admin took it off the menu entirely (customer never sees it)
-- is_sold_out   = barista ran out today (customer sees it greyed out as "Sold Out")
alter table menu_items add column if not exists is_sold_out boolean not null default false;
alter table modifiers add column if not exists is_sold_out boolean not null default false;

create index if not exists idx_menu_items_sold_out on menu_items(is_sold_out);
create index if not exists idx_modifiers_sold_out on modifiers(is_sold_out);

-- ============================================
-- 2. SHOP SETTINGS (single row)
-- ============================================
create table if not exists shop_settings (
  id int primary key default 1,
  -- Big banner shown to customers
  service_title text not null default 'LOTG Coffee',
  service_subtitle text not null default 'Sunday Service',
  -- Donations (stored in orders.tip_amount)
  donations_enabled boolean not null default true,
  donation_label text not null default 'Donation',
  donation_presets text not null default '1,2,5',
  -- Ordering availability
  ordering_override text not null default 'auto' check (ordering_override in ('auto', 'open', 'closed')),
  closed_message text not null default 'Ordering is closed right now. Come see us during service!',
  -- Keeps the table to exactly one row
  constraint shop_settings_singleton check (id = 1)
);

insert into shop_settings (id) values (1) on conflict (id) do nothing;

-- ============================================
-- 3. WEEKLY ORDERING HOURS
-- ============================================
-- day_of_week: 0 = Sunday ... 6 = Saturday (matches JavaScript's Date.getDay())
create table if not exists ordering_hours (
  day_of_week int primary key check (day_of_week between 0 and 6),
  is_open boolean not null default false,
  open_time time not null default '09:00',
  close_time time not null default '11:30'
);

-- Seed all 7 days. Sunday open by default, everything else closed.
insert into ordering_hours (day_of_week, is_open, open_time, close_time) values
  (0, true,  '09:00', '11:30'),
  (1, false, '09:00', '11:30'),
  (2, false, '09:00', '11:30'),
  (3, false, '09:00', '11:30'),
  (4, false, '09:00', '11:30'),
  (5, false, '09:00', '11:30'),
  (6, false, '09:00', '11:30')
on conflict (day_of_week) do nothing;

-- ============================================
-- 4. PER-ITEM MODIFIER OVERRIDES
-- ============================================
-- Lets one drink hide or lock an option that other drinks in the same
-- modifier group still offer. Example: an Americano hides every Milk option;
-- a Latte locks "Whole Milk" as included and unchangeable.
--
-- is_hidden = customer never sees this option on this drink
-- is_locked = always applied to this drink, customer cannot remove or swap it
create table if not exists item_modifier_overrides (
  id uuid primary key default uuid_generate_v4(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  modifier_id uuid not null references modifiers(id) on delete cascade,
  is_hidden boolean not null default false,
  is_locked boolean not null default false,
  unique (menu_item_id, modifier_id),
  -- An option cannot be both hidden and force-applied
  constraint override_not_both check (not (is_hidden and is_locked))
);

create index if not exists idx_item_mod_overrides_item on item_modifier_overrides(menu_item_id);

-- Lets admins control the order modifier groups appear in on a given drink
alter table item_modifier_groups add column if not exists display_order int not null default 0;

-- ============================================
-- 5. REALTIME
-- ============================================
-- So a barista marking something sold out instantly updates every phone
-- that has the menu open, and settings changes push live too.
do $$
begin
  alter publication supabase_realtime add table menu_items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table modifiers;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table shop_settings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table ordering_hours;
exception when duplicate_object then null;
end $$;

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================
alter table shop_settings enable row level security;
alter table ordering_hours enable row level security;
alter table item_modifier_overrides enable row level security;

drop policy if exists "Allow all access" on shop_settings;
drop policy if exists "Allow all access" on ordering_hours;
drop policy if exists "Allow all access" on item_modifier_overrides;

create policy "Allow all access" on shop_settings for all using (true) with check (true);
create policy "Allow all access" on ordering_hours for all using (true) with check (true);
create policy "Allow all access" on item_modifier_overrides for all using (true) with check (true);
