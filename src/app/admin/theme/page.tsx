'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  CATEGORY_LABELS,
  DEFAULT_LOOK,
  DEFAULT_THEME,
  FONT_PAIRINGS,
  LOOK_CONTROLS,
  THEME_PRESETS,
  THEME_TOKENS,
  cacheTheme,
  decodeThemeCode,
  encodeThemeCode,
  fetchTheme,
  fontHref,
  isDarkPreset,
  isDefaultLook,
  isHexColor,
  normalizeHex,
  presetById,
  resolveColors,
  saveTheme,
  themeStyle,
  type PresetCategory,
  type ThemeColors,
  type ThemeLook,
  type ThemeSettings,
} from '@/lib/theme';

/**
 * Look & Colours.
 *
 * Pick a scheme, change any single colour, and set the six things that aren't colours —
 * corners, shadows, text size, roominess, page background and fonts.
 *
 * **Everything on this page previews on this page.** The `<style>` below is rendered
 * after the app's own ThemeProvider in document order, so an unsaved edit repaints this
 * screen — the admin sidebar, these very cards, the buttons at the bottom — and nowhere
 * else until Save. That is deliberate and it is the point: a colour picker that only
 * tints a little swatch is how you end up saving something nobody actually looked at.
 * If the corners here go square, they have gone square everywhere.
 *
 * The scheme, the per-colour overrides and the look are three separate fields (see
 * src/lib/theme.ts), so "Slate, but with a warmer page and square corners" stays Slate —
 * a preset can be corrected later without wiping the shop's own edits, and clearing one
 * colour puts it back to the scheme's value rather than to navy blue.
 */

const GROUPS = ['Actions', 'States', 'Page', 'Text'] as const;
const CATEGORIES: PresetCategory[] = ['church', 'light', 'dark', 'fun'];

export default function ThemeAdminPage() {
  const [saved, setSaved] = useState<ThemeSettings>(DEFAULT_THEME);
  const [working, setWorking] = useState<ThemeSettings>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeMsg, setCodeMsg] = useState('');

  const load = useCallback(async () => {
    const live = await fetchTheme();
    setSaved(live);
    setWorking(live);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const presetColors = presetById(working.preset).colors;
  const colors = useMemo(() => resolveColors(working), [working]);
  const look = working.look ?? DEFAULT_LOOK;
  const dirty =
    working.preset !== saved.preset ||
    JSON.stringify(working.overrides ?? {}) !== JSON.stringify(saved.overrides ?? {}) ||
    JSON.stringify(look) !== JSON.stringify(saved.look ?? DEFAULT_LOOK);

  function touch() {
    setSavedNote(false);
    setNote('');
    setCodeMsg('');
  }

  function choosePreset(id: string) {
    // Overrides are kept on purpose: someone who darkened the page text meant it, and
    // silently dropping it while they browse schemes is how an edit gets lost.
    setWorking((w) => ({ ...w, preset: id }));
    touch();
  }

  function setLook(key: keyof ThemeLook, value: string) {
    setWorking((w) => ({ ...w, look: { ...(w.look ?? DEFAULT_LOOK), [key]: value } }));
    touch();
  }

  function setColor(token: string, value: string) {
    setWorking((w) => {
      const overrides: ThemeColors = { ...w.overrides };
      if (!value || normalizeHex(value) === normalizeHex(presetColors[token] ?? '')) {
        delete overrides[token];
      } else {
        overrides[token] = value;
      }
      return { ...w, overrides };
    });
    touch();
  }

  function clearOverride(token: string) {
    setWorking((w) => {
      const overrides = { ...w.overrides };
      delete overrides[token];
      return { ...w, overrides };
    });
    touch();
  }

  /** A whole random look. Nothing here can produce an unsafe combination — every option
   *  is one of the fixed lists — so the worst case is that it's ugly and you press
   *  Discard. That freedom is the reason the button is here. */
  function surpriseMe() {
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
    setWorking({
      preset: pick(THEME_PRESETS).id,
      overrides: {},
      look: {
        corners: pick(LOOK_CONTROLS[0].options).id,
        depth: pick(LOOK_CONTROLS[1].options).id,
        textSize: pick(LOOK_CONTROLS[2].options).id,
        roominess: pick(LOOK_CONTROLS[3].options).id,
        background: pick(LOOK_CONTROLS[4].options).id,
        font: pick(FONT_PAIRINGS).id,
      },
    });
    touch();
  }

  function backToDefault() {
    setWorking({ ...DEFAULT_THEME, look: { ...DEFAULT_LOOK } });
    touch();
  }

  async function save() {
    setSaving(true);
    setError('');
    const res = await saveTheme(working);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Couldn’t save.');
      return;
    }
    setSaved(working);
    cacheTheme(working);
    setNote(res.note ?? '');
    setSavedNote(true);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(encodeThemeCode(working));
      setCodeMsg('Copied. Paste it to anyone — they can put it in the box below.');
    } catch {
      setCodeMsg('Couldn’t reach the clipboard. Select the code above and copy it by hand.');
    }
  }

  function applyCode() {
    const decoded = decodeThemeCode(codeInput);
    if (!decoded) {
      setCodeMsg('That doesn’t look like a look code. Copy the whole thing, including the end.');
      return;
    }
    setWorking(decoded);
    setSavedNote(false);
    setNote('');
    setCodeInput('');
    setCodeMsg('Loaded — it’s on this page now. Save to put it on every screen.');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const overrideCount = Object.keys(working.overrides ?? {}).length;
  const previewFont = fontHref(look.font);

  return (
    <div className="mx-auto max-w-5xl pb-4">
      {/* Everything on this screen is painted in what's being edited, saved or not. */}
      {previewFont && <link key={previewFont} rel="stylesheet" href={previewFont} />}
      <style dangerouslySetInnerHTML={{ __html: themeStyle(working) }} />

      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text-dark">Look &amp; Colours</h1>
        <p className="mt-1 font-body text-sm text-text-light">
          Everything you change here is already showing on this page — the sidebar, these
          cards, the buttons. Saving puts it on every other screen too: the customer menu,
          the tablet, the barista board and the TV in the lobby. Nothing needs reloading,
          and nothing here can break an order.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl bg-danger/10 px-5 py-4 font-body text-sm text-text">
          {error}
        </div>
      )}
      {note && (
        <div className="mb-6 rounded-2xl bg-warning/10 px-5 py-4 font-body text-sm text-text">
          {note}
        </div>
      )}

      {/* ── Try things ──────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={surpriseMe}>🎲 Surprise me</Button>
          <Button variant="ghost" className="border border-gray-200" onClick={backToDefault}>
            Back to how it was
          </Button>
          <p className="font-body text-xs text-text-light">
            Surprise me picks a scheme and a look at random. Nothing is saved until you
            press Save colours at the bottom, so try as many as you like — “Back to how it
            was” returns the original Navy app exactly.
          </p>
        </div>
      </Card>

      {/* ── Schemes ─────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <h2 className="font-heading font-bold text-text-dark">Scheme</h2>
        <p className="mb-4 font-body text-xs text-text-light">
          The colours. Pick one and then change any of them individually further down.
        </p>

        <div className="space-y-6">
          {CATEGORIES.map((category) => (
            <div key={category}>
              <h3 className="font-accent text-xs font-bold uppercase tracking-wide text-text-light">
                {CATEGORY_LABELS[category].title}
              </h3>
              <p className="mb-2.5 max-w-2xl font-body text-xs text-text-light">
                {CATEGORY_LABELS[category].note}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {THEME_PRESETS.filter((p) => p.category === category).map((preset) => {
                  const active = working.preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => choosePreset(preset.id)}
                      className={`cursor-pointer rounded-2xl border-2 p-4 text-left transition-all ${
                        active
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-gray-200 bg-surface hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-heading font-bold text-text-dark">{preset.name}</span>
                        {active && (
                          <span className="rounded-full bg-primary px-2 py-0.5 font-accent text-[10px] font-bold uppercase tracking-wide text-white">
                            In use
                          </span>
                        )}
                      </div>

                      {/* The page colour is shown as the strip the chips sit on, because
                          on a dark scheme that is the single most important thing to see
                          before choosing it. */}
                      <div
                        className="mt-3 flex gap-1.5 rounded-lg p-1.5"
                        style={{ background: preset.colors.bg }}
                      >
                        {['primary', 'success', 'warning', 'danger', 'surface', 'text-dark'].map(
                          (token) => (
                            <span
                              key={token}
                              className="h-7 w-7 rounded-lg border border-black/10"
                              style={{ background: preset.colors[token] }}
                              title={token}
                            />
                          ),
                        )}
                      </div>

                      <p className="mt-3 font-body text-xs leading-relaxed text-text-light">
                        {preset.blurb}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {isDarkPreset(working.preset) && (
          <div className="mt-5 rounded-2xl bg-warning/10 px-4 py-3 font-body text-xs leading-relaxed text-text">
            <strong className="font-accent">Before you put a dark scheme on a Sunday.</strong>{' '}
            Card edges, row strips and input borders all follow the scheme now, so the app
            really does go dark rather than going grey. Two things still don’t: the cup
            label preview at <em>Cup Labels</em> stays white, because the label is paper and
            paper is white; and a phone in direct sun is harder to read dark-on-light than
            light-on-dark. Walk one screen of the customer menu and one of the barista board
            before service.
          </div>
        )}
      </Card>

      {/* ── The look ────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading font-bold text-text-dark">Shape and size</h2>
            <p className="font-body text-xs text-text-light">
              The things that aren’t colours. Each of these changes every screen at once.
            </p>
          </div>
          {!isDefaultLook(look) && (
            <Button
              variant="ghost"
              size="sm"
              className="border border-gray-200"
              onClick={() => {
                setWorking((w) => ({ ...w, look: { ...DEFAULT_LOOK } }));
                touch();
              }}
            >
              Standard look
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {LOOK_CONTROLS.map((control) => (
            <div key={control.key}>
              <h3 className="font-accent text-xs font-bold uppercase tracking-wide text-text-light">
                {control.label}
              </h3>
              <p className="mb-2.5 font-body text-xs text-text-light">{control.hint}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {control.options.map((option) => {
                  const active = look[control.key] === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setLook(control.key, option.id)}
                      className={`cursor-pointer rounded-xl border-2 px-3.5 py-3 text-left transition-all ${
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 bg-surface hover:border-primary/40'
                      }`}
                    >
                      <span className="font-heading text-sm font-bold text-text-dark">
                        {option.name}
                      </span>
                      <p className="mt-0.5 font-body text-xs leading-relaxed text-text-light">
                        {option.blurb}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Fonts ───────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <h2 className="font-heading font-bold text-text-dark">Fonts</h2>
        <p className="mb-4 font-body text-xs text-text-light">
          Headings, body text and the small bold text on buttons, set as a pair. Each one
          below is drawn in the font it picks — if the sample still looks like the others,
          give it a second to arrive.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FONT_PAIRINGS.map((pairing) => {
            const active = look.font === pairing.id;
            // Each card previews its own pairing, which means loading every sheet on this
            // page. It's an admin screen behind a login, and choosing a font you can't
            // see is not choosing.
            const href = fontHref(pairing.id);
            return (
              <button
                key={pairing.id}
                type="button"
                onClick={() => setLook('font', pairing.id)}
                className={`cursor-pointer rounded-xl border-2 px-3.5 py-3 text-left transition-all ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 bg-surface hover:border-primary/40'
                }`}
              >
                {href && <link key={href} rel="stylesheet" href={href} />}
                <span
                  className="block text-lg font-bold text-text-dark"
                  style={pairing.heading ? { fontFamily: pairing.heading } : undefined}
                >
                  Caramel Latte
                </span>
                <span
                  className="block text-xs text-text"
                  style={pairing.body ? { fontFamily: pairing.body } : undefined}
                >
                  Oat milk, two shots — ready in about 3 minutes
                </span>
                <span className="mt-2 block font-heading text-sm font-bold text-text-dark">
                  {pairing.name}
                </span>
                <p className="mt-0.5 font-body text-xs leading-relaxed text-text-light">
                  {pairing.blurb}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Individual colours ──────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading font-bold text-text-dark">Change a colour</h2>
            <p className="font-body text-xs text-text-light">
              These sit on top of the scheme.{' '}
              {overrideCount === 0
                ? 'Nothing is changed yet.'
                : `${overrideCount} changed — the rest follow ${presetById(working.preset).name}.`}
            </p>
          </div>
          {overrideCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="border border-gray-200"
              onClick={() => {
                setWorking((w) => ({ ...w, overrides: {} }));
                touch();
              }}
            >
              Put them all back
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group}>
              <h3 className="mb-2 font-accent text-xs font-bold uppercase tracking-wide text-text-light">
                {group}
              </h3>
              <div className="space-y-2">
                {THEME_TOKENS.filter((t) => t.group === group).map((token) => {
                  const value = colors[token.key];
                  const changed = token.key in (working.overrides ?? {});
                  return (
                    <div
                      key={token.key}
                      className="flex flex-wrap items-center gap-3 rounded-xl bg-bg px-3 py-2.5"
                    >
                      <input
                        type="color"
                        aria-label={token.label}
                        value={value}
                        onChange={(e) => setColor(token.key, e.target.value)}
                        className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-surface p-1"
                      />

                      <div className="min-w-[9rem] flex-1">
                        <p className="font-heading text-sm font-bold text-text-dark">
                          {token.label}
                        </p>
                        {token.hint && (
                          <p className="font-body text-xs text-text-light">{token.hint}</p>
                        )}
                      </div>

                      <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || isHexColor(v)) setColor(token.key, v);
                          else if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                            // Half-typed is fine to hold; it just isn't applied yet.
                            setWorking((w) => ({
                              ...w,
                              overrides: { ...w.overrides, [token.key]: v },
                            }));
                          }
                        }}
                        spellCheck={false}
                        className="w-28 rounded-lg border border-gray-200 bg-surface px-2 py-1.5 font-accent text-xs uppercase text-text focus:border-primary focus:outline-none"
                      />

                      <button
                        type="button"
                        onClick={() => clearOverride(token.key)}
                        disabled={!changed}
                        className="cursor-pointer font-body text-xs text-primary underline disabled:cursor-default disabled:text-text-light/40 disabled:no-underline"
                      >
                        Reset
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Preview ─────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <h2 className="font-heading font-bold text-text-dark">What it looks like</h2>
        <p className="mb-4 font-body text-xs text-text-light">
          The pieces that carry most of the colour, on all three screens. Remember the whole
          page around this is already showing your changes too.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* customer */}
          <div className="rounded-2xl bg-bg p-3">
            <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-wide text-text-light">
              A phone
            </p>
            <div className="rounded-xl border border-gray-100 bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="font-heading text-sm font-bold text-text-dark">
                  Open — about 3 min wait
                </span>
              </div>
              <p className="mt-1 font-body text-xs text-text-light">Two orders ahead of you.</p>
              <p className="mt-2 font-accent text-xs font-semibold text-warm">
                Youth Service — no charge today
              </p>
              <button className="mt-3 w-full rounded-[var(--radius-button)] bg-primary py-2 font-accent text-sm font-bold text-white">
                Place Your Order
              </button>
              <button className="mt-2 w-full rounded-[var(--radius-button)] border border-gray-200 py-2 font-accent text-sm font-bold text-text">
                No donation
              </button>
            </div>
          </div>

          {/* barista */}
          <div className="rounded-2xl bg-bg p-3">
            <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-wide text-text-light">
              The barista board
            </p>
            <div className="space-y-2">
              <div className="rounded-xl border-2 border-warning/50 bg-warning/10 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-heading text-sm font-bold text-text-dark">Maria K</span>
                  <span className="rounded-full bg-warning px-2 py-0.5 font-accent text-[10px] font-bold text-white">
                    Waiting
                  </span>
                </div>
                <p className="font-body text-xs text-text-light">Cappuccino · 2 shots, oat</p>
              </div>
              <div className="rounded-xl border-2 border-success/50 bg-success/10 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-heading text-sm font-bold text-text-dark">Anna B</span>
                  <span className="rounded-full bg-success px-2 py-0.5 font-accent text-[10px] font-bold text-white">
                    Ready
                  </span>
                </div>
                <p className="font-body text-xs text-text-light">Latte · 1 drink</p>
              </div>
              <div className="rounded-xl border-2 border-danger/50 bg-danger/10 p-2.5">
                <span className="font-heading text-sm font-bold text-danger">
                  ⚠ Remade — spilled
                </span>
              </div>
            </div>
          </div>

          {/* pinned order */}
          <div className="rounded-2xl bg-bg p-3">
            <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-wide text-text-light">
              Their own order
            </p>
            <div className="rounded-2xl bg-primary px-4 py-4 text-center text-white">
              <p className="font-accent text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                Your order
              </p>
              <p className="mt-1 font-heading text-3xl font-bold leading-none">3</p>
              <p className="mt-2 font-heading text-lg font-bold">Sarah K</p>
              <p className="font-body text-xs text-white/75">Latte, Cappuccino</p>
              <div className="mt-3 flex gap-1.5">
                <span className="h-1.5 flex-1 rounded-full bg-white" />
                <span className="h-1.5 flex-1 rounded-full bg-white" />
                <span className="h-1.5 flex-1 rounded-full bg-white/25" />
              </div>
              <p className="mt-3 font-heading text-sm font-bold">About 3 min</p>
            </div>
          </div>
        </div>

        {/* Type and buttons — the two things the look settings change that colour swatches
            can't show. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-surface p-4">
            <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-wide text-text-light">
              Type
            </p>
            <p className="font-heading text-xl font-bold text-text-dark">Caramel Oat Latte</p>
            <p className="mt-1 font-body text-sm text-text">
              Two shots, oat milk, one pump of caramel. Ready in about three minutes — we’ll
              call your name at the counter.
            </p>
            <p className="mt-2 font-accent text-xs font-bold uppercase tracking-wide text-text-light">
              Cup 2 of 3 · Hot
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-surface p-4">
            <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-wide text-text-light">
              Buttons and boxes
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Place order</Button>
              <Button size="sm" variant="secondary">
                Track order
              </Button>
              <Button size="sm" variant="success">
                Mark ready
              </Button>
              <Button size="sm" variant="danger">
                Cancel
              </Button>
              <Button size="sm" variant="ghost" className="border border-gray-200">
                Not now
              </Button>
            </div>
            <input
              readOnly
              value="Sarah K."
              className="mt-3 w-full rounded-xl border border-gray-200 bg-surface px-4 py-2.5 font-body text-sm text-text-dark"
            />
          </div>
        </div>
      </Card>

      {/* ── Share ───────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <h2 className="font-heading font-bold text-text-dark">Share a look</h2>
        <p className="mb-3 font-body text-xs text-text-light">
          This code is the whole thing — scheme, every colour you changed, and all the
          shape settings. Send it to someone and they can paste it in here, rather than
          reading eighteen hex codes down the phone. Loading a code only changes this page;
          it still takes a Save to reach the shop.
        </p>

        <div className="rounded-xl bg-bg p-3">
          <p className="break-all font-accent text-[11px] leading-relaxed text-text-light">
            {encodeThemeCode(working) || '—'}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" className="border border-gray-200" onClick={copyCode}>
            Copy this look
          </Button>
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Paste someone else’s code here"
            spellCheck={false}
            className="min-w-[14rem] flex-1 rounded-lg border border-gray-200 bg-surface px-3 py-2 font-accent text-xs text-text focus:border-primary focus:outline-none"
          />
          <Button size="sm" disabled={!codeInput.trim()} onClick={applyCode}>
            Load it
          </Button>
        </div>
        {codeMsg && <p className="mt-2 font-body text-xs text-text">{codeMsg}</p>}
      </Card>

      {/* ── Save ────────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-gray-100 bg-surface/95 px-4 py-4 backdrop-blur-sm">
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save colours'}
        </Button>
        <Button
          variant="ghost"
          className="border border-gray-200"
          disabled={!dirty}
          onClick={() => {
            setWorking(saved);
            touch();
          }}
        >
          Discard changes
        </Button>
        {savedNote && !dirty && (
          <span className="font-body text-sm text-success">
            Saved — every screen has it already.
          </span>
        )}
        {dirty && (
          <span className="font-body text-sm text-text-light">
            Showing on this page only until you save.
          </span>
        )}
      </div>
    </div>
  );
}
