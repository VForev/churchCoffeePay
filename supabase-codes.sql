-- One kind of code — coupons, access codes and priority codes become the same thing,
-- and every use of one is written down.
--
-- After this runs, a code at /admin/coupons ("Codes") can do any mix of three jobs:
--   * Opens ordering while the shop is closed (what /admin/access-codes used to do,
--     including "one category only" and write-in orders)
--   * ⚡ Priority — the order goes to the front of the line
--   * A discount — percentage, fixed amount, or a free order
--
-- And `code_uses` records every code on every order: who, when, and what it did. That
-- is what the "Who used which code" search on /admin/coupons reads.
--
-- What it does to existing data:
--   * Every access code is copied into `coupons` as an "opens ordering" code with no
--     discount. If a coupon already has the same code, that coupon simply gains the
--     opens-ordering job. The old `access_codes` table is left alone, just unused.
--   * Orders that already used a coupon are back-filled into `code_uses`. Access-code
--     unlocks were never recorded, so there is nothing honest to back-fill them with.
--
-- Includes everything in supabase-priority-orders.sql, so it doesn't matter whether that
-- one ran first. Safe to re-run.

-- ── Codes ───────────────────────────────────────────────────────────────────────────
alter table coupons add column if not exists is_priority boolean not null default false;
alter table orders  add column if not exists is_priority boolean not null default false;

-- Who the code is for, e.g. "Pastor Mike" or "Brothers Meeting" — admin-facing only.
alter table coupons add column if not exists label text not null default '';
-- The access-code job: lets this code order while the shop is closed (never past Lock
-- Everything — that one has no way round it).
alter table coupons add column if not exists unlocks_ordering boolean not null default false;
alter table coupons add column if not exists allowed_category_id uuid references categories(id) on delete set null;
alter table coupons add column if not exists allow_custom_order boolean not null default false;
alter table coupons add column if not exists custom_order_note text;

-- Copy the access codes over. Guarded, because a shop that never ran
-- supabase-access-codes.sql has no such table.
do $$
begin
  if to_regclass('public.access_codes') is not null then
    insert into coupons (
      code, discount_type, discount_value, is_active, label,
      unlocks_ordering, allowed_category_id, allow_custom_order, custom_order_note, created_at
    )
    select
      upper(code), 'percentage', 0, is_active, label,
      true, allowed_category_id, allow_custom_order, custom_order_note, created_at
    from access_codes
    on conflict (code) do update set
      unlocks_ordering    = true,
      label               = case when coupons.label = '' then excluded.label else coupons.label end,
      allowed_category_id = excluded.allowed_category_id,
      allow_custom_order  = excluded.allow_custom_order,
      custom_order_note   = excluded.custom_order_note;
  end if;
end $$;

-- ── Who used which code ─────────────────────────────────────────────────────────────
create table if not exists code_uses (
  id uuid primary key default gen_random_uuid(),
  -- SET NULL, not CASCADE: deleting a code must not delete the record of who used it.
  -- `code` is a copy of the text for exactly that reason.
  coupon_id uuid references coupons(id) on delete set null,
  code text not null,
  order_id uuid references orders(id) on delete set null,
  customer_name text not null default '',
  order_source text,
  -- What the code actually did on this order.
  unlocked boolean not null default false,
  priority boolean not null default false,
  discount_amount decimal(10,2) not null default 0,
  used_at timestamptz not null default now()
);

create index if not exists idx_code_uses_code on code_uses (upper(code));
create index if not exists idx_code_uses_used_at on code_uses (used_at desc);
create index if not exists idx_code_uses_coupon on code_uses (coupon_id);

alter table code_uses enable row level security;
-- Matches the rest of the schema's permissive, anon-key posture (walk-up coffee stand).
drop policy if exists "Allow all access" on code_uses;
create policy "Allow all access" on code_uses for all using (true) with check (true);

-- Back-fill orders that already used a coupon. Runs BEFORE the counting trigger below
-- exists, because those uses are already in coupons.times_used.
insert into code_uses (coupon_id, code, order_id, customer_name, order_source, priority, discount_amount, used_at)
select o.coupon_id, c.code, o.id, o.customer_name, o.order_source,
       coalesce(o.is_priority, false), coalesce(o.discount_amount, 0), o.created_at
from orders o
join coupons c on c.id = o.coupon_id
where not exists (
  select 1 from code_uses u where u.order_id = o.id and u.coupon_id = o.coupon_id
);

-- Counting a use and recording it are the same event, so the database does both: a row
-- in code_uses bumps coupons.times_used. One statement, so two phones using the last
-- use of a code at the same moment can't both read the old count.
create or replace function count_code_use() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.coupon_id is not null then
    update coupons set times_used = times_used + 1 where id = new.coupon_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_count_code_use on code_uses;
create trigger trg_count_code_use after insert on code_uses
  for each row execute function count_code_use();

notify pgrst, 'reload schema';
