-- Pushpay-gated access sessions.
-- Each row represents one Pushpay redirect grant that entitles the holder
-- to place a single order within one hour.

create table if not exists access_sessions (
  id uuid primary key default gen_random_uuid(),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists access_sessions_expires_at_idx
  on access_sessions (expires_at);

alter table access_sessions enable row level security;
