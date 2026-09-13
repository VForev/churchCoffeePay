'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  THEME_TOKENS,
  cacheTheme,
  fetchTheme,
  isHexColor,
  normalizeHex,
  presetById,
  resolveColors,
  saveTheme,
  themeCss,
  type ThemeColors,
  type ThemeSettings,
} from '@/lib/theme';

/**
 * Look &amp; Colours.
 *
 * Pick a scheme, or change any single colour on top of it. What you are editing is
 * painted onto this page as you go — the `<style>` below sits after the app's own
 * ThemeProvider in document order, so an unsaved edit previews everywhere on this screen
 * and nowhere else until Save. A colour picker that only tints a swatch is how you end
 * up saving something nobody looked at.
 *
 * Overrides are stored separately from the preset (see src/lib/theme.ts): "Slate, but
 * with a warmer page" stays Slate, and clearing one colour puts it back to the scheme's
 * value rather than to navy blue.
 */
const GROUPS = ['Actions', 'States', 'Page', 'Text'] as const;

export default function ThemeAdminPage() {
  const [saved, setSaved] = useState<ThemeSettings>(DEFAULT_THEME);
  const [working, setWorking] = useState<ThemeSettings>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState(false);

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
  const dirty =
    working.preset !== saved.preset ||
    JSON.stringify(working.overrides ?? {}) !== JSON.stringify(saved.overrides ?? {});

  function choosePreset(id: string) {
    // Overrides are kept on purpose: someone who darkened the page text meant it, and
    // silently dropping it while they browse schemes is how an edit gets lost.
    setWorking((w) => ({ ...w, preset: id }));
    setSavedNote(false);
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
    setSavedNote(false);
  }

  function clearOverride(token: string) {
    setWorking((w) => {
      const overrides = { ...w.overrides };
      delete overrides[token];
      return { ...w, overrides };
    });
    setSavedNote(false);
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
    setSavedNote(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const overrideCount = Object.keys(working.overrides ?? {}).length;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Everything below is painted in what's being edited, saved or not. */}
      <style dangerouslySetInnerHTML={{ __html: themeCss(colors) }} />

      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text-dark">Look &amp; Colours</h1>
        <p className="mt-1 font-body text-sm text-text-light">
          Changes here reach every screen — the customer menu, the tablet, the barista board
          and the TV in the lobby — the moment you save. Nothing needs reloading.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl bg-danger/10 px-5 py-4 font-body text-sm text-text">
          {error}
        </div>
      )}

      {/* ── Schemes ─────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <h2 className="font-heading font-bold text-text-dark">Scheme</h2>
        <p className="mb-4 font-body text-xs text-text-light">
          Every colour in the four church schemes is off the church colour sheet — nothing
          invented.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEME_PRESETS.map((preset) => {
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

                <div className="mt-3 flex gap-1.5">
                  {['primary', 'success', 'warning', 'danger', 'bg', 'text-dark'].map((token) => (
                    <span
                      key={token}
                      className="h-7 w-7 rounded-lg border border-black/10"
                      style={{ background: preset.colors[token] }}
                      title={token}
                    />
                  ))}
                </div>

                <p className="mt-3 font-body text-xs leading-relaxed text-text-light">
                  {preset.blurb}
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
              These sit on top of the scheme. {overrideCount === 0
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
                setSavedNote(false);
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
          The pieces that carry most of the colour, on all three screens.
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
              <button className="mt-3 w-full rounded-full bg-primary py-2 font-accent text-sm font-bold text-white">
                Place Your Order
              </button>
              <button className="mt-2 w-full rounded-full border border-gray-200 py-2 font-accent text-sm font-bold text-text">
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

        <p className="mt-4 font-body text-xs text-text-light">
          <strong className="font-accent">Keep backgrounds light.</strong> Card edges and a
          few surfaces are still fixed light grey, so a dark page colour looks broken rather
          than dark. A proper dark mode is a separate job.
        </p>
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
            setSavedNote(false);
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
            Previewing on this page only until you save.
          </span>
        )}
      </div>
    </div>
  );
}
