'use client';

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { DEFAULT_PICTURES, fetchPictures, picturesFromRow, type SitePictures } from './pictures';

/**
 * The shop's picture settings, live, for any component that wants them.
 *
 * One copy and one realtime subscription for the whole app, however many components ask:
 * the menu, every card on it, the sheet and the banner all read the same store. Saving at
 * /admin/pictures reaches every open phone and the lobby TV a moment later.
 *
 * The first paint comes from localStorage (same idea as the theme), so the banner
 * picture doesn't pop in a second after the page on every visit. It can only be wrong
 * for one paint, right after an admin changes it.
 */

const CACHE_KEY = 'lotg-pictures';

let current: SitePictures = DEFAULT_PICTURES;
let started = false;
const listeners = new Set<() => void>();

function readCache(): SitePictures {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? picturesFromRow(JSON.parse(raw)) : DEFAULT_PICTURES;
  } catch {
    return DEFAULT_PICTURES;
  }
}

function publish(next: SitePictures) {
  current = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* private mode — the cache is a nicety */
  }
  listeners.forEach((l) => l());
}

async function load() {
  const { pictures, migrated } = await fetchPictures();
  // A table that isn't there yet is "no pictures", but a failed fetch on a table that
  // is there shouldn't wipe a good cached copy — keep what we had.
  if (migrated) publish(pictures);
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  current = readCache();
  load();
  supabase
    .channel('site-pictures')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'site_pictures' }, load)
    .subscribe();
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For the admin page: put a just-saved copy straight into the store. */
export function setPicturesLocally(next: SitePictures) {
  publish(next);
}

export function useSitePictures(): SitePictures {
  return useSyncExternalStore(
    subscribe,
    () => current,
    // The server has no localStorage; it renders the app as it was, with no pictures.
    () => DEFAULT_PICTURES,
  );
}
