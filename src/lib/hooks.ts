'use client';

import { useSyncExternalStore } from 'react';
import { cartStore } from './cart-store';
import { CartState } from '@/types';

export function useCart(): CartState & { itemCount: number } {
  const state = useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getState,
    cartStore.getState,
  );
  return { ...state, itemCount: cartStore.itemCount() };
}
