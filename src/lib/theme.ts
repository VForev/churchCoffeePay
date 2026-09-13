/**
 * The app's colours, editable at /admin/theme.
 *
 * Every colour on every screen comes from one of the fifteen tokens below. They are the
 * same CSS custom properties `src/app/globals.css` declares and Tailwind reads
 * (`bg-primary`, `text-success`, …) — this file only changes their values at runtime, by
 * writing a second `:root { … }` block into the page. Nothing here invents a new colour
 * system alongside the existing one, which is the whole reason a theme can be switched
 * without touching a component.
 *
 * Stored in `theme_settings` (single row, id = 1, from supabase-theme.sql) as a preset
 * name plus per-token overrides, so "the red scheme but with a darker page" is two fields
 * and not a sixteenth preset. Every screen subscribes to that row, so saving in admin
 * repaints the lobby TV without anyone touching it.
 *
 * **A missing migration must never leave the app grey.** Every read falls back to the
 * built-in Navy preset — the values that are hard-coded in globals.css anyway — so a
 * database that has never run supabase-theme.sql looks exactly like it does today.
 */

import { supabase } from './supabase';

export interface ThemeTokenDef {
  key: string;
  /** What this colour MEANS, not where it happens to appear. */
  label: string;
  hint: string;
  group: 'Actions' | 'States' | 'Page' | 'Text';
}

/**
 * The order here is the order of the editor, and the grouping is by job: someone changing
 * "the colour of buttons" should not have to know it is called `primary`.
 */
export const THEME_TOKENS: ThemeTokenDef[] = [
  { key: 'primary', label: 'Tap this', hint: 'Buttons, active tabs, the chosen option', group: 'Actions' },
  { key: 'primary-light', label: 'Tap this — hover', hint: 'The same button under a finger or cursor', group: 'Actions' },
  { key: 'secondary', label: 'Second action', hint: 'Track Order, and other quieter buttons', group: 'Actions' },
  { key: 'secondary-light', label: 'Second action — hover', hint: '', group: 'Actions' },

  { key: 'success', label: 'Open and ready', hint: 'The open dot, the Ready column, a printed cup', group: 'States' },
  { key: 'success-light', label: 'Open and ready — hover', hint: '', group: 'States' },
  { key: 'warning', label: 'Waiting / being made', hint: 'Pending orders, the amber warnings', group: 'States' },
  { key: 'danger', label: 'Problem / sold out', hint: 'Errors, delete buttons, flagged orders', group: 'States' },
  { key: 'warm', label: 'Notes and asides', hint: 'Special instructions, the write-in box', group: 'States' },
  { key: 'warm-light', label: 'Notes — hover', hint: '', group: 'States' },

  { key: 'bg', label: 'Page behind everything', hint: 'The colour under the cards', group: 'Page' },
  { key: 'surface', label: 'Cards', hint: 'Every card, modal and panel', group: 'Page' },

  { key: 'text-dark', label: 'Headings', hint: 'Names, drink titles, anything bold', group: 'Text' },
  { key: 'text', label: 'Body text', hint: 'Ordinary reading text', group: 'Text' },
  { key: 'text-light', label: 'Quiet text', hint: 'Wait times, help lines, add-ins under a drink', group: 'Text' },
];

export type ThemeColors = Record<string, string>;

export interface ThemePreset {
  id: string;
  name: string;
  /** One line on what it is FOR, and what it costs — every scheme trades something. */
  blurb: string;
  colors: ThemeColors;
}

/**
 * The presets.
 *
 * `navy` is what the app has always looked like and is the default everywhere, including
 * on a database with no theme row. The other four come from the church colour sheet —
 * every value in them is one of the ten colours on that sheet, nothing invented, which is
 * the only reason they can sit beside the church's own materials without clashing.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'navy',
    name: 'Navy — how it is now',
    blurb: 'The current app, unchanged. Blue buttons, green for ready, amber for waiting.',
    colors: {
      primary: '#4054B2',
      'primary-light': '#5A6FCC',
      secondary: '#6EC1E4',
      'secondary-light': '#8ED1EC',
      success: '#23A455',
      'success-light': '#61CE70',
      warm: '#6B5D4B',
      'warm-light': '#8A7A68',
      bg: '#F0F4F7',
      surface: '#FFFFFF',
      text: '#54595F',
      'text-dark': '#000000',
      'text-light': '#7A7A7A',
      danger: '#DC2626',
      warning: '#F59E0B',
    },
  },
  {
    id: 'coffee-house',
    name: 'Coffee House',
    blurb: 'Warm browns off the church website. Reads as a coffee bar rather than an app.',
    colors: {
      primary: '#6B5D4B',
      'primary-light': '#85765F',
      secondary: '#B0A89C',
      'secondary-light': '#C6BFB4',
      success: '#5E7A4F',
      'success-light': '#7B996B',
      warm: '#7A6A55',
      'warm-light': '#9A8B75',
      bg: '#F5EFEA',
      surface: '#FFFFFF',
      text: '#4A3F35',
      'text-dark': '#241A14',
      'text-light': '#8A7C6E',
      danger: '#9C4A34',
      warning: '#B0791F',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    blurb: 'Blue-grey does the tapping. Sits furthest from the olive and the red, so ready, sold out and tappable can never be confused.',
    colors: {
      primary: '#5A666B',
      'primary-light': '#74828A',
      secondary: '#B3ACA1',
      'secondary-light': '#C9C3BA',
      success: '#6F745D',
      'success-light': '#8A9077',
      warm: '#5C5241',
      'warm-light': '#7A6E59',
      bg: '#E6E6E6',
      surface: '#FFFFFF',
      text: '#4A4A46',
      'text-dark': '#333333',
      'text-light': '#6E6E68',
      danger: '#911B1B',
      warning: '#695B4B',
    },
  },
  {
    id: 'brown',
    name: 'Brown',
    blurb: 'Closest to the church website itself. Slate takes over “being made”, since the sheet has no amber.',
    colors: {
      primary: '#695B4B',
      'primary-light': '#857561',
      secondary: '#5A666B',
      'secondary-light': '#74828A',
      success: '#6F745D',
      'success-light': '#8A9077',
      warm: '#5C5241',
      'warm-light': '#7A6E59',
      bg: '#E6E6E6',
      surface: '#FFFFFF',
      text: '#4A4A46',
      'text-dark': '#333333',
      'text-light': '#6E6E68',
      danger: '#911B1B',
      warning: '#5A666B',
    },
  },
  {
    id: 'red',
    name: 'Red',
    blurb: 'The boldest, and the one people react to. It costs you red for problems — sold out and errors fall back to bark, because red is doing the tapping.',
    colors: {
      primary: '#911B1B',
      'primary-light': '#A93030',
      secondary: '#B3ACA1',
      'secondary-light': '#C9C3BA',
      success: '#6F745D',
      'success-light': '#8A9077',
      warm: '#5C5241',
      'warm-light': '#7A6E59',
      bg: '#E6E6E6',
      surface: '#FFFFFF',
      text: '#4A4A46',
      'text-dark': '#333333',
      'text-light': '#6E6E68',
      danger: '#5C5241',
      warning: '#695B4B',
    },
  },
];

export const DEFAULT_PRESET_ID = 'navy';

export interface ThemeSettings {
  preset: string;
  /** Only the tokens someone actually changed — everything else follows the preset. */
  overrides: ThemeColors;
}

export const DEFAULT_THEME: ThemeSettings = { preset: DEFAULT_PRESET_ID, overrides: {} };

export function presetById(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

/** Preset first, then whatever was overridden on top. Unknown keys are dropped. */
export function resolveColors(settings: ThemeSettings): ThemeColors {
  const base = presetById(settings.preset).colors;
  const out: ThemeColors = { ...base };
  for (const token of THEME_TOKENS) {
    const value = settings.overrides?.[token.key];
    if (value && isHexColor(value)) out[token.key] = normalizeHex(value);
  }
  return out;
}

export function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** `#abc` → `#AABBCC`, so two spellings of one colour don't read as an override. */
export function normalizeHex(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  }
  return v.toUpperCase();
}

/**
 * The `:root` block that repaints the app.
 *
 * Written into a `<style>` in the body, which lands after globals.css in document order
 * and therefore wins — same selector, same specificity, later one applies. Values are
 * filtered through `isHexColor` first: this string goes into the page as CSS, so nothing
 * that isn't six hex digits is allowed anywhere near it.
 */
export function themeCss(colors: ThemeColors): string {
  const lines = THEME_TOKENS.filter((t) => isHexColor(colors[t.key] ?? ''))
    .map((t) => `--color-${t.key}:${normalizeHex(colors[t.key])};`)
    .join('');
  return `:root{${lines}}`;
}

/** Reads the saved theme. Any failure — no table, no row, no network — is Navy. */
export async function fetchTheme(): Promise<ThemeSettings> {
  const { data, error } = await supabase
    .from('theme_settings')
    .select('preset, overrides')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return DEFAULT_THEME;

  const overrides =
    data.overrides && typeof data.overrides === 'object' && !Array.isArray(data.overrides)
      ? (data.overrides as ThemeColors)
      : {};

  return {
    preset: THEME_PRESETS.some((p) => p.id === data.preset) ? data.preset : DEFAULT_PRESET_ID,
    overrides,
  };
}

/** Saves. Returns the migration's name when the table isn't there yet, not a raw error. */
export async function saveTheme(settings: ThemeSettings): Promise<{ ok: boolean; error?: string }> {
  const clean: ThemeColors = {};
  for (const token of THEME_TOKENS) {
    const value = settings.overrides?.[token.key];
    if (value && isHexColor(value)) clean[token.key] = normalizeHex(value);
  }

  const { error } = await supabase
    .from('theme_settings')
    .upsert({ id: 1, preset: settings.preset, overrides: clean, updated_at: new Date().toISOString() });

  if (!error) return { ok: true };

  const missingTable = /theme_settings/i.test(error.message) || error.code === '42P01';
  return {
    ok: false,
    error: missingTable
      ? 'Colours can’t be saved yet — run supabase-theme.sql in the Supabase SQL editor. Until then the app stays on Navy.'
      : `Couldn’t save: ${error.message}`,
  };
}

/**
 * ---------------------------------------------------------------------------
 * The flash
 * ---------------------------------------------------------------------------
 *
 * The theme lives in the database, so the first paint of any page happens before it is
 * known — and a customer would watch the menu change colour under them. The last theme
 * this browser saw is kept in localStorage and applied immediately, then replaced by the
 * real one a moment later. Wrong for one paint after an admin changes it, which is the
 * only case it can be wrong at all.
 */
const CACHE_KEY = 'lotg_theme';

export function cachedTheme(): ThemeSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThemeSettings;
    if (!parsed || typeof parsed.preset !== 'string') return null;
    return { preset: parsed.preset, overrides: parsed.overrides ?? {} };
  } catch {
    return null;
  }
}

export function cacheTheme(settings: ThemeSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* A remembered colour is not worth an exception on a locked-down browser. */
  }
}
