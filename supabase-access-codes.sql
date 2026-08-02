-- Access codes — let specific groups (a brothers' meeting, security) order while the
-- shop is otherwise closed. A customer enters a code on the closed-shop notice; a valid
-- active code unlocks ordering for that browser session only. Everyone else still sees
-- "closed". Codes are managed at /admin/access-codes.
--
-- Safe to re-run.

create table if not exists access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  -- Who the code is for, e.g. "Brothers Meeting" or "Security" — shown in admin only.
  label text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_access_codes_code on access_codes(code);

-- Optional menu restriction: when set, this code only unlocks items in that one
-- category (e.g. a brothers' meeting that may order teas but nothing else). NULL
-- means the whole menu. Run as an ALTER so an already-created table gets upgraded.
alter table access_codes
  add column if not exists allowed_category_id uuid references categories(id) on delete set null;

-- Optional write-in orders: when on, a code shows a free-text "write your own order"
-- box (for a brothers' meeting who want something off-menu). custom_order_note is the
-- fine print shown next to it — e.g. "if we can't make it, we won't, sorry."
alter table access_codes
  add column if not exists allow_custom_order boolean not null default false;
alter table access_codes
  add column if not exists custom_order_note text;

-- A write-in order still needs a menu item to hang on (order_items.menu_item_id is NOT
-- NULL), and it should never appear on the normal menu. So we keep one hidden category
-- and one hidden "Custom Order" item, at fixed ids the app references directly. The
-- typed request rides along as the order item's special_instructions, so it shows on the
-- barista board's Note box and on the printed label with no extra code.
insert into categories (id, name, display_order, is_active)
values ('c0570000-0000-4000-8000-000000000001', 'Custom (hidden)', 999, false)
on conflict (id) do nothing;

insert into menu_items (id, category_id, name, base_price, is_available, is_free, display_order)
values (
  'c0570000-0000-4000-8000-000000000002',
  'c0570000-0000-4000-8000-000000000001',
  'Custom Order', 0, false, true, 999
)
on conflict (id) do nothing;

alter table access_codes enable row level security;

-- Matches the rest of the schema's permissive, anon-key posture (walk-up coffee stand).
drop policy if exists "Allow all access" on access_codes;
create policy "Allow all access" on access_codes for all using (true) with check (true);
