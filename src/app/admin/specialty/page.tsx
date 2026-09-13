'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SpecialtyDrink from '@/components/menu/SpecialtyDrink';
import {
  DEFAULT_SPECIALTY,
  fetchSpecialty,
  saveSpecialty,
  type SpecialtySettings,
  type SpecialtyStyle,
} from '@/lib/specialty';
import type { Category, MenuItem, Modifier, ModifierGroup } from '@/types';

/**
 * Drink of the day.
 *
 * The special is an existing drink plus a build, which is why this page asks for a drink
 * and a set of add-ins rather than a name and a price: see src/lib/specialty.ts for what
 * that buys. The preview underneath is the real customer component, not a mock-up of it.
 */
export default function SpecialtyAdminPage() {
  const [saved, setSaved] = useState<SpecialtySettings>(DEFAULT_SPECIALTY);
  const [working, setWorking] = useState<SpecialtySettings>(DEFAULT_SPECIALTY);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState(false);

  const load = useCallback(async () => {
    const [special, itemRes, catRes, groupRes, modRes] = await Promise.all([
      fetchSpecialty(),
      supabase.from('menu_items').select('*').eq('is_available', true).order('display_order'),
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('modifier_groups').select('*').order('display_order'),
      supabase.from('modifiers').select('*').order('display_order'),
    ]);

    setSaved(special);
    setWorking(special);
    setItems((itemRes.data ?? []) as MenuItem[]);
    setCategories((catRes.data ?? []) as Category[]);
    setGroups((groupRes.data ?? []) as ModifierGroup[]);
    setModifiers((modRes.data ?? []) as Modifier[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = JSON.stringify(working) !== JSON.stringify(saved);

  function set<K extends keyof SpecialtySettings>(key: K, value: SpecialtySettings[K]) {
    setWorking((w) => ({ ...w, [key]: value }));
    setSavedNote(false);
  }

  function toggleModifier(id: string) {
    setWorking((w) => ({
      ...w,
      modifier_ids: w.modifier_ids.includes(id)
        ? w.modifier_ids.filter((x) => x !== id)
        : [...w.modifier_ids, id],
    }));
    setSavedNote(false);
  }

  const baseItem = items.find((i) => i.id === working.menu_item_id) ?? null;
  const build = useMemo(
    () =>
      working.modifier_ids
        .map((id) => modifiers.find((m) => m.id === id))
        .filter((m): m is Modifier => !!m),
    [working.modifier_ids, modifiers],
  );

  async function save() {
    setSaving(true);
    setError('');
    const res = await saveSpecialty(working);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Couldn’t save.');
      return;
    }
    setSaved(working);
    setSavedNote(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const incomplete = !working.name.trim() || !working.menu_item_id;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text-dark">Drink of the Day</h1>
        <p className="mt-1 font-body text-sm text-text-light">
          A seasonal drink at the top of the customer menu. It&apos;s an existing drink with
          its add-ins already chosen, so it costs what that drink costs, the customer can
          still change the milk, and it reaches the barista board as an ordinary order.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl bg-danger/10 px-5 py-4 font-body text-sm text-text">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ── The setter ─────────────────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={working.is_enabled}
                onChange={(e) => set('is_enabled', e.target.checked)}
                className="h-5 w-5 cursor-pointer accent-primary"
              />
              <span>
                <span className="block font-heading font-bold text-text-dark">
                  Show a drink of the day
                </span>
                <span className="block font-body text-xs text-text-light">
                  Off takes it off the menu everywhere, immediately. Nothing is lost.
                </span>
              </span>
            </label>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-heading font-bold text-text-dark">What it is</h2>

            <Input
              label="Name"
              placeholder="e.g. Maple Cinnamon Latte"
              value={working.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <p className="-mt-2 font-body text-xs text-text-light">
              Whatever you call it is what people say at the counter — easy to say out loud,
              hard to confuse with a regular drink.
            </p>

            <Input
              label="One line for the menu"
              placeholder="e.g. Maple, cinnamon, dusted on top"
              value={working.tagline}
              onChange={(e) => set('tagline', e.target.value)}
            />

            <Input
              label="The little chip above the name"
              placeholder="THIS SUNDAY"
              value={working.ribbon}
              onChange={(e) => set('ribbon', e.target.value)}
            />
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="font-heading font-bold text-text-dark">How it&apos;s made</h2>
              <p className="font-body text-xs text-text-light">
                Tapping the card opens the normal customization sheet with these already
                ticked.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block font-accent text-sm font-semibold text-text">
                Built on
              </label>
              <select
                value={working.menu_item_id ?? ''}
                onChange={(e) => set('menu_item_id', e.target.value || null)}
                className="w-full rounded-xl border-2 border-gray-200 bg-surface px-4 py-3 font-body text-text-dark focus:border-primary focus:outline-none"
              >
                <option value="">Pick a drink…</option>
                {categories.map((cat) => {
                  const inCat = items.filter((i) => i.category_id === cat.id);
                  if (inCat.length === 0) return null;
                  return (
                    <optgroup key={cat.id} label={cat.name}>
                      {inCat.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block font-accent text-sm font-semibold text-text">
                Add-ins that make it the special
              </label>
              <div className="space-y-3">
                {groups.map((group) => {
                  // Options an admin has removed entirely aren't build material; a barista's 86
                  // is different — the special can still be set up around it and just says so.
                  const opts = modifiers.filter((m) => m.group_id === group.id && m.is_available);
                  if (opts.length === 0) return null;
                  return (
                    <div key={group.id}>
                      <p className="mb-1.5 font-accent text-[11px] font-bold uppercase tracking-wide text-text-light">
                        {group.name}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {opts.map((m) => {
                          const on = working.modifier_ids.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleModifier(m.id)}
                              className={`cursor-pointer rounded-lg border-2 px-3 py-1.5 font-accent text-xs font-semibold transition-colors ${
                                on
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-gray-200 bg-surface text-text hover:border-primary/40'
                              }`}
                            >
                              {m.name}
                              {m.is_sold_out && <span className="ml-1 opacity-70">· 86</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 font-body text-xs text-text-light">
                Two is the sensible ceiling to start. Every extra pump is another step at
                the bar and another thing to run out of mid-service.
              </p>
            </div>

            <div className="rounded-xl border-l-4 border-danger bg-danger/5 px-4 py-3 font-body text-xs leading-relaxed text-text">
              <strong className="font-accent">
                86 the syrup and this card stops taking orders on its own.
              </strong>{' '}
              It stays on the menu, greyed out, saying what ran out — a card that silently
              vanishes just makes whoever came in for it ask the barista mid-rush. You will
              never advertise a drink the bar can&apos;t make.
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-heading font-bold text-text-dark">How it looks</h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    id: 'big' as SpecialtyStyle,
                    title: 'Big card',
                    blurb:
                      'The special is the point of the morning. Reads from across the room, and pushes the menu down.',
                  },
                  {
                    id: 'small' as SpecialtyStyle,
                    title: 'One line',
                    blurb:
                      'The rest of the time. Regulars outnumber browsers, and the drink they came for stays above the fold.',
                  },
                ] as const
              ).map((opt) => {
                const active = working.display_style === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => set('display_style', opt.id)}
                    className={`cursor-pointer rounded-2xl border-2 p-4 text-left transition-all ${
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 bg-surface hover:border-primary/40'
                    }`}
                  >
                    <span className="font-heading font-bold text-text-dark">{opt.title}</span>
                    <p className="mt-1 font-body text-xs leading-relaxed text-text-light">
                      {opt.blurb}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-heading font-bold text-text-dark">When it goes away</h2>

            <div>
              <label className="mb-1.5 block font-accent text-sm font-semibold text-text">
                Show until
              </label>
              <input
                type="date"
                value={working.show_until ?? ''}
                onChange={(e) => set('show_until', e.target.value || null)}
                className="rounded-xl border-2 border-gray-200 bg-surface px-4 py-3 font-body text-text-dark focus:border-primary focus:outline-none"
              />
              <p className="mt-1.5 font-body text-xs text-text-light">
                It takes itself off the menu after this day. Leave it empty to run until you
                switch it off — but nothing looks more abandoned than a &ldquo;this
                Sunday&rdquo; card three weeks later.
              </p>
            </div>

            <Input
              label="What the sold-out card says"
              placeholder="Back next Sunday"
              value={working.sold_out_note}
              onChange={(e) => set('sold_out_note', e.target.value)}
            />
          </Card>
        </div>

        {/* ── Preview ────────────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="bg-bg">
            <h2 className="mb-1 font-heading font-bold text-text-dark">On the menu</h2>
            <p className="mb-4 font-body text-xs text-text-light">
              The real card, not a picture of it.
            </p>

            {incomplete ? (
              <p className="rounded-xl bg-warning/10 px-4 py-3 font-body text-sm text-text">
                Give it a name and a drink to build it on, and it&apos;ll show up here.
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-wide text-text-light">
                    {working.display_style === 'big' ? 'Big card' : 'One line'}
                  </p>
                  <SpecialtyDrink
                    state={{
                      kind: 'ready',
                      settings: working,
                      item: baseItem as MenuItem,
                      modifiers: build,
                      soldOutName: null,
                    }}
                    onOrder={() => {}}
                  />
                </div>

                <div>
                  <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-wide text-text-light">
                    Once something runs out
                  </p>
                  <SpecialtyDrink
                    state={{
                      kind: 'sold_out',
                      settings: working,
                      item: baseItem as MenuItem,
                      modifiers: build,
                      soldOutName: build[0]?.name ?? baseItem?.name ?? null,
                    }}
                    onOrder={() => {}}
                  />
                </div>
              </div>
            )}
          </Card>

          {!working.is_enabled && !incomplete && (
            <p className="px-1 font-body text-xs text-text-light">
              Switched off — nobody sees this yet.
            </p>
          )}
        </div>
      </div>

      {/* ── Save ───────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 mt-6 -mx-4 flex flex-wrap items-center gap-3 border-t border-gray-100 bg-surface/95 px-4 py-4 backdrop-blur-sm">
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="ghost"
          className="border border-gray-200"
          disabled={!dirty}
          onClick={() => {
            setWorking(saved);
            setSavedNote(false);
          }}
        >
          Discard changes
        </Button>
        {savedNote && !dirty && (
          <span className="font-body text-sm text-success">
            Saved — every open phone has it already.
          </span>
        )}
      </div>
    </div>
  );
}
