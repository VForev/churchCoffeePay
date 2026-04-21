'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import type { MenuItem, ModifierGroup, Modifier } from '@/types';

const DROPDOWN_THRESHOLD = 8; // groups with this many+ options get a searchable list

interface ModifierSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem;
  modifierGroups: ModifierGroup[];
  eventFree?: boolean;
  onAddToCart: (selectedModifiers: Modifier[], specialInstructions: string) => void;
}

export default function ModifierSelector({
  isOpen,
  onClose,
  item,
  modifierGroups,
  eventFree,
  onAddToCart,
}: ModifierSelectorProps) {
  const [selections, setSelections] = useState<Record<string, Modifier[]>>({});
  const [instructions, setInstructions] = useState('');
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});

  // Initialize defaults when item changes
  useEffect(() => {
    if (!isOpen) return;
    const defaults: Record<string, Modifier[]> = {};
    modifierGroups.forEach((group) => {
      const defaultMod = group.modifiers?.find((m) => m.is_default && m.is_available);
      if (defaultMod) {
        defaults[group.id] = [defaultMod];
      }
    });
    setSelections(defaults);
    setInstructions('');
    setGroupSearch({});
  }, [isOpen, item.id, modifierGroups]);

  function toggleModifier(group: ModifierGroup, modifier: Modifier) {
    setSelections((prev) => {
      const current = prev[group.id] || [];
      if (group.allow_multiple) {
        const exists = current.find((m) => m.id === modifier.id);
        if (exists) {
          return { ...prev, [group.id]: current.filter((m) => m.id !== modifier.id) };
        }
        return { ...prev, [group.id]: [...current, modifier] };
      }
      return { ...prev, [group.id]: [modifier] };
    });
  }

  function isSelected(groupId: string, modifierId: string): boolean {
    return (selections[groupId] || []).some((m) => m.id === modifierId);
  }

  function removeSelection(groupId: string, modifierId: string) {
    setSelections((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] || []).filter((m) => m.id !== modifierId),
    }));
  }

  function handleAdd() {
    const allModifiers = Object.values(selections).flat();
    onAddToCart(allModifiers, instructions);
    onClose();
  }

  const requiredMet = modifierGroups
    .filter((g) => g.is_required)
    .every((g) => (selections[g.id] || []).length > 0);

  const modifierTotal = Object.values(selections)
    .flat()
    .reduce((sum, m) => sum + (eventFree ? 0 : m.price_adjustment), 0);
  const basePrice = eventFree ? 0 : (item.is_free ? 0 : item.base_price);
  const totalPrice = basePrice + modifierTotal;

  const footerContent = (
    <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
      <div className="text-lg font-heading font-bold text-text-dark">
        {totalPrice === 0 ? (
          <span className="text-success">Free</span>
        ) : (
          <span>${totalPrice.toFixed(2)}</span>
        )}
      </div>
      <Button onClick={handleAdd} disabled={!requiredMet} size="lg">
        Add to Order
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} size="md" footer={footerContent}>
      {item.description && (
        <p className="text-text-light text-sm mb-4">{item.description}</p>
      )}

      <div className="space-y-6">
        {modifierGroups.map((group) => {
          const availableMods = group.modifiers?.filter((m) => m.is_available) || [];
          const useLargeList = availableMods.length >= DROPDOWN_THRESHOLD;
          const query = groupSearch[group.id] || '';
          const filteredMods = useLargeList
            ? availableMods.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
            : availableMods;
          const selectedInGroup = selections[group.id] || [];

          return (
            <div key={group.id}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-accent font-semibold text-text-dark text-sm">{group.name}</h3>
                {group.is_required && (
                  <span className="text-xs text-danger font-accent">Required</span>
                )}
                {group.allow_multiple && (
                  <span className="text-xs text-text-light font-accent">Select multiple</span>
                )}
              </div>

              {useLargeList ? (
                /* Large group — searchable scrollable list */
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Search input */}
                  <div className="p-2 border-b border-gray-100 bg-gray-50">
                    <input
                      type="text"
                      placeholder={`Search ${group.name.toLowerCase()}...`}
                      value={query}
                      onChange={(e) => setGroupSearch((prev) => ({ ...prev, [group.id]: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-surface text-sm font-body text-text-dark placeholder:text-text-light focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Selected chips */}
                  {selectedInGroup.length > 0 && (
                    <div className="px-3 py-2 flex flex-wrap gap-1.5 border-b border-gray-100 bg-primary/5">
                      {selectedInGroup.map((mod) => (
                        <span
                          key={mod.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary text-white text-xs font-body rounded-full"
                        >
                          {mod.name}
                          {mod.price_adjustment > 0 && !eventFree && (
                            <span className="opacity-75">+${mod.price_adjustment.toFixed(2)}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeSelection(group.id, mod.id)}
                            className="ml-0.5 hover:opacity-75 cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Scrollable option list */}
                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                    {filteredMods.length === 0 ? (
                      <p className="p-3 text-sm text-text-light text-center">No results</p>
                    ) : (
                      filteredMods.map((modifier) => {
                        const selected = isSelected(group.id, modifier.id);
                        return (
                          <button
                            key={modifier.id}
                            type="button"
                            onClick={() => toggleModifier(group, modifier)}
                            className={cn(
                              'w-full flex items-center justify-between px-4 py-2.5 text-sm font-body transition-colors cursor-pointer touch-manipulation text-left',
                              selected
                                ? 'bg-primary/10 text-primary font-semibold'
                                : 'hover:bg-gray-50 text-text',
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                                  selected ? 'bg-primary border-primary' : 'border-gray-300',
                                )}
                              >
                                {selected && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </span>
                              {modifier.name}
                            </span>
                            {modifier.price_adjustment > 0 && !eventFree && (
                              <span className="text-xs text-primary font-accent ml-2 shrink-0">
                                +${modifier.price_adjustment.toFixed(2)}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* Small group — button grid */
                <div className="flex flex-wrap gap-2">
                  {availableMods.map((modifier) => (
                    <button
                      key={modifier.id}
                      type="button"
                      onClick={() => toggleModifier(group, modifier)}
                      className={cn(
                        'px-3 py-2 rounded-xl text-sm font-body transition-all duration-200 border-2 cursor-pointer touch-manipulation',
                        isSelected(group.id, modifier.id)
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface text-text border-gray-200 hover:border-primary/30',
                      )}
                    >
                      {modifier.name}
                      {modifier.price_adjustment > 0 && !eventFree && (
                        <span className="ml-1 text-xs opacity-75">
                          +${modifier.price_adjustment.toFixed(2)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <TextArea
          label="Special Instructions"
          placeholder="Any special requests..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={2}
        />
      </div>
    </Modal>
  );
}
