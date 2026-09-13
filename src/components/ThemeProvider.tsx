'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_THEME,
  cacheTheme,
  cachedTheme,
  fetchTheme,
  resolveColors,
  themeCss,
  type ThemeSettings,
} from '@/lib/theme';

/**
 * Paints the whole app in the colours saved at /admin/theme.
 *
 * It renders one `<style>` tag holding a `:root` block, nothing else. That block sits
 * after globals.css in document order, so it wins on the cascade without `!important`
 * and without a single component knowing a theme exists — every screen is already
 * written in terms of `bg-primary`, `text-success` and the rest.
 *
 * Mounted once, in the root layout, so it covers the customer menu, the tablet, the
 * barista board, the lobby TV and admin alike.
 *
 * Two things it deliberately does:
 *
 *  - **Paints from localStorage first.** The theme lives in the database, so the first
 *    paint happens before it's known. Without the cache a customer watches the menu
 *    change colour under them on every page load.
 *  - **Subscribes to the row.** Changing the theme mid-service repaints the TV on the
 *    wall and the tablet at the counter without anyone walking over to them.
 */
export default function ThemeProvider() {
  // Lazy initial value, so the cached theme is painted on the very first client render
  // rather than one paint later. The server has no localStorage and renders the Navy
  // block; that difference is what suppressHydrationWarning below is for.
  const [settings, setSettings] = useState<ThemeSettings>(() => cachedTheme() ?? DEFAULT_THEME);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const live = await fetchTheme();
      if (cancelled) return;
      setSettings(live);
      cacheTheme(live);
    };

    load();

    const channel = supabase
      .channel('theme-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'theme_settings' }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // The server renders the Navy block and the client's first pass may render the cached
  // one; they're both valid and the difference is a style tag, so the mismatch is told
  // to be quiet rather than papered over with a second render.
  return (
    <style
      id="lotg-theme"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeCss(resolveColors(settings)) }}
    />
  );
}
