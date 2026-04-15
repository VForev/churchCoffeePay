-- LOTG Coffee POS - Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================
-- CATEGORIES
-- ============================================
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  display_order int not null default 0,
  is_active boolean not null default true
);

-- ============================================
-- MENU ITEMS
-- ============================================
create table menu_items (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  description text,
  base_price decimal(10,2) not null default 0,
  image_url text,
  is_available boolean not null default true,
  is_free boolean not null default false,
  display_order int not null default 0
);

-- ============================================
-- MODIFIER GROUPS
-- ============================================
create table modifier_groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_required boolean not null default false,
  allow_multiple boolean not null default false,
  display_order int not null default 0
);

-- ============================================
-- MODIFIERS
-- ============================================
create table modifiers (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references modifier_groups(id) on delete cascade,
  name text not null,
  price_adjustment decimal(10,2) not null default 0,
  is_default boolean not null default false,
  is_available boolean not null default true
);

-- ============================================
-- ITEM <-> MODIFIER GROUP JOIN TABLE
-- ============================================
create table item_modifier_groups (
  id uuid primary key default uuid_generate_v4(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  unique(menu_item_id, modifier_group_id)
);

-- ============================================
-- EVENTS (Pricing Profiles)
-- ============================================
create table events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_all_free boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================
-- EVENT ITEM PRICE OVERRIDES
-- ============================================
create table event_item_prices (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  override_price decimal(10,2) not null default 0,
  is_free boolean not null default false,
  unique(event_id, menu_item_id)
);

-- ============================================
-- EVENT MODIFIER PRICE OVERRIDES
-- ============================================
create table event_modifier_prices (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  modifier_id uuid not null references modifiers(id) on delete cascade,
  override_price decimal(10,2) not null default 0,
  unique(event_id, modifier_id)
);

-- ============================================
-- COUPONS
-- ============================================
create table coupons (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount', 'free_item')),
  discount_value decimal(10,2) not null default 0,
  max_uses int,
  times_used int not null default 0,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================
-- ORDERS
-- ============================================
create table orders (
  id uuid primary key default uuid_generate_v4(),
  customer_name text not null,
  customer_phone text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'ready', 'completed', 'cancelled')),
  subtotal decimal(10,2) not null default 0,
  discount_amount decimal(10,2) not null default 0,
  tip_amount decimal(10,2) not null default 0,
  total decimal(10,2) not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'free')),
  stripe_payment_id text,
  coupon_id uuid references coupons(id),
  event_id uuid references events(id),
  order_source text not null default 'counter' check (order_source in ('counter', 'mobile')),
  created_at timestamptz not null default now()
);

-- ============================================
-- ORDER ITEMS
-- ============================================
create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id),
  quantity int not null default 1,
  item_price decimal(10,2) not null default 0,
  special_instructions text
);

-- ============================================
-- ORDER ITEM MODIFIERS
-- ============================================
create table order_item_modifiers (
  id uuid primary key default uuid_generate_v4(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  modifier_id uuid not null references modifiers(id),
  price_adjustment decimal(10,2) not null default 0
);

-- ============================================
-- INVENTORY ITEMS
-- ============================================
create table inventory_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  unit text not null,
  current_stock decimal(10,2) not null default 0,
  low_stock_threshold decimal(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================
-- ITEM INGREDIENTS (links menu items/modifiers to inventory)
-- ============================================
create table item_ingredients (
  id uuid primary key default uuid_generate_v4(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete cascade,
  modifier_id uuid references modifiers(id) on delete cascade,
  quantity_used decimal(10,4) not null default 0,
  check (
    (menu_item_id is not null and modifier_id is null) or
    (menu_item_id is null and modifier_id is not null)
  )
);

-- ============================================
-- INVENTORY LOG
-- ============================================
create table inventory_log (
  id uuid primary key default uuid_generate_v4(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  change_amount decimal(10,4) not null,
  reason text not null check (reason in ('order', 'restock', 'adjustment', 'waste')),
  order_id uuid references orders(id),
  created_at timestamptz not null default now()
);

-- ============================================
-- INDEXES for performance
-- ============================================
create index idx_menu_items_category on menu_items(category_id);
create index idx_modifiers_group on modifiers(group_id);
create index idx_orders_status on orders(status);
create index idx_orders_created on orders(created_at desc);
create index idx_order_items_order on order_items(order_id);
create index idx_inventory_log_item on inventory_log(inventory_item_id);
create index idx_inventory_log_order on inventory_log(order_id);
create index idx_coupons_code on coupons(code);

-- ============================================
-- ENABLE REALTIME on orders table (for barista dashboard)
-- ============================================
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
-- For now, allow all operations (tighten later for production)
alter table categories enable row level security;
alter table menu_items enable row level security;
alter table modifier_groups enable row level security;
alter table modifiers enable row level security;
alter table item_modifier_groups enable row level security;
alter table events enable row level security;
alter table event_item_prices enable row level security;
alter table event_modifier_prices enable row level security;
alter table coupons enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_modifiers enable row level security;
alter table inventory_items enable row level security;
alter table item_ingredients enable row level security;
alter table inventory_log enable row level security;

-- Public read/write policies for development
-- (Replace with proper auth-based policies for production)
create policy "Allow all access" on categories for all using (true) with check (true);
create policy "Allow all access" on menu_items for all using (true) with check (true);
create policy "Allow all access" on modifier_groups for all using (true) with check (true);
create policy "Allow all access" on modifiers for all using (true) with check (true);
create policy "Allow all access" on item_modifier_groups for all using (true) with check (true);
create policy "Allow all access" on events for all using (true) with check (true);
create policy "Allow all access" on event_item_prices for all using (true) with check (true);
create policy "Allow all access" on event_modifier_prices for all using (true) with check (true);
create policy "Allow all access" on coupons for all using (true) with check (true);
create policy "Allow all access" on orders for all using (true) with check (true);
create policy "Allow all access" on order_items for all using (true) with check (true);
create policy "Allow all access" on order_item_modifiers for all using (true) with check (true);
create policy "Allow all access" on inventory_items for all using (true) with check (true);
create policy "Allow all access" on item_ingredients for all using (true) with check (true);
create policy "Allow all access" on inventory_log for all using (true) with check (true);
