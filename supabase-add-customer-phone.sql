-- Migration: add customer_phone to orders
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

alter table orders
  add column if not exists customer_phone text;
