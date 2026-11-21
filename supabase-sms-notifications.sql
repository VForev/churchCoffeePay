-- Migration: "Text me when my order is ready" (Telnyx)
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query). Safe to re-run.
--
-- Why a separate table and not orders.customer_phone:
--   `orders` is readable with the public anon key (the barista board, /live and the
--   customer's phone all read it straight from the browser). A phone number written there
--   could be downloaded by anyone who opens dev tools. This table has row level security ON
--   and NO policies, so the anon key can neither read nor write it — only the server routes
--   under /api/sms (which use the service role key) can.
--
-- The number is wiped as soon as the text has been sent. A row with status 'sent' and a
-- NULL phone is the normal end state.

create table if not exists order_sms (
  order_id          uuid primary key references orders(id) on delete cascade,
  phone             text,                                   -- E.164, e.g. +15551234567; NULL once sent
  status            text not null default 'waiting'
                      check (status in ('waiting', 'sending', 'sent', 'failed')),
  consented_at      timestamptz not null default now(),     -- when they ticked the box
  sent_at           timestamptz,
  telnyx_message_id text,
  last_error        text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_order_sms_status on order_sms(status);

alter table order_sms enable row level security;
-- Deliberately no "create policy" here. No policy = no access for the anon key.

NOTIFY pgrst, 'reload schema';
