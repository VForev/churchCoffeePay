'use client';

import { CartItem, CartState, Coupon, MenuItem, Modifier } from '@/types';
import { generateId } from './utils';

type CartListener = () => void;

let state: CartState = {
  items: [],
  subtotal: 0,
  discount_amount: 0,
  donation_amount: 0,
  total: 0,
  coupon: null,
  customer_name: '',
};

const listeners = new Set<CartListener>();

function notify() {
  listeners.forEach((fn) => fn());
}

function recalculate() {
  state.subtotal = state.items.reduce((sum, item) => sum + item.item_total, 0);

  // Apply coupon discount
  state.discount_amount = 0;
  if (state.coupon) {
    if (state.coupon.discount_type === 'percentage') {
      state.discount_amount = state.subtotal * (state.coupon.discount_value / 100);
    } else if (state.coupon.discount_type === 'fixed_amount') {
      state.discount_amount = Math.min(state.coupon.discount_value, state.subtotal);
    } else if (state.coupon.discount_type === 'free_item') {
      state.discount_amount = state.subtotal; // entire order free
    }
  }

  const afterDiscount = Math.max(0, state.subtotal - state.discount_amount);
  state.total = afterDiscount + state.donation_amount;
}

export const cartStore = {
  getState: (): CartState => state,

  subscribe: (listener: CartListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  addItem: (menuItem: MenuItem, selectedModifiers: Modifier[], specialInstructions: string, eventFree: boolean) => {
    const modifierTotal = selectedModifiers.reduce((sum, m) => sum + m.price_adjustment, 0);
    const effectivePrice = eventFree ? 0 : (menuItem.is_free ? 0 : menuItem.base_price);
    const effectiveModPrice = eventFree ? 0 : modifierTotal;
    const itemTotal = (effectivePrice + effectiveModPrice);

    const cartItem: CartItem = {
      id: generateId(),
      menu_item: menuItem,
      quantity: 1,
      selected_modifiers: selectedModifiers,
      special_instructions: specialInstructions,
      item_total: itemTotal,
    };

    state = { ...state, items: [...state.items, cartItem] };
    recalculate();
    notify();
  },

  removeItem: (cartItemId: string) => {
    state = { ...state, items: state.items.filter((i) => i.id !== cartItemId) };
    recalculate();
    notify();
  },

  updateQuantity: (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      cartStore.removeItem(cartItemId);
      return;
    }
    state = {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== cartItemId) return item;
        const unitPrice = item.item_total / item.quantity;
        return { ...item, quantity, item_total: unitPrice * quantity };
      }),
    };
    recalculate();
    notify();
  },

  setCustomerName: (name: string) => {
    state = { ...state, customer_name: name };
    notify();
  },

  setDonation: (amount: number) => {
    state = { ...state, donation_amount: Math.max(0, amount) };
    recalculate();
    notify();
  },

  applyCoupon: (coupon: Coupon) => {
    state = { ...state, coupon };
    recalculate();
    notify();
  },

  removeCoupon: () => {
    state = { ...state, coupon: null };
    recalculate();
    notify();
  },

  clear: () => {
    state = {
      items: [],
      subtotal: 0,
      discount_amount: 0,
      donation_amount: 0,
      total: 0,
      coupon: null,
      customer_name: '',
    };
    notify();
  },

  itemCount: (): number => {
    return state.items.reduce((sum, item) => sum + item.quantity, 0);
  },
};
