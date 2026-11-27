/**
 * Pictures: drink photos, the drink of the day, and the background pictures.
 *
 * Every "which picture does this show?" question is answered here and nowhere else — the
 * menu, the tablet, the drink sheet, checkout and the drink of the day all ask
 * `drinkPicture()` / `specialtyPicture()`, so a drink can't have a photo on one screen and
 * a cup on the next.
 *
 * Settings live in `site_pictures` (one row, supabase-pictures.sql). Every read falls back
 * to DEFAULT_PICTURES — which is exactly how the app looked before pictures existed — so a
 * missing migration, a dropped connection or a bad row never blanks the menu.
 */

import { supabase } from './supabase';
import type { MenuItem } from '@/types';
import type { SpecialtySettings } from './specialty';

/** What a drink without a photo of its own shows. */
export type DrinkMode = 'icon' | 'default' | 'none';

export interface SitePictures {
  drink_mode: DrinkMode;
  default_drink_image: string | null;
  banner_image: string | null;
  page_background_image: string | null;
  live_background_image: string | null;
}

export const DEFAULT_PICTURES: SitePictures = {
  drink_mode: 'icon',
  default_drink_image: null,
  banner_image: null,
  page_background_image: null,
  live_background_image: null,
};

export const PICTURES_MIGRATION = 'supabase-pictures.sql';

/* ── Only real picture addresses reach the page ───────────────────────────── */

/**
 * A picture address that is safe to put in an `<img src>` or a CSS `url()`, or null.
 *
 * http(s) only, or a path on this site (`/lotg-logo.png`). Everything else — `javascript:`,
 * `data:`, a typo, an empty box — is null, and null means "no picture". Run through the
 * URL parser, which percent-encodes quotes and brackets, so the result can't close the
 * `url("…")` it is put in.
 */
export function safeImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) {
    try {
      return new URL(value, 'https://local.invalid').pathname;
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** A CSS `background-image` value for a picture, or `none`. */
export function cssImage(raw: string | null | undefined): string {
  const url = safeImageUrl(raw);
  if (!url) return 'none';
  // safeImageUrl already encoded quotes; these two are belt and braces.
  return `url("${url.replace(/\\/g, '%5C').replace(/"/g, '%22')}")`;
}

/* ── What a drink shows ───────────────────────────────────────────────────── */

export type DrinkPictureKind =
  | { kind: 'photo'; url: string }
  | { kind: 'icon' }
  | { kind: 'none' };

/**
 *  - "No pictures" → nothing, not even for a drink that has a photo. That setting is a
 *    choice about how the menu looks, not about which drinks are photogenic.
 *  - The drink's own photo, when it has one.
 *  - Otherwise the shop's default picture, when that's the setting and one is set.
 *  - Otherwise the cup icon.
 */
export function drinkPicture(
  item: Pick<MenuItem, 'image_url'>,
  pictures: SitePictures,
): DrinkPictureKind {
  if (pictures.drink_mode === 'none') return { kind: 'none' };
  const own = safeImageUrl(item.image_url);
  if (own) return { kind: 'photo', url: own };
  if (pictures.drink_mode === 'default') {
    const fallback = safeImageUrl(pictures.default_drink_image);
    if (fallback) return { kind: 'photo', url: fallback };
  }
  return { kind: 'icon' };
}

/** Just the photo address, for places that show a photo or nothing (the sheet, checkout). */
export function drinkPhoto(item: Pick<MenuItem, 'image_url'>, pictures: SitePictures): string | null {
  const p = drinkPicture(item, pictures);
  return p.kind === 'photo' ? p.url : null;
}

/**
 * The drink of the day's picture: its own, if it has one — the special is set up on
 * purpose and its picture is part of that, so it shows even when the menu is set to
 * "No pictures". Failing that, whatever the drink it's built on would show.
 */
export function specialtyPicture(
  settings: Pick<SpecialtySettings, 'image_url'>,
  item: Pick<MenuItem, 'image_url'> | null | undefined,
  pictures: SitePictures,
): string | null {
  return safeImageUrl(settings.image_url) ?? (item ? drinkPhoto(item, pictures) : null);
}

/* ── Reading and saving ───────────────────────────────────────────────────── */

export function picturesFromRow(row: Record<string, unknown> | null | undefined): SitePictures {
  if (!row) return DEFAULT_PICTURES;
  const mode = row.drink_mode;
  return {
    drink_mode: mode === 'default' || mode === 'none' ? mode : 'icon',
    default_drink_image: safeImageUrl(row.default_drink_image),
    banner_image: safeImageUrl(row.banner_image),
    page_background_image: safeImageUrl(row.page_background_image),
    live_background_image: safeImageUrl(row.live_background_image),
  };
}

/** The saved settings. Any failure is the app as it was — never an error on a screen. */
export async function fetchPictures(): Promise<{ pictures: SitePictures; migrated: boolean }> {
  const { data, error } = await supabase.from('site_pictures').select('*').eq('id', 1).maybeSingle();
  if (error) return { pictures: DEFAULT_PICTURES, migrated: false };
  return { pictures: picturesFromRow(data as Record<string, unknown> | null), migrated: true };
}

function friendlyError(message: string, code?: string): string {
  if (/site_pictures|relation .* does not exist|schema cache/i.test(message) || code === '42P01') {
    return `Pictures can’t be saved yet — run ${PICTURES_MIGRATION} in the Supabase SQL editor.`;
  }
  if (/row-level security|permission|not authorized|JWT/i.test(message)) {
    return 'Your admin sign-in has expired. Sign in again and save once more.';
  }
  return `Couldn’t save: ${message}`;
}

export async function savePictures(pictures: SitePictures): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('site_pictures').upsert({
    id: 1,
    drink_mode: pictures.drink_mode,
    default_drink_image: safeImageUrl(pictures.default_drink_image),
    banner_image: safeImageUrl(pictures.banner_image),
    page_background_image: safeImageUrl(pictures.page_background_image),
    live_background_image: safeImageUrl(pictures.live_background_image),
    updated_at: new Date().toISOString(),
  });
  return error ? { ok: false, error: friendlyError(error.message, error.code) } : { ok: true };
}

/* ── Uploading ────────────────────────────────────────────────────────────── */

export type PictureFolder = 'drinks' | 'specials' | 'backgrounds';

/**
 * The longest side a picture is stored at. A drink is never shown bigger than the sheet's
 * header; a background fills a TV. Phone photos are 4000px and several megabytes, which
 * is a slow menu on church wifi for no visible gain.
 */
const MAX_SIDE: Record<PictureFolder, number> = { drinks: 1000, specials: 1400, backgrounds: 2200 };

/**
 * Shrinks a photo in the browser before it's uploaded: longest side capped, re-encoded as
 * WebP (JPEG where the browser can't make WebP). A GIF is left alone — redrawing it on a
 * canvas would keep only its first frame. If anything about shrinking fails, the original
 * goes up instead; a big picture beats no picture.
 */
async function shrink(file: File, folder: PictureFolder): Promise<Blob> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = MAX_SIDE[folder];
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
    if (blob && blob.type === 'image/webp') return blob.size < file.size ? blob : file;
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return jpeg && jpeg.size < file.size ? jpeg : file;
  } catch {
    return file;
  }
}

const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

/** Uploads a picture and returns its public address. Admin only (storage policy). */
export async function uploadPicture(
  file: File,
  folder: PictureFolder,
): Promise<{ url: string } | { error: string }> {
  if (!file.type.startsWith('image/')) return { error: 'That isn’t a picture. Choose a photo (JPEG, PNG, WebP or GIF).' };
  const HEIC = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

  const blob = await shrink(file, folder);
  const type = blob.type || file.type;
  if (!EXT[type]) {
    return {
      error: HEIC
        ? 'This is an iPhone HEIC photo this browser can’t convert. Open it in Safari, or change the iPhone camera to “Most Compatible”, and try again.'
        : 'That kind of picture can’t be used. Choose a JPEG, PNG, WebP or GIF.',
    };
  }

  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${folder}/${random}.${EXT[type]}`;

  const { error } = await supabase.storage.from('pictures').upload(path, blob, {
    contentType: type,
    // A year: every upload gets a new name, so a cached copy can never be stale.
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    if (/bucket not found|not found/i.test(error.message)) {
      return { error: `Uploads aren’t set up yet — run ${PICTURES_MIGRATION} in the Supabase SQL editor.` };
    }
    if (/row-level security|unauthorized|permission|JWT/i.test(error.message)) {
      return { error: 'Your admin sign-in has expired. Sign in again and try once more.' };
    }
    if (/size|too large|exceeded/i.test(error.message)) {
      return { error: 'That picture is too big to upload (5 MB at most).' };
    }
    return { error: `Couldn’t upload: ${error.message}` };
  }

  const { data } = supabase.storage.from('pictures').getPublicUrl(path);
  return { url: data.publicUrl };
}
