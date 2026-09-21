/**
 * The app's look, editable at /admin/theme.
 *
 * Two halves, stored together and painted together:
 *
 *   **Colours** — a scheme (src/lib/theme-presets.ts) plus per-token overrides.
 *   **A look**  — corners, shadows, text size, roominess, background and fonts
 *                 (src/lib/theme-looks.ts).
 *
 * Both work the same way, and it is the only way any of this works: every colour and
 * measurement on every screen is a CSS variable that Tailwind's own utilities read
 * (`bg-primary` → `var(--color-primary)`, `rounded-2xl` → `var(--radius-2xl)`), so
 * changing the *value* at runtime repaints the app without a single component knowing a
 * theme exists. This file writes one `<style>` holding a second `:root { … }` block; it
 * lands after globals.css in document order and wins on the cascade. If you find
 * yourself adding a hex value or a `rounded-` class to a component to make a theme work,
 * you have stepped outside the mechanism.
 *
 * Stored in `theme_settings` (single row, id = 1) as a preset name, an overrides object
 * and a look object — separately, so "Slate, but with a warmer page, square corners"
 * stays Slate and a preset can be corrected later without wiping the shop's own edits.
 * Every screen subscribes to that row, so saving in admin repaints the lobby TV without
 * anyone touching it.
 *
 * **A missing migration must never leave the app grey.** Every read falls back to Navy
 * and the default look — the values hard-coded in globals.css anyway — so a database
 * that has run neither theme migration looks exactly as it does today.
 */

import { supabase } from './supabase';
import {
  DEFAULT_PRESET_ID,
  THEME_PRESETS,
  presetById,
  type ThemeColors,
} from './theme-presets';
import { DEFAULT_LOOK, lookCss, normalizeLook, type ThemeLook } from './theme-looks';

export * from './theme-presets';
export * from './theme-looks';

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
 *
 * The last three are the greys. They are listed like any other colour because on a dark
 * scheme they are the difference between a card having an edge and the whole page being
 * one flat slab — see `themeCss` for where they land.
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
  { key: 'muted', label: 'Quiet fills', hint: 'The strips behind rows, and hover backgrounds', group: 'Page' },
  { key: 'line-soft', label: 'Faint edges', hint: 'The hairline around most cards', group: 'Page' },
  { key: 'line', label: 'Edges and dividers', hint: 'Input borders, the stronger card edges', group: 'Page' },

  { key: 'text-dark', label: 'Headings', hint: 'Names, drink titles, anything bold', group: 'Text' },
  { key: 'text', label: 'Body text', hint: 'Ordinary reading text', group: 'Text' },
  { key: 'text-light', label: 'Quiet text', hint: 'Wait times, help lines, add-ins under a drink', group: 'Text' },
];

export interface ThemeSettings {
  preset: string;
  /** Only the tokens someone actually changed — everything else follows the preset. */
  overrides: ThemeColors;
  look: ThemeLook;
}

export const DEFAULT_THEME: ThemeSettings = {
  preset: DEFAULT_PRESET_ID,
  overrides: {},
  look: { ...DEFAULT_LOOK },
};

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
 * Values are filtered through `isHexColor` first: this string goes into the page as CSS,
 * so nothing that isn't three or six hex digits is allowed anywhere near it.
 *
 * ── The greys ────────────────────────────────────────────────────────────────
 *
 * Roughly 175 places in the app say `border-gray-200`, `border-gray-100` or
 * `bg-gray-50` rather than naming a token — card hairlines, input borders, the strips
 * behind list rows. Those compile to `var(--color-gray-200)` and friends, which means
 * the whole literal grey scale is themeable from here without touching a component, and
 * that is the entire reason a dark scheme is possible at all. The three grey tokens are
 * mapped onto Tailwind's ramp below; on every light scheme they hold Tailwind's own
 * values, so nothing moves.
 *
 * `--color-white` is deliberately NOT touched. It looks like the card colour but isn't:
 * of the thirty-odd `bg-white`s in the app almost all are a dot or a button sitting on a
 * coloured fill, and all ninety-nine `text-white`s are labels on coloured buttons. Cards
 * already say `bg-surface`. Flipping white would black out button text to fix a problem
 * that doesn't exist.
 */
export function themeCss(colors: ThemeColors): string {
  const named = THEME_TOKENS.filter((t) => isHexColor(colors[t.key] ?? ''))
    .map((t) => `--color-${t.key}:${normalizeHex(colors[t.key])};`)
    .join('');

  // gray-100 carries both the faint hairline and the hover fill that sits next to it;
  // one value for the pair is right on every scheme here and keeps this to three dials.
  const ramp: Array<[string, string]> = [
    ['gray-50', 'muted'],
    ['gray-100', 'line-soft'],
    ['gray-200', 'line'],
    ['gray-300', 'line'],
  ];
  const greys = ramp
    .filter(([, token]) => isHexColor(colors[token] ?? ''))
    .map(([step, token]) => `--color-${step}:${normalizeHex(colors[token])};`)
    .join('');

  return `:root{${named}${greys}}`;
}

/** Colours and look together — what actually goes into the page. */
export function themeStyle(settings: ThemeSettings): string {
  return themeCss(resolveColors(settings)) + lookCss(settings.look ?? DEFAULT_LOOK);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Reading and writing
 * ────────────────────────────────────────────────────────────────────────── */

function cleanOverrides(overrides: ThemeColors | undefined): ThemeColors {
  const clean: ThemeColors = {};
  for (const token of THEME_TOKENS) {
    const value = overrides?.[token.key];
    if (value && isHexColor(value)) clean[token.key] = normalizeHex(value);
  }
  return clean;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Reads the saved theme. Any failure — no table, no row, no network — is Navy.
 *
 * `look` arrives in its own migration, so the select is tried with that column and again
 * without it. A shop that ran supabase-theme.sql but not supabase-theme-looks.sql keeps
 * its colours and gets the default look, rather than losing both to one missing column.
 */
export async function fetchTheme(): Promise<ThemeSettings> {
  let data: Record<string, unknown> | null = null;

  for (const columns of ['preset, overrides, look', 'preset, overrides']) {
    const res = await supabase.from('theme_settings').select(columns).eq('id', 1).maybeSingle();
    if (!res.error) {
      data = res.data as Record<string, unknown> | null;
      break;
    }
    if (!/look/i.test(res.error.message)) break;
  }

  if (!data) return { ...DEFAULT_THEME };

  const preset = typeof data.preset === 'string' && THEME_PRESETS.some((p) => p.id === data.preset)
    ? data.preset
    : DEFAULT_PRESET_ID;

  return {
    preset,
    overrides: asObject(data.overrides) as ThemeColors,
    look: normalizeLook(data.look),
  };
}

/**
 * Saves. Returns the migration's name when a table or column isn't there yet, not a raw
 * error — and saves the colours anyway if only the `look` column is missing, since
 * losing a colour change to a migration nobody has run is the worse half of that trade.
 */
export async function saveTheme(
  settings: ThemeSettings,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const row = {
    id: 1,
    preset: settings.preset,
    overrides: cleanOverrides(settings.overrides),
    updated_at: new Date().toISOString(),
  };

  const withLook = await supabase
    .from('theme_settings')
    .upsert({ ...row, look: settings.look ?? DEFAULT_LOOK });

  if (!withLook.error) return { ok: true };

  if (/look/i.test(withLook.error.message)) {
    const colorsOnly = await supabase.from('theme_settings').upsert(row);
    if (!colorsOnly.error) {
      return {
        ok: true,
        note: 'Colours saved. Corners, shadows, text size and fonts need supabase-theme-looks.sql run in the Supabase SQL editor — until then every screen uses the standard look.',
      };
    }
  }

  const missingTable =
    /theme_settings/i.test(withLook.error.message) || withLook.error.code === '42P01';
  return {
    ok: false,
    error: missingTable
      ? 'Nothing can be saved yet — run supabase-theme.sql in the Supabase SQL editor. Until then the app stays on Navy.'
      : `Couldn’t save: ${withLook.error.message}`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Sharing a look
 *
 * A look code is the whole theme as JSON in base64. It exists so somebody can try
 * something on their own screen, paste six lines into a message and have the shop use
 * it — the alternative is reading fifteen hex values down a phone.
 *
 * Decoding is total: anything malformed comes back null, and anything merely unexpected
 * inside it is filtered by `normalizeLook` and `cleanOverrides` on the way in, so a
 * pasted code can't put a value into the page that the editor couldn't have produced.
 * ────────────────────────────────────────────────────────────────────────── */

export function encodeThemeCode(settings: ThemeSettings): string {
  const payload = JSON.stringify({
    p: settings.preset,
    o: cleanOverrides(settings.overrides),
    l: settings.look ?? DEFAULT_LOOK,
  });
  if (typeof window === 'undefined') return '';
  return window.btoa(unescape(encodeURIComponent(payload)));
}

export function decodeThemeCode(code: string): ThemeSettings | null {
  try {
    const json = decodeURIComponent(escape(window.atob(code.trim())));
    const parsed = JSON.parse(json) as { p?: unknown; o?: unknown; l?: unknown };
    const preset =
      typeof parsed.p === 'string' && THEME_PRESETS.some((x) => x.id === parsed.p)
        ? parsed.p
        : DEFAULT_PRESET_ID;
    return {
      preset,
      overrides: cleanOverrides(asObject(parsed.o) as ThemeColors),
      look: normalizeLook(parsed.l),
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The flash
 *
 * The theme lives in the database, so the first paint of any page happens before it is
 * known — and a customer would watch the menu change colour under them. The last theme
 * this browser saw is kept in localStorage and applied immediately, then replaced by the
 * real one a moment later. Wrong for one paint after an admin changes it, which is the
 * only case it can be wrong at all.
 * ────────────────────────────────────────────────────────────────────────── */

const CACHE_KEY = 'lotg_theme';

export function cachedTheme(): ThemeSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    if (!parsed || typeof parsed.preset !== 'string') return null;
    return {
      preset: parsed.preset,
      overrides: parsed.overrides ?? {},
      look: normalizeLook(parsed.look),
    };
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
