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

alter table access_codes enable row level security;

-- Matches the rest of the schema's permissive, anon-key posture (walk-up coffee stand).
drop policy if exists "Allow all access" on access_codes;
create policy "Allow all access" on access_codes for all using (true) with check (true);
