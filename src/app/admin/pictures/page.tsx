'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ImagePicker from '@/components/admin/ImagePicker';
import ShopBanner from '@/components/ShopBanner';
import DrinkPicture from '@/components/menu/DrinkPicture';
import { BACKDROP_VEIL } from '@/components/PageBackdrop';
import { cn } from '@/lib/utils';
import { DEFAULT_SETTINGS, fetchShopConfig, getShopStatus } from '@/lib/shop';
import {
  DEFAULT_PICTURES,
  PICTURES_MIGRATION,
  cssImage,
  fetchPictures,
  safeImageUrl,
  savePictures,
  type DrinkMode,
  type SitePictures,
} from '@/lib/pictures';
import { setPicturesLocally } from '@/lib/use-pictures';
import type { Category, MenuItem, OrderingHours, ShopSettings } from '@/types';

const MODES: { id: DrinkMode; title: string; blurb: string }[] = [
  {
    id: 'icon',
    title: 'Photos, and a cup for the rest',
    blurb: 'Drinks with a photo show it. Drinks without one show a coffee cup.',
  },
  {
    id: 'default',
    title: 'Photos, and our picture for the rest',
    blurb: 'Drinks without a photo show one picture you choose — your logo, or a nice cup.',
  },
  {
    id: 'none',
    title: 'No pictures',
    blurb: 'A clean list of names. Quickest to read, and nothing to keep up to date.',
  },
];

/**
 * Every picture in the app, in one place.
 *
 * Two kinds of saving on this page, on purpose:
 *  - **The drinks grid saves as you go.** Choosing a drink's photo is one decision about
 *    one drink — making someone press Save after each of thirty would lose half of them.
 *  - **Everything else waits for Save**, like the rest of admin, because a banner or a
 *    background is worth looking at in the preview before every phone gets it.
 */
export default function PicturesAdminPage() {
  const [saved, setSaved] = useState<SitePictures>(DEFAULT_PICTURES);
  const [working, setWorking] = useState<SitePictures>(DEFAULT_PICTURES);
  const [migrated, setMigrated] = useState(true);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shop, setShop] = useState<{ settings: ShopSettings; hours: OrderingHours[] }>({
    settings: DEFAULT_SETTINGS,
    hours: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState(false);
  /** Per drink: 'saving' while its photo is being written, 'saved' briefly after. */
  const [drinkState, setDrinkState] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [pics, itemRes, catRes, config] = await Promise.all([
      fetchPictures(),
      supabase.from('menu_items').select('*').order('display_order'),
      supabase.from('categories').select('*').order('display_order'),
      fetchShopConfig(),
    ]);
    setSaved(pics.pictures);
    setWorking(pics.pictures);
    setMigrated(pics.migrated);
    setItems((itemRes.data ?? []) as MenuItem[]);
    setCategories((catRes.data ?? []) as Category[]);
    setShop(config);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Loads data; state is only set once the queries come back, which the rule can't see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const dirty = JSON.stringify(working) !== JSON.stringify(saved);

  function set<K extends keyof SitePictures>(key: K, value: SitePictures[K]) {
    setSavedNote(false);
    setWorking((w) => ({ ...w, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    const res = await savePictures(working);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Couldn’t save.');
      return;
    }
    setSaved(working);
    setSavedNote(true);
    setPicturesLocally(working);
  }

  async function setDrinkPhoto(item: MenuItem, url: string | null) {
    setDrinkState((s) => ({ ...s, [item.id]: 'saving' }));
    const { error: err } = await supabase.from('menu_items').update({ image_url: url }).eq('id', item.id);
    if (err) {
      setDrinkState((s) => ({ ...s, [item.id]: `Couldn’t save: ${err.message}` }));
      return;
    }
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, image_url: url } : i)));
    setDrinkState((s) => ({ ...s, [item.id]: 'saved' }));
    setTimeout(
      () => setDrinkState((s) => (s[item.id] === 'saved' ? { ...s, [item.id]: '' } : s)),
      2200,
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const withPhoto = items.filter((i) => safeImageUrl(i.image_url)).length;
  const status = getShopStatus(shop.settings, shop.hours);
  const sortedCats = [...categories].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="mx-auto max-w-5xl pb-4">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text-dark">Pictures</h1>
        <p className="mt-1 max-w-2xl font-body text-sm text-text-light">
          Photos for your drinks, a picture behind the banner, and backgrounds for the customer
          pages and the lobby TV. Everything here is optional — leave any of it empty and the
          app looks exactly as it does now.
        </p>
      </div>

      {!migrated && (
        <div className="mb-6 rounded-2xl border border-warning/40 bg-warning/10 px-5 py-4 font-body text-sm text-text">
          <strong className="font-semibold text-text-dark">One step first:</strong> run{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs">{PICTURES_MIGRATION}</code> in
          the Supabase SQL editor. Until then pictures can&apos;t be uploaded and the settings
          below can&apos;t be saved. Drink photos added as links still work.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-2xl bg-danger/10 px-5 py-4 font-body text-sm text-text">{error}</div>
      )}

      <div className="space-y-6">
        {/* ── How drinks look ─────────────────────────────────────────────── */}
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-heading text-lg font-bold text-text-dark">Drink pictures on the menu</h2>
            <p className="mt-0.5 font-body text-sm text-text-light">
              {withPhoto} of {items.length} drinks have a photo.
            </p>
          </div>

          <div role="radiogroup" className="grid gap-3 md:grid-cols-3">
            {MODES.map((mode) => {
              const on = working.drink_mode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('drink_mode', mode.id)}
                  className={cn(
                    'pressable flex cursor-pointer flex-col gap-3 rounded-2xl border-2 p-4 text-left',
                    on ? 'border-primary bg-primary/[0.06]' : 'border-transparent bg-gray-100 hover:bg-gray-200/60',
                  )}
                >
                  <ModeSample mode={mode.id} defaultImage={working.default_drink_image} />
                  <span>
                    <span className={cn('block font-heading font-semibold', on ? 'text-primary' : 'text-text-dark')}>
                      {mode.title}
                    </span>
                    <span className="mt-0.5 block font-body text-xs leading-relaxed text-text-light">
                      {mode.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {working.drink_mode === 'default' && (
            <div className="animate-rise rounded-2xl bg-gray-50 p-4">
              <ImagePicker
                label="Our picture, for drinks without their own"
                folder="drinks"
                value={working.default_drink_image}
                onChange={(url) => set('default_drink_image', url)}
                hint="Square works best. Until you choose one, those drinks show a cup."
              />
            </div>
          )}
        </Card>

        {/* ── Every drink ─────────────────────────────────────────────────── */}
        <Card className="p-5">
          <h2 className="font-heading text-lg font-bold text-text-dark">Each drink&apos;s photo</h2>
          <p className="mt-0.5 mb-4 font-body text-sm text-text-light">
            Tap a drink&apos;s picture to choose a photo. These save straight away — no need to
            press Save.
          </p>

          {sortedCats.map((cat) => {
            const catItems = items.filter((i) => i.category_id === cat.id);
            if (catItems.length === 0) return null;
            return (
              <div key={cat.id} className="mb-5 last:mb-0">
                <h3 className="mb-2 px-1 font-accent text-xs font-semibold text-text-light">{cat.name}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {catItems.map((item) => {
                    const st = drinkState[item.id];
                    return (
                      <div key={item.id} className="rounded-2xl border border-gray-100 bg-surface p-3">
                        <div className="mb-2 flex items-center justify-between gap-2 px-1">
                          <span className="truncate font-heading text-[15px] font-semibold text-text-dark">
                            {item.name}
                            {!item.is_available && (
                              <span className="ml-2 font-body text-xs font-normal text-text-light">(hidden)</span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 font-accent text-xs font-semibold',
                              st === 'saved' ? 'animate-check text-success' : 'text-text-light',
                            )}
                          >
                            {st === 'saving' ? 'Saving…' : st === 'saved' ? '✓ Saved' : ''}
                          </span>
                        </div>
                        <ImagePicker
                          compact
                          folder="drinks"
                          value={item.image_url}
                          onChange={(url) => setDrinkPhoto(item, url)}
                        />
                        {st && st !== 'saving' && st !== 'saved' && (
                          <p className="mt-2 font-body text-xs text-danger">{st}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Card>

        {/* ── The banner ──────────────────────────────────────────────────── */}
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-heading text-lg font-bold text-text-dark">Behind the banner</h2>
            <p className="mt-0.5 font-body text-sm text-text-light">
              The big “{shop.settings.service_title}” banner at the top of the menu, and the bar
              across the top of the lobby TV. Your brand colour is washed over the picture so the
              words stay readable.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <ImagePicker
              folder="backgrounds"
              aspect="wide"
              value={working.banner_image}
              onChange={(url) => set('banner_image', url)}
              hint="A wide photo — the coffee bar, the church, a cup on a table."
            />
            <div className="space-y-2">
              <p className="px-1 font-accent text-xs font-semibold text-text-light">Preview</p>
              <ShopBanner settings={shop.settings} status={status} image={working.banner_image} />
            </div>
          </div>
        </Card>

        {/* ── Page backgrounds ────────────────────────────────────────────── */}
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-heading text-lg font-bold text-text-dark">Page backgrounds</h2>
            <p className="mt-0.5 font-body text-sm text-text-light">
              A picture behind the whole page, softened so the menu stays easy to read. The
              barista and counter screens never get one — they&apos;re for working.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <ImagePicker
                label="Customer pages — menu, checkout, the phone's order tracker"
                folder="backgrounds"
                aspect="wide"
                value={working.page_background_image}
                onChange={(url) => set('page_background_image', url)}
              />
              <BackdropSample url={working.page_background_image} strength="soft" />
            </div>
            <div className="space-y-3">
              <ImagePicker
                label="Lobby TV (/live)"
                folder="backgrounds"
                aspect="wide"
                value={working.live_background_image}
                onChange={(url) => set('live_background_image', url)}
              />
              <BackdropSample url={working.live_background_image} strength="bold" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Save ───────────────────────────────────────────────────────────── */}
      <div className="glass sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200/60 px-4 py-4">
        <Button onClick={save} disabled={saving || !dirty || !migrated} loading={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => {
            setWorking(saved);
            setSavedNote(false);
          }}
        >
          Discard changes
        </Button>
        {savedNote && !dirty && (
          <span className="animate-rise font-body text-sm text-success">
            Saved — every open phone and the TV have it already.
          </span>
        )}
        {dirty && !savedNote && (
          <span className="font-body text-xs text-text-light">
            Drink photos are already saved; these settings need Save.
          </span>
        )}
      </div>
    </div>
  );
}

/** A miniature menu row in each mode, so the choice is a picture, not a description. */
function ModeSample({ mode, defaultImage }: { mode: DrinkMode; defaultImage: string | null }) {
  const pictures: SitePictures = { ...DEFAULT_PICTURES, drink_mode: mode, default_drink_image: defaultImage };
  const rows = [
    { name: 'Latte', image_url: null },
    { name: 'Iced Mocha', image_url: null },
  ];
  return (
    <span aria-hidden className="block space-y-1.5 rounded-xl bg-surface p-2 shadow-sm">
      {rows.map((r) => (
        <span key={r.name} className="flex items-center gap-2">
          <DrinkPicture item={r} pictures={pictures} className="h-8 w-8 rounded-lg" iconClassName="text-base" />
          <span className="h-2 flex-1 rounded-full bg-gray-200" />
          <span className="h-2 w-6 rounded-full bg-gray-200" />
        </span>
      ))}
    </span>
  );
}

/** What a page looks like with this background: the picture, the veil, and a card on it. */
function BackdropSample({ url, strength }: { url: string | null; strength: 'soft' | 'bold' }) {
  if (!safeImageUrl(url)) return null;
  return (
    <div className="relative h-36 overflow-hidden rounded-2xl ring-1 ring-gray-200">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: cssImage(url) }} />
      <div className={`absolute inset-0 ${BACKDROP_VEIL[strength]}`} />
      <div className="relative space-y-2 p-4">
        <span className="block h-3 w-24 rounded-full bg-text-dark/70" />
        <span className="block rounded-xl bg-surface p-3 shadow-sm">
          <span className="block h-2.5 w-2/3 rounded-full bg-gray-200" />
          <span className="mt-2 block h-2 w-1/3 rounded-full bg-gray-100" />
        </span>
      </div>
    </div>
  );
}
