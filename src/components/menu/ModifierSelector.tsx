'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { springPop, springSnappy } from '@/lib/motion';
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

/** SF Symbols checkmark — iOS marks a chosen row with this, on the trailing edge. */
function Checkmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('h-4 w-4', className)} fill="none">
      <path
        d="M2.5 8.5l3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
    <div className="material-thick hairline-t flex items-center justify-between gap-4 px-5 py-4">
      <div className="text-ios-title3 tnum text-label">
        {totalPrice === 0 ? (
          <span className="text-success">Free</span>
        ) : (
          // Keyed so the price re-pops whenever it changes — the feedback that
          // ties a chosen syrup to the number the customer is about to pay.
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={totalPrice}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={springPop}
              className="inline-block"
            >
              ${totalPrice.toFixed(2)}
            </motion.span>
          </AnimatePresence>
        )}
      </div>
      <Button onClick={handleAdd} disabled={!canAdd} size="lg">
        Add to Order
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} size="md" footer={footerContent}>
      {item.description && (
        <p className="text-ios-subhead mb-5 text-label-secondary">{item.description}</p>
      )}

      {blockedGroup && (
        <div className="mb-5 rounded-[var(--r-lg)] bg-danger/12 px-4 py-3 ring-1 ring-danger/25">
          <p className="text-ios-subhead font-semibold text-danger">
            We&apos;re out of every {blockedGroup.name.toLowerCase()} option
          </p>
          <p className="text-ios-footnote mt-0.5 text-danger/80">
            This drink can&apos;t be made right now. Please pick something else.
          </p>
        </div>
      )}

      <div className="space-y-7">
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
              <div className="mb-2 flex flex-wrap items-baseline gap-2 px-1">
                <h3 className="text-ios-headline text-label">{group.name}</h3>
                {group.is_required && (
                  <span className="text-ios-footnote font-medium text-danger">Required</span>
                )}
                {group.allow_multiple && (
                  <span className="text-ios-footnote text-label-tertiary">Select multiple</span>
                )}
              </div>

              {/* Locked options — always included on this drink */}
              {locked.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {locked.map((mod) => (
                    <span
                      key={mod.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3.5 py-2 text-[15px] text-primary"
                      title="Always included with this drink"
                    >
                      <span className="text-[11px]">🔒</span>
                      {mod.name}
                      {/* A locked option can still cost money — never hide that. */}
                      {mod.price_adjustment > 0 && !eventFree && (
                        <span className="tnum text-[13px]">
                          +${mod.price_adjustment.toFixed(2)}
                        </span>
                      )}
                      <span className="text-[13px] opacity-70">Included</span>
                    </span>
                  ))}
                </div>
              )}

              {choosable.length === 0 ? (
                locked.length === 0 && (
                  <p className="text-ios-subhead px-1 text-label-tertiary">No options available</p>
                )
              ) : useLargeList ? (
                /* Large group — searchable grouped list */
                <div className="overflow-hidden rounded-[var(--r-lg)] bg-surface shadow-sm">
                  <div className="hairline-b p-2.5">
                    <div className="relative">
                      {/* SF Symbols magnifyingglass, inset in the field like
                          the real iOS search bar. */}
                      <svg
                        viewBox="0 0 16 16"
                        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-label-tertiary"
                        fill="none"
                      >
                        <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.8" />
                        <path
                          d="M10.5 10.5L14 14"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                      <input
                        type="text"
                        placeholder={`Search ${group.name.toLowerCase()}`}
                        value={query}
                        onChange={(e) =>
                          setGroupSearch((prev) => ({ ...prev, [group.id]: e.target.value }))
                        }
                        className="w-full rounded-[var(--r-sm)] bg-fill-tertiary py-2 pl-8 pr-3 text-[16px] text-label placeholder:text-label-tertiary focus:outline-none focus:ring-2 focus:ring-primary/25"
                      />
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {removableChips.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={springSnappy}
                        className="hairline-b overflow-hidden bg-primary/6"
                      >
                        <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                          <AnimatePresence initial={false} mode="popLayout">
                            {removableChips.map((mod) => (
                              <motion.span
                                key={mod.id}
                                layout
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={springPop}
                                className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[13px] font-medium text-white"
                              >
                                {mod.name}
                                {mod.price_adjustment > 0 && !eventFree && (
                                  <span className="tnum opacity-75">
                                    +${mod.price_adjustment.toFixed(2)}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeSelection(group.id, mod)}
                                  aria-label={`Remove ${mod.name}`}
                                  className="ml-0.5 cursor-pointer opacity-80 hover:opacity-100"
                                >
                                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                                    <path
                                      d="M3 3l6 6M9 3l-6 6"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </button>
                              </motion.span>
                            ))}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="scroll-ios max-h-56 overflow-y-auto">
                    {visibleMods.length === 0 ? (
                      <p className="text-ios-subhead p-4 text-center text-label-tertiary">
                        No results
                      </p>
                    ) : (
                      visibleMods.map((modifier) => {
                        const selected = isSelected(group.id, modifier.id);
                        const soldOut = modifier.is_sold_out;

                        return (
                          <motion.button
                            key={modifier.id}
                            type="button"
                            disabled={soldOut}
                            whileTap={soldOut ? undefined : { backgroundColor: 'var(--fill-tertiary)' }}
                            transition={{ duration: 0.1 }}
                            onClick={() => toggleModifier(group, modifier)}
                            className={cn(
                              'relative flex w-full touch-manipulation items-center justify-between gap-3 px-4 py-3 text-left text-[17px]',
                              'before:absolute before:bottom-0 before:left-4 before:right-0 before:h-px before:bg-separator last:before:hidden',
                              soldOut
                                ? 'cursor-not-allowed text-label-tertiary'
                                : 'cursor-pointer text-label',
                            )}
                          >
                            <span className={cn('min-w-0 truncate', soldOut && 'line-through')}>
                              {modifier.name}
                            </span>

                            <span className="flex shrink-0 items-center gap-2">
                              {soldOut ? (
                                <span className="text-ios-footnote font-medium text-danger">
                                  Sold out
                                </span>
                              ) : (
                                modifier.price_adjustment > 0 &&
                                !eventFree && (
                                  <span className="tnum text-ios-subhead text-label-secondary">
                                    +${modifier.price_adjustment.toFixed(2)}
                                  </span>
                                )
                              )}
                              <AnimatePresence>
                                {selected && !soldOut && (
                                  <motion.span
                                    initial={{ opacity: 0, scale: 0.4 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.4 }}
                                    transition={springPop}
                                    className="text-primary"
                                  >
                                    <Checkmark />
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </span>
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* Small group — chip row */
                <div className="flex flex-wrap gap-2">
                  {visibleMods.map((modifier) => {
                    const soldOut = modifier.is_sold_out;
                    const selected = isSelected(group.id, modifier.id);

                    return (
                      <motion.button
                        key={modifier.id}
                        type="button"
                        disabled={soldOut}
                        whileTap={soldOut ? undefined : { scale: 0.94 }}
                        transition={springSnappy}
                        onClick={() => toggleModifier(group, modifier)}
                        className={cn(
                          'touch-manipulation rounded-full px-4 py-2.5 text-[15px] font-medium',
                          'transition-colors duration-200 ease-[var(--ease-out-ios)]',
                          soldOut
                            ? 'cursor-not-allowed bg-fill-quaternary text-label-tertiary'
                            : selected
                              ? 'cursor-pointer bg-primary text-white shadow-sm'
                              : 'cursor-pointer bg-fill-tertiary text-label',
                        )}
                      >
                        <span className={cn(soldOut && 'line-through')}>{modifier.name}</span>
                        {soldOut ? (
                          <span className="ml-1.5 text-[13px] font-semibold text-danger">
                            Sold out
                          </span>
                        ) : (
                          modifier.price_adjustment > 0 &&
                          !eventFree && (
                            <span className="tnum ml-1.5 text-[13px] opacity-75">
                              +${modifier.price_adjustment.toFixed(2)}
                            </span>
                          )
                        )}
                      </motion.button>
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
