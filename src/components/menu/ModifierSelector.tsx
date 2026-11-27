'use client';

import { useState, useRef, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Card';
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
  /**
   * The drink's options are still on their way. Until they land, "Add to Order" stays
   * down — otherwise a quick tap adds a latte with no size and no milk, because a sheet
   * with no groups in it has no required groups to fail.
   */
  loading?: boolean;
  eventFree?: boolean;
  /**
   * Options to start ticked — the drink of the day's build, opened from the menu's
   * featured card. Everything else about the sheet is unchanged, which is the point:
   * the special is an ordinary drink someone has already filled part of in.
   */
  preselectIds?: string[];
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

/**
 * Each group's starting choice: its locked options (always included) plus any available
 * default, then the drink of the day's build overriding that where it says something.
 */
function seedSelections(
  modifierGroups: ModifierGroup[],
  preselectIds: string[] | undefined,
): Record<string, Modifier[]> {
  const initial: Record<string, Modifier[]> = {};
  const wanted = new Set(preselectIds ?? []);

  modifierGroups.forEach((group) => {
    const locked = lockedModifiers(group);
    const selectable = selectableModifiers(group);
    // Only options this drink actually offers and can actually make. A special whose
    // syrup was 86'd can't be ordered at all (the card says so), but a build naming an
    // option that's since been hidden on this drink must not tick a phantom.
    const asked = selectable.filter((m) => wanted.has(m.id));

    if (group.allow_multiple) {
      const defaults = selectable.filter((m) => m.is_default);
      initial[group.id] = asked.length > 0 ? [...locked, ...asked] : [...locked, ...defaults];
      return;
    }

    // Single-select: a locked option wins outright and can't be swapped — not even by
    // the special, which is a suggestion and not a rule.
    if (locked.length > 0) {
      initial[group.id] = [locked[0]];
      return;
    }
    if (asked.length > 0) {
      initial[group.id] = [asked[0]];
      return;
    }
    const defaultMod = selectable.find((m) => m.is_default);
    initial[group.id] = defaultMod ? [defaultMod] : [];
  });

  return initial;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default function ModifierSelector({
  isOpen,
  onClose,
  item,
  modifierGroups,
  loading = false,
  eventFree,
  preselectIds,
  onAddToCart,
}: ModifierSelectorProps) {
  const [selections, setSelections] = useState<Record<string, Modifier[]>>(() =>
    seedSelections(modifierGroups, preselectIds),
  );
  const [instructions, setInstructions] = useState('');
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});
  /** Groups the customer tried to skip — highlighted after a tap on a disabled Add. */
  const [nudged, setNudged] = useState(false);
  /**
   * "This sheet has already added its drink."
   *
   * Closing the sheet is a state change, so the button stays mounted and live for the
   * rest of the tap's frame — two quick taps on "Add to Order" would add the same drink
   * twice, landing as a second line on the checkout list that's easy to pay for without
   * noticing. Reset below whenever the sheet is re-seeded for a new drink.
   */
  const added = useRef(false);

  // Re-seed whenever the sheet opens on a drink, or that drink's options arrive. Done
  // during render (React's "adjust state when a prop changes" pattern) rather than in an
  // effect, so the sheet never paints one frame of the previous drink's choices.
  const seedKey = { isOpen, itemId: item.id, modifierGroups, preselectIds };
  const [seededFor, setSeededFor] = useState(seedKey);
  if (
    seededFor.isOpen !== isOpen ||
    seededFor.itemId !== item.id ||
    seededFor.modifierGroups !== modifierGroups ||
    seededFor.preselectIds !== preselectIds
  ) {
    setSeededFor(seedKey);
    if (isOpen) {
      setSelections(seedSelections(modifierGroups, preselectIds));
      // Instructions survive the options arriving a moment after the sheet opened —
      // only a different drink, or reopening, starts them over.
      if (seededFor.itemId !== item.id || !seededFor.isOpen) setInstructions('');
      setGroupSearch({});
      setNudged(false);
    }
  }
  useEffect(() => {
    if (isOpen) added.current = false;
  }, [isOpen, item.id]);

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

  const blockedGroup = modifierGroups.find(isGroupBlocked);
  const missingGroups = modifierGroups.filter(
    (g) => g.is_required && (selections[g.id] || []).length === 0,
  );
  const canAdd = !loading && missingGroups.length === 0 && !blockedGroup && !item.is_sold_out;

  function handleAdd() {
    if (!canAdd) {
      // Say what's missing rather than leaving a dead button — and take them to it.
      setNudged(true);
      const first = missingGroups[0];
      if (first) {
        document
          .getElementById(`modgroup-${first.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    if (added.current) return;
    added.current = true;
    onAddToCart(Object.values(selections).flat(), instructions);
    onClose();
  }

  const modifierTotal = Object.values(selections)
    .flat()
    .reduce((sum, m) => sum + (eventFree ? 0 : m.price_adjustment), 0);
  const basePrice = eventFree ? 0 : item.is_free ? 0 : item.base_price;
  const totalPrice = basePrice + modifierTotal;

  const footerContent = (
    <div className="border-t border-gray-100 bg-surface px-5 pb-4 pt-3">
      {nudged && missingGroups.length > 0 && (
        <p className="mb-2 animate-rise text-center font-accent text-sm font-semibold text-danger" role="alert">
          Choose {missingGroups.map((g) => g.name.toLowerCase()).join(' and ')} first
        </p>
      )}
      <Button
        onClick={handleAdd}
        // Only truly dead when there's nothing the customer could do about it. A missing
        // choice keeps the button live, so the tap can say what's missing.
        disabled={loading || !!blockedGroup || item.is_sold_out}
        aria-disabled={!canAdd}
        size="lg"
        fullWidth
        className={cn(!canAdd && !loading && 'opacity-60')}
      >
        <span className="flex w-full items-center justify-between gap-3">
          <span>{loading ? 'Loading options…' : 'Add to Order'}</span>
          <span className="font-heading tabular-nums">{totalPrice === 0 ? 'Free' : money(totalPrice)}</span>
        </span>
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item.name}
      subtitle={item.description || undefined}
      size="md"
      footer={footerContent}
    >
      {blockedGroup && (
        <div className="mb-4 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="font-accent text-sm font-semibold text-danger">
            We&apos;re out of every {blockedGroup.name.toLowerCase()} option
          </p>
          <p className="mt-0.5 font-body text-xs text-danger/80">
            This drink can&apos;t be made right now. Please pick something else.
          </p>
        </div>
      )}

      {loading && modifierGroups.length === 0 ? (
        <div className="space-y-6" aria-label="Loading options">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton className="mb-3 h-4 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-11 w-20" />
                <Skeleton className="h-11 w-24" />
                <Skeleton className="h-11 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : (
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
            const chosen = (selections[group.id] || []).length > 0;
            const flagged = nudged && group.is_required && !chosen;

            return (
              <section
                key={group.id}
                id={`modgroup-${group.id}`}
                className={cn(
                  'scroll-mt-4 rounded-2xl transition-[background-color,box-shadow] duration-300',
                  flagged && '-m-3 bg-danger/5 p-3 ring-2 ring-danger/40',
                )}
              >
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-[17px] font-semibold text-text-dark">{group.name}</h3>
                  {group.is_required ? (
                    chosen ? (
                      <span className="inline-flex animate-check items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-accent text-[11px] font-semibold text-success">
                        ✓ Done
                      </span>
                    ) : (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 font-accent text-[11px] font-semibold text-danger">
                        Required
                      </span>
                    )
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 font-accent text-[11px] font-medium text-text-light">
                      {group.allow_multiple ? 'Pick any' : 'Optional'}
                    </span>
                  )}
                </div>

                {/* Locked options — always included on this drink */}
                {locked.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {locked.map((mod) => (
                      <span
                        key={mod.id}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 font-body text-sm font-medium text-primary"
                        title="Always included with this drink"
                      >
                        <span className="text-xs">🔒</span>
                        {mod.name}
                        {/* A locked option can still cost money — never hide that. */}
                        {mod.price_adjustment > 0 && !eventFree && (
                          <span className="font-accent text-xs">+{money(mod.price_adjustment)}</span>
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
                  <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-gray-200">
                    <div className="border-b border-gray-100 p-2">
                      <input
                        type="search"
                        placeholder={`Search ${group.name.toLowerCase()}…`}
                        value={query}
                        onChange={(e) =>
                          setGroupSearch((prev) => ({ ...prev, [group.id]: e.target.value }))
                        }
                        // 16px, not 14: anything smaller makes iOS Safari zoom the whole
                        // page in when the box is tapped, and it doesn't zoom back out.
                        className="w-full rounded-xl border border-transparent bg-gray-100 px-3 py-2 font-body text-base text-text-dark placeholder:text-text-light focus:bg-surface focus:outline-none"
                      />
                    </div>

                    {removableChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-b border-gray-100 bg-primary/5 px-3 py-2">
                        {removableChips.map((mod) => (
                          <span
                            key={mod.id}
                            className="inline-flex animate-check items-center gap-1 rounded-full bg-primary py-1 pl-3 pr-1 font-body text-xs font-medium text-white"
                          >
                            {mod.name}
                            {mod.price_adjustment > 0 && !eventFree && (
                              <span className="opacity-75">+{money(mod.price_adjustment)}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeSelection(group.id, mod)}
                              aria-label={`Remove ${mod.name}`}
                              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full hover:bg-white/20"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="max-h-56 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
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
                              aria-pressed={selected}
                              onClick={() => toggleModifier(group, modifier)}
                              className={cn(
                                'flex w-full touch-manipulation items-center justify-between px-4 py-3 text-left font-body text-[15px] transition-colors duration-150',
                                soldOut
                                  ? 'cursor-not-allowed text-text-light'
                                  : selected
                                    ? 'cursor-pointer bg-primary/[0.06] font-semibold text-primary'
                                    : 'cursor-pointer text-text-dark hover:bg-gray-50 active:bg-gray-100',
                              )}
                            >
                              <span className="flex items-center gap-2.5">
                                <CheckBox on={selected && !soldOut} muted={soldOut} />
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
                                    +{money(modifier.price_adjustment)}
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
                  /* Small group — big tappable pills */
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {visibleMods.map((modifier) => {
                      const soldOut = modifier.is_sold_out;
                      const selected = isSelected(group.id, modifier.id);

                      return (
                        <button
                          key={modifier.id}
                          type="button"
                          disabled={soldOut}
                          aria-pressed={selected}
                          onClick={() => toggleModifier(group, modifier)}
                          className={cn(
                            'pressable relative flex min-h-[3.25rem] flex-col items-start justify-center rounded-2xl border-2 px-3.5 py-2 text-left font-body text-[15px]',
                            soldOut
                              ? 'cursor-not-allowed border-transparent bg-gray-50 text-text-light'
                              : selected
                                ? 'cursor-pointer border-primary bg-primary/[0.07] text-primary'
                                : 'cursor-pointer border-transparent bg-gray-100 text-text-dark hover:bg-gray-200/70',
                          )}
                        >
                          <span className={cn('pr-6 font-semibold leading-tight', soldOut && 'line-through')}>
                            {modifier.name}
                          </span>
                          {soldOut ? (
                            <span className="font-accent text-xs font-semibold text-danger">Sold out</span>
                          ) : (
                            modifier.price_adjustment > 0 &&
                            !eventFree && (
                              <span className="text-[13px] opacity-75 tabular-nums">+{money(modifier.price_adjustment)}</span>
                            )
                          )}
                          {selected && !soldOut && (
                            <span
                              aria-hidden
                              className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 animate-check items-center justify-center rounded-full bg-primary text-white"
                            >
                              <CheckGlyph />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          <TextArea
            label="Special instructions"
            placeholder="Extra hot, light ice, anything else…"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
          />
        </div>
      )}
    </Modal>
  );
}

/** The iOS list checkmark: an empty ring that fills and springs a tick in. */
function CheckBox({ on, muted }: { on: boolean; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color] duration-200',
        muted ? 'border-gray-200 bg-gray-100' : on ? 'border-primary bg-primary' : 'border-gray-300',
      )}
    >
      {on && (
        <span className="animate-check text-white">
          <CheckGlyph />
        </span>
      )}
    </span>
  );
}

function CheckGlyph() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}
