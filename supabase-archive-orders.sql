-- Migration: Add archived_at to orders (soft delete) + display_order to modifiers
-- Run this in your Supabase SQL editor

-- Soft delete support for orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_archived_at ON orders(archived_at);

-- Display order for individual modifiers (allows reordering within a group)
ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;

