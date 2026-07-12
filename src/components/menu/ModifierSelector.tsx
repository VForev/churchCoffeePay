'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { selectableModifiers, lockedModifiers } from '@/lib/menu';
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

/**
 * A required group is unfillable when every one of its options is sold out —
 * you can't make the drink, so the whole item has to be blocked.
 */
function isGroupBlocked(group: ModifierGroup): boolean {
  if (!group.is_required) return false;
  return selectableModifiers(group).length === 0 && lockedModifiers(group).length === 0;
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

  // Seed each group with its locked options (always included) plus any available default.
  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, Modifier[]> = {};

    modifierGroups.forEach((group) => {
      const locked = lockedModifiers(group);
      const selectable = selectableModifiers(group);

      if (group.allow_multiple) {
        const defaults = selectable.filter((m) => m.is_default);
        initial[group.id] = [...locked, ...defaults];
        return;
      }

      // Single-select: a locked option wins outright and can't be swapped.
      if (locked.length > 0) {
        initial[group.id] = [locked[0]];
        return;
      }
      const defaultMod = selectable.find((m) => m.is_default);
      initial[group.id] = defaultMod ? [defaultMod] : [];
    });

    setSelections(initial);
    setInstructions('');
    setGroupSearch({});
  }, [isOpen, item.id, modifierGroups]);

  function toggleModifier(group: ModifierGroup, modifier: Modifier) {
    if (modifier.is_locked || modifier.is_sold_out) return;

    setSelections((prev) => {
      const current = prev[group.id] || [];

      if (group.allow_multiple) {
        const exists = current.some((m) => m.id === modifier.id);
        return {
          ...prev,
          [group.id]: exists
            ? current.filter((m) => m.id !== modifier.id)
            : [...current, modifier],
        };
      }

      // Single-select: replace the choice but keep any locked option in place.
      const locked = current.filter((m) => m.is_locked);
      if (locked.length > 0) return prev;
      return { ...prev, [group.id]: [modifier] };
    });
  }

  function isSelected(groupId: string, modifierId: string): boolean {
    return (selections[groupId] || []).some((m) => m.id === modifierId);
  }

  function removeSelection(groupId: string, modifier: Modifier) {
    if (modifier.is_locked) return;
    setSelections((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] || []).filter((m) => m.id !== modifier.id),
    }));
  }

  function handleAdd() {
    onAddToCart(Object.values(selections).flat(), instructions);
    onClose();
  }

  const blockedGroup = modifierGroups.find(isGroupBlocked);
  const requiredMet = modifierGroups
    .filter((g) => g.is_required)
    .every((g) => (selections[g.id] || []).length > 0);
  const canAdd = requiredMet && !blockedGroup && !item.is_sold_out;

  const modifierTotal = Object.values(selections)
    .flat()
    .reduce((sum, m) => sum + (eventFree ? 0 : m.price_adjustment), 0);
  const basePrice = eventFree ? 0 : item.is_free ? 0 : item.base_price;
  const totalPrice = basePrice + modifierTotal;

  const footerContent = (
    <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
      <div className="font-heading text-lg font-bold text-text-dark">
        {totalPrice === 0 ? <span className="text-success">Free</span> : <span>${totalPrice.toFixed(2)}</span>}
      </div>
      <Button onClick={handleAdd} disabled={!canAdd} size="lg">
        Add to Order
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} size="md" footer={footerContent}>
      {item.description && <p className="mb-4 text-sm text-text-light">{item.description}</p>}

      {blockedGroup && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="font-accent text-sm font-semibold text-danger">
            We&apos;re out of every {blockedGroup.name.toLowerCase()} option
          </p>
          <p className="mt-0.5 font-body text-xs text-danger/80">
            This drink can&apos;t be made right now. Please pick something else.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {modifierGroups.map((group) => {
          const allMods = group.modifiers ?? [];
          const locked = lockedModifiers(group);
          const choosable = allMods.filter((m) => !m.is_locked);
          const useLargeList = choosable.length >= DROPDOWN_THRESHOLD;
          const query = groupSearch[group.id] || '';
          const visibleMods = useLargeList
            ? choosable.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
            : choosable;
          // Locked options are shown separately as "included", not as removable chips.
          const removableChips = (selections[group.id] || []).filter((m) => !m.is_locked);

          return (
            <div key={group.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-accent text-sm font-semibold text-text-dark">{group.name}</h3>
                {group.is_required && <span className="font-accent text-xs text-danger">Required</span>}
                {group.allow_multiple && (
                  <span className="font-accent text-xs text-text-light">Select multiple</span>
                )}
              </div>

              {/* Locked options — always included on this drink */}
              {locked.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {locked.map((mod) => (
                    <span
                      key={mod.id}
                      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-primary/25 bg-primary/10 px-3 py-2 font-body text-sm text-primary"
                      title="Always included with this drink"
                    >
                      <span className="text-xs">🔒</span>
                      {mod.name}
                      {/* A locked option can still cost money — never hide that. */}
                      {mod.price_adjustment > 0 && !eventFree && (
                        <span className="font-accent text-xs">
                          +${mod.price_adjustment.toFixed(2)}
                        </span>
                      )}
                      <span className="font-accent text-xs opacity-70">Included</span>
                    </span>
                  ))}
                </div>
              )}

              {choosable.length === 0 ? (
                locked.length === 0 && (
                  <p className="font-body text-sm text-text-light">No options available</p>
                )
              ) : useLargeList ? (
                /* Large group — searchable scrollable list */
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="border-b border-gray-100 bg-gray-50 p-2">
                    <input
                      type="text"
                      placeholder={`Search ${group.name.toLowerCase()}...`}
                      value={query}
                      onChange={(e) =>
                        setGroupSearch((prev) => ({ ...prev, [group.id]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-1.5 font-body text-sm text-text-dark placeholder:text-text-light focus:border-primary focus:outline-none"
                    />
                  </div>

                  {removableChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 border-b border-gray-100 bg-primary/5 px-3 py-2">
                      {removableChips.map((mod) => (
                        <span
                          key={mod.id}
                          className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-body text-xs text-white"
                        >
                          {mod.name}
                          {mod.price_adjustment > 0 && !eventFree && (
                            <span className="opacity-75">+${mod.price_adjustment.toFixed(2)}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeSelection(group.id, mod)}
                            className="ml-0.5 cursor-pointer hover:opacity-75"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="max-h-48 divide-y divide-gray-50 overflow-y-auto">
                    {visibleMods.length === 0 ? (
                      <p className="p-3 text-center text-sm text-text-light">No results</p>
                    ) : (
                      visibleMods.map((modifier) => {
                        const selected = isSelected(group.id, modifier.id);
                        const soldOut = modifier.is_sold_out;

                        return (
                          <button
                            key={modifier.id}
                            type="button"
                            disabled={soldOut}
                            onClick={() => toggleModifier(group, modifier)}
                            className={cn(
                              'flex w-full touch-manipulation items-center justify-between px-4 py-2.5 text-left font-body text-sm transition-colors',
                              soldOut
                                ? 'cursor-not-allowed bg-gray-50/50 text-text-light'
                                : selected
                                  ? 'cursor-pointer bg-primary/10 font-semibold text-primary'
                                  : 'cursor-pointer text-text hover:bg-gray-50',
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2',
                                  soldOut
                                    ? 'border-gray-200 bg-gray-100'
                                    : selected
                                      ? 'border-primary bg-primary'
                                      : 'border-gray-300',
                                )}
                              >
                                {selected && !soldOut && (
                                  <svg
                                    className="h-2.5 w-2.5 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className={cn(soldOut && 'line-through')}>{modifier.name}</span>
                            </span>

                            {soldOut ? (
                              <span className="ml-2 shrink-0 font-accent text-xs font-semibold text-danger">
                                Sold out
                              </span>
                            ) : (
                              modifier.price_adjustment > 0 &&
                              !eventFree && (
                                <span className="ml-2 shrink-0 font-accent text-xs text-primary">
                                  +${modifier.price_adjustment.toFixed(2)}
                                </span>
                              )
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
                  {visibleMods.map((modifier) => {
                    const soldOut = modifier.is_sold_out;
                    const selected = isSelected(group.id, modifier.id);

                    return (
                      <button
                        key={modifier.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => toggleModifier(group, modifier)}
                        className={cn(
                          'touch-manipulation rounded-xl border-2 px-3 py-2 font-body text-sm transition-all duration-200',
                          soldOut
                            ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-text-light'
                            : selected
                              ? 'cursor-pointer border-primary bg-primary text-white'
                              : 'cursor-pointer border-gray-200 bg-surface text-text hover:border-primary/30',
                        )}
                      >
                        <span className={cn(soldOut && 'line-through')}>{modifier.name}</span>
                        {soldOut ? (
                          <span className="ml-1.5 font-accent text-xs font-semibold text-danger">
                            Sold out
                          </span>
                        ) : (
                          modifier.price_adjustment > 0 &&
                          !eventFree && (
                            <span className="ml-1 text-xs opacity-75">
                              +${modifier.price_adjustment.toFixed(2)}
                            </span>
                          )
                        )}
                      </button>
                    );
                  })}
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
