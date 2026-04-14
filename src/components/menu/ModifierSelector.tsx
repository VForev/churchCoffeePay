'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import type { MenuItem, ModifierGroup, Modifier } from '@/types';

interface ModifierSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem;
  modifierGroups: ModifierGroup[];
  onAddToCart: (selectedModifiers: Modifier[], specialInstructions: string) => void;
}

export default function ModifierSelector({
  isOpen,
  onClose,
  item,
  modifierGroups,
  onAddToCart,
}: ModifierSelectorProps) {
  const [selections, setSelections] = useState<Record<string, Modifier[]>>({});
  const [instructions, setInstructions] = useState('');

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
      // Single select
      return { ...prev, [group.id]: [modifier] };
    });
  }

  function isSelected(groupId: string, modifierId: string): boolean {
    return (selections[groupId] || []).some((m) => m.id === modifierId);
  }

  function handleAdd() {
    const allModifiers = Object.values(selections).flat();
    onAddToCart(allModifiers, instructions);
    onClose();
  }

  // Check required groups are selected
  const requiredMet = modifierGroups
    .filter((g) => g.is_required)
    .every((g) => (selections[g.id] || []).length > 0);

  const footerContent = (
    <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end">
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
        {modifierGroups.map((group) => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-accent font-semibold text-text-dark text-sm">
                {group.name}
              </h3>
              {group.is_required && (
                <span className="text-xs text-danger font-accent">Required</span>
              )}
              {group.allow_multiple && (
                <span className="text-xs text-text-light font-accent">Select multiple</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.modifiers
                ?.filter((m) => m.is_available)
                .map((modifier) => (
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
                  </button>
                ))}
            </div>
          </div>
        ))}

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
