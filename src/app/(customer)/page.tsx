'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { cartStore } from '@/lib/cart-store';
import { useCart } from '@/lib/hooks';
import CategoryTabs from '@/components/menu/CategoryTabs';
import MenuCard from '@/components/menu/MenuCard';
import ModifierSelector from '@/components/menu/ModifierSelector';
import CartDrawer from '@/components/cart/CartDrawer';
import AccessCountdown from '@/components/AccessCountdown';
import type { Category, MenuItem, ModifierGroup, Modifier, Event } from '@/types';
import { useRouter } from 'next/navigation';

export default function MenuPage() {
  const router = useRouter();
  const cart = useCart();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch categories, items, and active event
  useEffect(() => {
    async function fetchMenu() {
      const [catRes, itemRes, eventRes] = await Promise.all([
        supabase.from('categories').select('*').eq('is_active', true).order('display_order'),
        supabase.from('menu_items').select('*').eq('is_available', true).order('display_order'),
        supabase.from('events').select('*').eq('is_active', true).limit(1).single(),
      ]);

      if (catRes.data) {
        setCategories(catRes.data);
        if (catRes.data.length > 0) setActiveCategory(catRes.data[0].id);
      }
      if (itemRes.data) setMenuItems(itemRes.data);
      if (eventRes.data) setActiveEvent(eventRes.data);
      setLoading(false);
    }
    fetchMenu();
  }, []);

  // Fetch modifier groups for selected item
  useEffect(() => {
    if (!selectedItem) return;
    async function fetchModifiers() {
      // Get modifier group IDs linked to this item
      const { data: links } = await supabase
        .from('item_modifier_groups')
        .select('modifier_group_id')
        .eq('menu_item_id', selectedItem!.id);

      if (!links || links.length === 0) {
        setModifierGroups([]);
        return;
      }

      const groupIds = links.map((l) => l.modifier_group_id);
      const { data: groups } = await supabase
        .from('modifier_groups')
        .select('*')
        .in('id', groupIds)
        .order('display_order');

      if (!groups) { setModifierGroups([]); return; }

      // Fetch modifiers for each group
      const { data: mods } = await supabase
        .from('modifiers')
        .select('*')
        .in('group_id', groupIds)
        .eq('is_available', true);

      const groupsWithMods = groups.map((g) => ({
        ...g,
        modifiers: (mods || []).filter((m) => m.group_id === g.id),
      }));

      setModifierGroups(groupsWithMods);
    }
    fetchModifiers();
  }, [selectedItem]);

  const filteredItems = menuItems.filter((item) => item.category_id === activeCategory);
  const isEventFree = activeEvent?.is_all_free || false;

  function handleAddToCart(modifiers: Modifier[], instructions: string) {
    if (!selectedItem) return;
    cartStore.addItem(selectedItem, modifiers, instructions, isEventFree);
    setSelectedItem(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-light font-body">Loading menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <AccessCountdown />
      {/* Header */}
      <header className="bg-surface border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-primary">LOTG Coffee</h1>
            {activeEvent && (
              <p className="text-xs font-accent text-warm mt-0.5">
                {activeEvent.name}
                {isEventFree && ' — Everything Free!'}
              </p>
            )}
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative bg-primary text-white rounded-full px-5 py-2.5 font-accent font-semibold text-sm transition-all hover:bg-primary-light cursor-pointer"
          >
            Order
            {cart.itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-success text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {cart.itemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Category Tabs */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <CategoryTabs
          categories={categories}
          activeId={activeCategory}
          onSelect={setActiveCategory}
        />
      </div>

      {/* Menu Grid */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-light">No items in this category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                eventFree={isEventFree}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Mobile cart button (fixed bottom) */}
      {cart.itemCount > 0 && !cartOpen && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface/90 backdrop-blur-sm border-t border-gray-100 sm:hidden z-30">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full bg-primary text-white rounded-full py-3 font-accent font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            View Order ({cart.itemCount})
          </button>
        </div>
      )}

      {/* Modifier Modal */}
      {selectedItem && (
        <ModifierSelector
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          item={selectedItem}
          modifierGroups={modifierGroups}
          onAddToCart={handleAddToCart}
        />
      )}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false);
          router.push('/checkout');
        }}
      />
    </div>
  );
}
