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
  /** Admin took it off the menu entirely — customers never see it. */
  is_available: boolean;
  /** Barista ran out today — customers see it greyed out as "Sold Out". */
  is_sold_out: boolean;
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
  /** Admin removed the option entirely. */
  is_available: boolean;
  /** Barista ran out today (e.g. out of oat milk). */
  is_sold_out: boolean;
  display_order: number;
  /** Set per-drink from item_modifier_overrides — always applied, customer cannot remove it. */
  is_locked?: boolean;
}

export interface ItemModifierGroup {
  id: string;
  menu_item_id: string;
  modifier_group_id: string;
  display_order: number;
}

/**
 * Per-drink control over a single modifier option. Lets an Americano hide every
 * Milk option while a Latte still offers them, or lock "Whole Milk" as included.
 */
export interface ItemModifierOverride {
  id: string;
  menu_item_id: string;
  modifier_id: string;
  is_hidden: boolean;
  is_locked: boolean;
}

export interface ShopSettings {
  id: number;
  service_title: string;
  service_subtitle: string;
  donations_enabled: boolean;
  donation_label: string;
  /** Comma-separated dollar amounts, e.g. "1,2,5". */
  donation_presets: string;
  /** When false, the coupon box is hidden from checkout and the tablet. */
  coupons_enabled: boolean;
  ordering_override: OrderingOverride;
  closed_message: string;
}

/**
 * 'locked' is 'closed' with no way round it: access codes stop working too, so nobody
 * can order at all. Everything else lets an approved group through with a code.
 */
export type OrderingOverride = 'auto' | 'open' | 'closed' | 'locked';

/**
 * A code that lets a specific group order while the shop is otherwise closed
 * (e.g. a brothers' meeting during youth service). Managed at /admin/access-codes.
 */
export interface AccessCode {
  id: string;
  code: string;
  /** Who it's for, e.g. "Brothers Meeting" — admin-facing only. */
  label: string;
  is_active: boolean;
  /** When set, the code only unlocks this one category (e.g. Tea). NULL = whole menu. */
  allowed_category_id: string | null;
  /** When true, the code also shows a free-text "write your own order" box. */
  allow_custom_order: boolean;
  /** Fine print shown beside the write-in box, e.g. "if we can't make it, we won't, sorry." */
  custom_order_note: string | null;
  created_at: string;
}

export interface OrderingHours {
  /** 0 = Sunday ... 6 = Saturday, matching JavaScript's Date.getDay(). */
  day_of_week: number;
  is_open: boolean;
  /** "HH:MM:SS" from Postgres. */
  open_time: string;
  close_time: string;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  status: OrderStatus;
  subtotal: number;
  /** Stores the customer's donation. Kept as `tip_amount` to match the existing column. */
  tip_amount: number;
  total: number;
  discount_amount: number;
  payment_status: PaymentStatus;
  stripe_payment_id: string | null;
  coupon_id: string | null;
  order_source: OrderSource;
  event_id: string | null;
  created_at: string;
  archived_at: string | null;
  /**
   * When the cup labels were printed. NULL means "not printed yet" — the print
   * agent on the shop PC watches this, so setting it back to NULL reprints.
   */
  label_printed_at: string | null;
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
  /** Saved to the order's `tip_amount` column. */
  donation_amount: number;
  total: number;
  coupon: Coupon | null;
  customer_name: string;
}
