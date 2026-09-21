'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_THEME,
  cacheTheme,
  cachedTheme,
  fetchTheme,
  fontHref,
  themeStyle,
  type ThemeSettings,
} from '@/lib/theme';

/**
 * Paints the whole app in whatever is saved at /admin/theme.
 *
 * It renders one `<style>` tag and, for a non-default font pairing, one `<link>`. That
 * style block sits after globals.css in document order, so it wins on the cascade
 * without `!important` and without a single component knowing a theme exists — every
 * screen is already written in terms of `bg-primary`, `rounded-2xl` and `text-sm`, and
 * those all compile down to CSS variables this block redefines.
 *
 * Mounted once, in the root layout, so it covers the customer menu, the tablet, the
 * barista board, the lobby TV and admin alike.
 *
 * Three things it deliberately does:
 *
 *  - **Paints from localStorage first.** The theme lives in the database, so the first
 *    paint happens before it's known. Without the cache a customer watches the menu
 *    change colour under them on every page load.
 *  - **Subscribes to the row.** Changing the theme mid-service repaints the TV on the
 *    wall and the tablet at the counter without anyone walking over to them.
 *  - **Loads a webfont only when one is actually chosen.** The default pairing is already
 *    served by next/font from our own domain, so `fontHref` returns null for it and no
 *    request to Google is made. A shop that never touches this page pays nothing for it.
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

  const href = fontHref(settings.look?.font ?? 'default');

  return (
    <>
      {href && (
        // Next hoists this into <head>. Keyed on the URL so switching pairings swaps the
        // sheet rather than accumulating one per font anybody has ever tried.
        <link key={href} rel="stylesheet" href={href} />
      )}
      {/* The server renders the Navy block and the client's first pass may render the
          cached one; they're both valid and the difference is a style tag, so the
          mismatch is told to be quiet rather than papered over with a second render. */}
      <style
        id="lotg-theme"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: themeStyle(settings) }}
      />
    </>
  );
}
