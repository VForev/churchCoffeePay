export interface Category {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  is_free: boolean;
  display_order: number;
  category?: Category;
  modifier_groups?: ModifierGroup[];
}

export interface ModifierGroup {
  id: string;
  name: string;
  is_required: boolean;
  allow_multiple: boolean;
  display_order: number;
  modifiers?: Modifier[];
}

export interface Modifier {
  id: string;
  group_id: string;
  name: string;
  price_adjustment: number;
  is_default: boolean;
  is_available: boolean;
}

export interface ItemModifierGroup {
  id: string;
  menu_item_id: string;
  modifier_group_id: string;
}

export interface Order {
  id: string;
  customer_name: string;
  status: OrderStatus;
  subtotal: number;
  tip_amount: number;
  total: number;
  discount_amount: number;
  payment_status: PaymentStatus;
  stripe_payment_id: string | null;
  coupon_id: string | null;
  order_source: OrderSource;
  event_id: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

export type OrderStatus = 'pending' | 'in_progress' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'free';
export type OrderSource = 'counter' | 'mobile';

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  item_price: number;
  special_instructions: string | null;
  menu_item?: MenuItem;
  modifiers?: OrderItemModifier[];
}

export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  modifier_id: string;
  price_adjustment: number;
  modifier?: Modifier;
}

export interface Event {
  id: string;
  name: string;
  is_all_free: boolean;
  is_active: boolean;
  created_at: string;
}

export interface EventItemPrice {
  id: string;
  event_id: string;
  menu_item_id: string;
  override_price: number;
  is_free: boolean;
}

export interface EventModifierPrice {
  id: string;
  event_id: string;
  modifier_id: string;
  override_price: number;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_uses: number | null;
  times_used: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_item';

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  low_stock_threshold: number;
  created_at: string;
}

export interface ItemIngredient {
  id: string;
  inventory_item_id: string;
  menu_item_id: string | null;
  modifier_id: string | null;
  quantity_used: number;
  inventory_item?: InventoryItem;
}

export interface InventoryLog {
  id: string;
  inventory_item_id: string;
  change_amount: number;
  reason: 'order' | 'restock' | 'adjustment' | 'waste';
  order_id: string | null;
  created_at: string;
  inventory_item?: InventoryItem;
}

// Cart types (client-side only)
export interface CartItem {
  id: string; // client-generated unique id
  menu_item: MenuItem;
  quantity: number;
  selected_modifiers: Modifier[];
  special_instructions: string;
  item_total: number; // base_price + modifier adjustments * quantity
}

export interface CartState {
  items: CartItem[];
  subtotal: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  coupon: Coupon | null;
  customer_name: string;
}
