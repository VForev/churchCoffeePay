-- LOTG Coffee POS - Seed Data
-- Run this AFTER the schema has been created

-- ============================================
-- CATEGORIES
-- ============================================
insert into categories (id, name, display_order) values
  ('c1000000-0000-0000-0000-000000000001', 'Espresso', 1),
  ('c1000000-0000-0000-0000-000000000002', 'Drip Coffee', 2),
  ('c1000000-0000-0000-0000-000000000003', 'Tea', 3);

-- ============================================
-- MODIFIER GROUPS
-- ============================================
insert into modifier_groups (id, name, is_required, allow_multiple, display_order) values
  ('a1000000-0000-0000-0000-000000000001', 'Size', true, false, 1),
  ('a1000000-0000-0000-0000-000000000002', 'Milk', true, false, 2),
  ('a1000000-0000-0000-0000-000000000003', 'Syrup', false, true, 3),
  ('a1000000-0000-0000-0000-000000000004', 'Extras', false, true, 4),
  ('a1000000-0000-0000-0000-000000000005', 'Temperature', true, false, 5);

-- ============================================
-- MODIFIERS
-- ============================================
-- Size
insert into modifiers (group_id, name, price_adjustment, is_default) values
  ('a1000000-0000-0000-0000-000000000001', 'Small (8oz)', 0, true),
  ('a1000000-0000-0000-0000-000000000001', 'Medium (12oz)', 0.50, false),
  ('a1000000-0000-0000-0000-000000000001', 'Large (16oz)', 1.00, false);

-- Milk
insert into modifiers (group_id, name, price_adjustment, is_default) values
  ('a1000000-0000-0000-0000-000000000002', 'Whole Milk', 0, true),
  ('a1000000-0000-0000-0000-000000000002', '2% Milk', 0, false),
  ('a1000000-0000-0000-0000-000000000002', 'Oat Milk', 0.75, false),
  ('a1000000-0000-0000-0000-000000000002', 'Almond Milk', 0.75, false),
  ('a1000000-0000-0000-0000-000000000002', 'Coconut Milk', 0.75, false),
  ('a1000000-0000-0000-0000-000000000002', 'No Milk', 0, false);

-- Syrup
insert into modifiers (group_id, name, price_adjustment, is_default) values
  ('a1000000-0000-0000-0000-000000000003', 'Vanilla', 0.50, false),
  ('a1000000-0000-0000-0000-000000000003', 'Caramel', 0.50, false),
  ('a1000000-0000-0000-0000-000000000003', 'Hazelnut', 0.50, false),
  ('a1000000-0000-0000-0000-000000000003', 'Mocha', 0.50, false),
  ('a1000000-0000-0000-0000-000000000003', 'Lavender', 0.75, false),
  ('a1000000-0000-0000-0000-000000000003', 'Brown Sugar', 0.50, false);

-- Extras
insert into modifiers (group_id, name, price_adjustment, is_default) values
  ('a1000000-0000-0000-0000-000000000004', 'Extra Shot', 0.75, false),
  ('a1000000-0000-0000-0000-000000000004', 'Decaf', 0, false),
  ('a1000000-0000-0000-0000-000000000004', 'Whipped Cream', 0, false);

-- Temperature
insert into modifiers (group_id, name, price_adjustment, is_default) values
  ('a1000000-0000-0000-0000-000000000005', 'Hot', 0, true),
  ('a1000000-0000-0000-0000-000000000005', 'Iced', 0, false);

-- ============================================
-- MENU ITEMS - Espresso
-- ============================================
insert into menu_items (id, category_id, name, description, base_price, is_free, display_order) values
  ('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Latte', 'Smooth espresso with steamed milk', 4.50, false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Cappuccino', 'Equal parts espresso, steamed milk, and foam', 4.50, false, 2),
  ('b1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'Americano', 'Espresso with hot water', 3.50, false, 3),
  ('b1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'Mocha', 'Espresso with chocolate and steamed milk', 5.00, false, 4),
  ('b1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'Espresso', 'Double shot of espresso', 3.00, false, 5),
  ('b1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000001', 'Vanilla Latte', 'Latte with vanilla syrup', 5.00, false, 6);

-- MENU ITEMS - Drip Coffee
insert into menu_items (id, category_id, name, description, base_price, is_free, display_order) values
  ('b1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000002', 'House Blend', 'Our smooth daily drip', 0, true, 1),
  ('b1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000002', 'Dark Roast', 'Bold and rich', 0, true, 2),
  ('b1000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000002', 'Cold Brew', 'Smooth, cold-steeped coffee', 3.50, false, 3);

-- MENU ITEMS - Tea
insert into menu_items (id, category_id, name, description, base_price, is_free, display_order) values
  ('b1000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000003', 'Earl Grey', 'Classic black tea with bergamot', 0, true, 1),
  ('b1000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000003', 'Green Tea', 'Light and refreshing', 0, true, 2),
  ('b1000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000003', 'Chai Latte', 'Spiced tea with steamed milk', 4.50, false, 3),
  ('b1000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000003', 'Matcha Latte', 'Ceremonial grade matcha with milk', 5.50, false, 4);

-- ============================================
-- ITEM <-> MODIFIER GROUP LINKS
-- ============================================
-- Espresso drinks get: Size, Milk, Syrup, Extras, Temperature
insert into item_modifier_groups (menu_item_id, modifier_group_id)
select m.id, g.id
from menu_items m
cross join modifier_groups g
where m.category_id = 'c1000000-0000-0000-0000-000000000001'
  and g.id in (
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000005'
  );

-- Drip coffee gets: Size, Extras
insert into item_modifier_groups (menu_item_id, modifier_group_id)
select m.id, g.id
from menu_items m
cross join modifier_groups g
where m.category_id = 'c1000000-0000-0000-0000-000000000002'
  and g.id in (
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000004'
  );

-- Tea gets: Size, Temperature
insert into item_modifier_groups (menu_item_id, modifier_group_id)
select m.id, g.id
from menu_items m
cross join modifier_groups g
where m.category_id = 'c1000000-0000-0000-0000-000000000003'
  and g.id in (
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000005'
  );

-- Chai Latte and Matcha Latte also get Milk
insert into item_modifier_groups (menu_item_id, modifier_group_id) values
  ('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000002');

-- ============================================
-- SAMPLE EVENT
-- ============================================
insert into events (name, is_all_free, is_active) values
  ('Sunday Morning', false, false),
  ('Youth Night', true, false);

-- ============================================
-- SAMPLE COUPON
-- ============================================
insert into coupons (code, discount_type, discount_value, max_uses) values
  ('WELCOME', 'percentage', 50, 100),
  ('FREECOFFE', 'free_item', 0, null);

-- ============================================
-- SAMPLE INVENTORY
-- ============================================
insert into inventory_items (id, name, unit, current_stock, low_stock_threshold) values
  ('e1000000-0000-0000-0000-000000000001', 'Espresso Beans', 'lbs', 20, 5),
  ('e1000000-0000-0000-0000-000000000002', 'Whole Milk', 'gallons', 10, 3),
  ('e1000000-0000-0000-0000-000000000003', 'Oat Milk', 'cartons', 8, 2),
  ('e1000000-0000-0000-0000-000000000004', 'Vanilla Syrup', 'bottles', 6, 2),
  ('e1000000-0000-0000-0000-000000000005', 'Caramel Syrup', 'bottles', 5, 2),
  ('e1000000-0000-0000-0000-000000000006', 'Cups (8oz)', 'cups', 200, 50),
  ('e1000000-0000-0000-0000-000000000007', 'Cups (12oz)', 'cups', 200, 50),
  ('e1000000-0000-0000-0000-000000000008', 'Cups (16oz)', 'cups', 150, 40),
  ('e1000000-0000-0000-0000-000000000009', 'Tea Bags (Earl Grey)', 'bags', 100, 20),
  ('e1000000-0000-0000-0000-000000000010', 'Tea Bags (Green)', 'bags', 80, 20);
