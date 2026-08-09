'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import LabelPreview from '@/components/admin/LabelPreview';
import PreviewComposer, {
  DEFAULT_PREVIEW_CONTENT,
  type PreviewContent,
} from '@/components/admin/PreviewComposer';
import {
  DEFAULT_LABEL_SETTINGS,
  normalizeLabelSettings,
  orderGroupNames,
  SAMPLE_LABELS,
  SCALE_MAX,
  SCALE_MIN,
  type LabelData,
  type LabelSettings,
} from '@/lib/labels';
import { cn } from '@/lib/utils';

/**
 * Cup label layout.
 *
 * The preview on the right is drawn from the same measurements the printer uses, so
 * what you see is what comes off the roll — but a screen can't tell you whether the
 * label is physically aligned in the printer, which is what "Send test label" is for.
 */
export default function AdminLabelsPage() {
  const [settings, setSettings] = useState<LabelSettings>(DEFAULT_LABEL_SETTINGS);
  // The shop's real groups with their options — drives the per-group controls AND the
  // custom preview builder below.
  const [groupOptions, setGroupOptions] = useState<{ name: string; options: string[] }[]>([]);
  const modifierGroups = groupOptions.map((g) => g.name);
  // sampleIndex -1 = the custom, build-your-own preview; 0..n = the canned samples.
  const [sampleIndex, setSampleIndex] = useState(0);
  const [previewContent, setPreviewContent] = useState<PreviewContent>(DEFAULT_PREVIEW_CONTENT);
  // Guards the save effect so it doesn't overwrite stored content with the defaults before
  // the stored value has loaded in.
  const previewHydrated = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testSentAt, setTestSentAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('label_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        // Before the migration runs there's no table — fall back to the defaults and
        // say so, rather than showing a broken page.
        if (loadError) setError('Run supabase-label-settings.sql to save changes here.');
        setSettings(normalizeLabelSettings(data));
        setLoading(false);
      });

    // The live modifier groups with their options, so each group gets its own row of
    // controls AND you can pick real options to preview. A group added at /admin/modifiers
    // appears here automatically on next load.
    supabase
      .from('modifier_groups')
      .select('name, display_order, modifiers ( name, display_order )')
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setGroupOptions(
          data.map((g) => ({
            name: g.name as string,
            options: ((g.modifiers as { name: string; display_order: number }[]) ?? [])
              .slice()
              .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
              .map((o) => o.name),
          })),
        );
      });
  }, []);

  // Remember the custom preview (and which sample is selected) across reloads, per browser,
  // so it stays exactly as you left it until you change it again. It's a testing convenience,
  // not label config, so it lives in localStorage rather than the database.
  const PREVIEW_STORAGE_KEY = 'lotg-label-preview';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { content?: PreviewContent; sampleIndex?: number };
        if (saved.content) setPreviewContent({ ...DEFAULT_PREVIEW_CONTENT, ...saved.content });
        if (typeof saved.sampleIndex === 'number') setSampleIndex(saved.sampleIndex);
      }
    } catch {
      /* ignore corrupt/blocked storage — just start from defaults */
    }
    previewHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!previewHydrated.current) return;
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ content: previewContent, sampleIndex }));
    } catch {
      /* ignore */
    }
  }, [previewContent, sampleIndex]);

  /** The LabelData the preview draws — either a canned sample or the custom builder. */
  function buildPreviewData(): LabelData {
    if (sampleIndex >= 0) return SAMPLE_LABELS[sampleIndex].data;
    const modifiers = groupOptions
      .map((g) => ({ group: g.name, options: previewContent.selected[g.name] ?? [] }))
      .filter((line) => line.options.length > 0);
    return {
      temp: previewContent.temp,
      customerName: previewContent.customerName || 'Name',
      cupIndex: 1,
      cupTotal: previewContent.multiCup ? 2 : 1,
      drinkName: previewContent.drinkName || 'Drink',
      modifiers,
      note: previewContent.note.trim() || null,
      orderCode: '7F3A',
      timeText: '9:42 AM',
    };
  }

  /** Update one modifier group's per-label style, leaving the others untouched. */
  function patchGroupStyle(group: string, changes: Partial<{ show: boolean; scale: number }>) {
    setSettings((prev) => {
      const current = prev.modifier_group_styles[group] ?? { show: true, scale: 1 };
      return {
        ...prev,
        modifier_group_styles: {
          ...prev.modifier_group_styles,
          [group]: { ...current, ...changes },
        },
      };
    });
    setSavedAt(null);
  }

  /** Move a category up or down in the printed order, writing the full order back. */
  function moveGroup(orderedNames: string[], index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= orderedNames.length) return;
    const next = [...orderedNames];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ modifier_group_order: next });
  }

  function patch(changes: Partial<LabelSettings>) {
    setSettings((prev) => ({ ...prev, ...changes }));
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError('');

    const clean = normalizeLabelSettings(settings);
    const { error: saveError } = await supabase.from('label_settings').upsert({
      id: 1,
      width_mm: clean.width_mm,
      height_mm: clean.height_mm,
      margin_mm: clean.margin_mm,
      show_temp_band: clean.show_temp_band,
      show_logo: clean.show_logo,
      show_church_name: clean.show_church_name,
      church_name: clean.church_name,
      show_cup_counter: clean.show_cup_counter,
      show_modifiers: clean.show_modifiers,
      show_note: clean.show_note,
      show_footer: clean.show_footer,
      uppercase_name: clean.uppercase_name,
      uppercase_drink: clean.uppercase_drink,
      center_text: clean.center_text,
      rotate_label: clean.rotate_label,
      name_scale: clean.name_scale,
      drink_scale: clean.drink_scale,
      modifier_scale: clean.modifier_scale,
      note_scale: clean.note_scale,
      footer_scale: clean.footer_scale,
      brand_scale: clean.brand_scale,
      modifier_group_styles: clean.modifier_group_styles,
      modifier_group_order: clean.modifier_group_order,
      auto_print: clean.auto_print,
      updated_at: new Date().toISOString(),
    });

    if (saveError) setError(saveError.message);
    else {
      setSettings(clean);
      setSavedAt(Date.now());
    }
    setSaving(false);
  }

  /** The agent watches this timestamp and prints one sample label when it changes. */
  async function sendTestLabel() {
    setError('');
    const { error: testError } = await supabase
      .from('label_settings')
      .update({
        test_print_requested_at: new Date().toISOString(),
        // Send exactly what's in the preview right now, so the roll matches the screen.
        test_label_data: buildPreviewData(),
      })
      .eq('id', 1);

    if (testError) setError(testError.message);
    else setTestSentAt(Date.now());
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const previewData = buildPreviewData();

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text-dark">Cup Labels</h1>
        <p className="mt-0.5 font-body text-sm text-text-light">
          Changes reach the shop PC as soon as you save — no restart needed.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 font-body text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        {/* ── Controls ── */}
        <div className="space-y-6">
          <Card>
            <h2 className="mb-1 font-heading font-bold text-text-dark">Label size</h2>
            <p className="mb-4 font-body text-xs text-text-light">
              Measure the sticker itself, not the backing paper. Getting this wrong is the
              number one reason labels come out misaligned.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <NumberField
                label="Width (mm)"
                value={settings.width_mm}
                min={20}
                max={100}
                onChange={(width_mm) => patch({ width_mm })}
              />
              <NumberField
                label="Height (mm)"
                value={settings.height_mm}
                min={15}
                max={100}
                onChange={(height_mm) => patch({ height_mm })}
              />
              <NumberField
                label="Margin (mm)"
                value={settings.margin_mm}
                min={0}
                max={8}
                step={0.5}
                onChange={(margin_mm) => patch({ margin_mm })}
              />
            </div>

            <div className="mt-3 border-t border-gray-100 pt-3">
              <Toggle
                label="Flip for a wide roll"
                help="The preview always shows the label the right way up. If a test print comes out sideways, turn this on — it's needed for wide rolls (like 40×30) and off for tall rolls (like 50×80). Flip it until the print matches the preview."
                checked={settings.rotate_label}
                onChange={(rotate_label) => patch({ rotate_label })}
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 font-heading font-bold text-text-dark">Church branding</h2>
            <p className="mb-4 font-body text-xs text-text-light">
              The mark and church name print across the top of every cup, above the customer&apos;s
              name. On a short roll (50 × 30) this row costs about a line and a half of
              modifiers — worth a look at the preview before Sunday. Turn both off and the label
              goes back to being plain.
            </p>

            <div className="space-y-1">
              <Toggle
                label="Church logo"
                help="The Light of the Gospel mark, printed solid black so it stays crisp on thermal paper"
                checked={settings.show_logo}
                onChange={(show_logo) => patch({ show_logo })}
              />
              <Toggle
                label="Church name"
                help="Printed beside the mark — or on its own if the mark is switched off"
                checked={settings.show_church_name}
                onChange={(show_church_name) => patch({ show_church_name })}
              />
            </div>

            {settings.show_church_name && (
              <label className="mt-3 block">
                <span className="mb-1 block font-body text-xs text-text-light">What it says</span>
                <input
                  type="text"
                  value={settings.church_name}
                  maxLength={40}
                  placeholder={DEFAULT_LABEL_SETTINGS.church_name}
                  onChange={(e) => patch({ church_name: e.target.value })}
                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-text-dark focus:border-primary focus:outline-none"
                />
              </label>
            )}

            {(settings.show_logo || settings.show_church_name) && (
              <div className="mt-4">
                <Slider
                  label="Branding size"
                  value={settings.brand_scale}
                  onChange={(brand_scale) => patch({ brand_scale })}
                />
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 font-heading font-bold text-text-dark">When to print</h2>
            <p className="mb-4 font-body text-xs text-text-light">
              Whether labels print on their own, or the barista prints each order by hand.
            </p>
            <Toggle
              label="Print automatically when an order comes in"
              help="On: a label prints for every cup the moment an order is placed. Off: nothing prints on its own — the barista taps 🖨 on the order in /barista to print it. The 🖨 button works either way."
              checked={settings.auto_print}
              onChange={(auto_print) => patch({ auto_print })}
            />
          </Card>

          <Card>
            <h2 className="mb-1 font-heading font-bold text-text-dark">What&apos;s on the label</h2>
            <p className="mb-4 font-body text-xs text-text-light">
              Turn something off and everything else gets its space back.
            </p>

            <div className="space-y-1">
              <Toggle
                label="HOT CUP / COLD CUP band"
                help="The black bar at the top — which cup to grab"
                checked={settings.show_temp_band}
                onChange={(show_temp_band) => patch({ show_temp_band })}
              />
              <Toggle
                label="Cup counter"
                help="&ldquo;CUP 1 OF 3&rdquo;, on multi-drink orders only"
                checked={settings.show_cup_counter}
                onChange={(show_cup_counter) => patch({ show_cup_counter })}
              />
              <Toggle
                label="Modifiers"
                help="Size, milk, syrups, extras"
                checked={settings.show_modifiers}
                onChange={(show_modifiers) => patch({ show_modifiers })}
              />
              <Toggle
                label="Special instructions"
                help="The boxed note — the easiest thing to miss on a busy morning"
                checked={settings.show_note}
                onChange={(show_note) => patch({ show_note })}
              />
              <Toggle
                label="Order code and time"
                help="The small line at the bottom, for matching a cup back to the board"
                checked={settings.show_footer}
                onChange={(show_footer) => patch({ show_footer })}
              />
              <Toggle
                label="Name in CAPITALS"
                help="SARAH K instead of Sarah K"
                checked={settings.uppercase_name}
                onChange={(uppercase_name) => patch({ uppercase_name })}
              />
              <Toggle
                label="Drink in CAPITALS"
                help="VANILLA LATTE instead of Vanilla Latte"
                checked={settings.uppercase_drink}
                onChange={(uppercase_drink) => patch({ uppercase_drink })}
              />
              <Toggle
                label="Centre the text"
                help="Centre the name, drink and modifiers instead of lining them up on the left"
                checked={settings.center_text}
                onChange={(center_text) => patch({ center_text })}
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 font-heading font-bold text-text-dark">Text size</h2>
            <p className="mb-4 font-body text-xs text-text-light">
              A starting size — a long name still shrinks itself to fit rather than
              spilling over the drink.
            </p>

            <div className="space-y-4">
              <Slider
                label="Customer name"
                value={settings.name_scale}
                onChange={(name_scale) => patch({ name_scale })}
              />
              <Slider
                label="Drink name"
                value={settings.drink_scale}
                onChange={(drink_scale) => patch({ drink_scale })}
              />
              <Slider
                label="Modifiers"
                value={settings.modifier_scale}
                onChange={(modifier_scale) => patch({ modifier_scale })}
              />
              <Slider
                label="Special instructions (note)"
                value={settings.note_scale}
                onChange={(note_scale) => patch({ note_scale })}
              />
              <Slider
                label="Order code & time"
                value={settings.footer_scale}
                onChange={(footer_scale) => patch({ footer_scale })}
              />
            </div>
          </Card>

          {modifierGroups.length > 0 && (() => {
            // Show the categories in the order they'll print, and let ▲/▼ change it.
            const orderedNames = orderGroupNames(modifierGroups, settings.modifier_group_order);
            return (
              <Card>
                <h2 className="mb-1 font-heading font-bold text-text-dark">Modifier categories</h2>
                <p className="mb-4 font-body text-xs text-text-light">
                  These print top to bottom in the order shown — use ▲/▼ to reorder. Switch one
                  off to keep it off the label, or size it on its own (on top of the overall
                  Modifiers size above). New categories added at <strong>/admin/modifiers</strong>{' '}
                  appear here automatically.
                </p>

                <div className="space-y-4">
                  {orderedNames.map((group, i) => {
                    const style = settings.modifier_group_styles[group] ?? { show: true, scale: 1 };
                    return (
                      <div key={group} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <button
                              onClick={() => moveGroup(orderedNames, i, -1)}
                              disabled={i === 0}
                              aria-label={`Move ${group} up`}
                              className="cursor-pointer px-1 leading-none text-text-light hover:text-primary disabled:cursor-default disabled:opacity-30"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveGroup(orderedNames, i, 1)}
                              disabled={i === orderedNames.length - 1}
                              aria-label={`Move ${group} down`}
                              className="cursor-pointer px-1 leading-none text-text-light hover:text-primary disabled:cursor-default disabled:opacity-30"
                            >
                              ▼
                            </button>
                          </div>
                          <label className="flex flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={style.show}
                              onChange={(e) => patchGroupStyle(group, { show: e.target.checked })}
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="font-body text-sm font-semibold text-text-dark">{group}</span>
                          </label>
                        </div>
                        {style.show && (
                          <div className="mt-2 pl-9">
                            <Slider
                              label="Size"
                              value={style.scale}
                              onChange={(scale) => patchGroupStyle(group, { scale })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })()}

          <Card>
            <h2 className="mb-1 font-heading font-bold text-text-dark">Custom preview</h2>
            <p className="mb-4 font-body text-xs text-text-light">
              Build a label from your real drinks and options to see exactly how it looks — the
              preview switches to <strong>Custom</strong> as soon as you change something here.
            </p>
            <PreviewComposer
              groups={groupOptions}
              value={previewContent}
              onChange={(next) => {
                setPreviewContent(next);
                setSampleIndex(-1);
              }}
            />
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save layout'}
            </Button>
            <button
              onClick={sendTestLabel}
              className="cursor-pointer rounded-full border border-gray-200 bg-surface px-5 py-2.5 font-accent text-sm font-semibold text-text transition-colors hover:bg-gray-50"
            >
              🖨 Send test label
            </button>
            <button
              onClick={() => patch(DEFAULT_LABEL_SETTINGS)}
              className="cursor-pointer px-2 py-2.5 font-accent text-sm text-text-light hover:text-text"
            >
              Reset to defaults
            </button>

            {savedAt && (
              <span className="font-accent text-sm font-semibold text-success">Saved ✓</span>
            )}
            {testSentAt && (
              <span className="font-body text-sm text-text-light">
                Sent to the shop PC — it prints if the agent is running.
              </span>
            )}
          </div>

          <p className="font-body text-xs text-text-light">
            <strong>Save first, then test.</strong> The test label prints the layout that
            is <em>saved</em>, not the one on screen — the printer reads the database, not
            this page.
          </p>
        </div>

        {/* ── Preview ── (sticks to the top on wide screens so it stays in view while
            you scroll the controls; self-start keeps it content-height so it can move) */}
        <div className="lg:sticky lg:top-6 lg:z-10 lg:w-80 lg:self-start">
          <Card>
            <h2 className="mb-1 font-heading font-bold text-text-dark">Preview</h2>
            <p className="mb-3 font-body text-xs text-text-light">
              Drawn from the same measurements the printer uses — shown larger than life.
            </p>

            <div className="mb-4 flex flex-wrap gap-1.5">
              {SAMPLE_LABELS.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => setSampleIndex(i)}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 font-accent text-xs font-semibold transition-colors',
                    i === sampleIndex
                      ? 'bg-primary text-white'
                      : 'bg-bg text-text-light hover:bg-gray-100',
                  )}
                >
                  {s.name}
                </button>
              ))}
              <button
                onClick={() => setSampleIndex(-1)}
                className={cn(
                  'cursor-pointer rounded-full px-3 py-1.5 font-accent text-xs font-semibold transition-colors',
                  sampleIndex === -1 ? 'bg-primary text-white' : 'bg-bg text-text-light hover:bg-gray-100',
                )}
              >
                Custom
              </button>
            </div>

            <div className="flex justify-center rounded-xl bg-bg p-4">
              <LabelPreview settings={normalizeLabelSettings(settings)} data={previewData} />
            </div>

            {sampleIndex === -1 && (
              <p className="mt-2 text-center font-body text-xs text-text-light">
                Building a custom label below ↓
              </p>
            )}

            <p className="mt-3 text-center font-body text-xs text-text-light">
              {settings.width_mm} × {settings.height_mm} mm
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Small form pieces ────────────────────────────────────────────────────────

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  // The field holds raw text while you type, so you can clear it completely and enter a
  // new number — a plain value={number} snaps an empty box back to a digit mid-edit. The
  // number is only committed (and clamped to the min/max) when the field loses focus.
  const [text, setText] = useState(String(value));

  // Re-sync when the value changes from elsewhere (initial load, "Reset to defaults"),
  // but not from our own keystrokes echoing back — that would fight what you're typing.
  useEffect(() => {
    setText((cur) => (Number(cur) === value ? cur : String(value)));
  }, [value]);

  function commit() {
    const n = Number(text);
    if (text.trim() === '' || Number.isNaN(n)) {
      setText(String(value)); // nothing usable typed — put the old number back
      return;
    }
    const clamped = Math.min(Math.max(n, min), max);
    setText(String(clamped));
    onChange(clamped);
  }

  return (
    <label className="block">
      <span className="mb-1 block font-body text-xs text-text-light">{label}</span>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setText(e.target.value);
          // Update the live preview as you type, but don't clamp yet — clamping mid-edit
          // is what makes the box feel like it's fighting you.
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && !Number.isNaN(n)) onChange(n);
        }}
        onBlur={commit}
        className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-text-dark focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-gray-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span className="min-w-0">
        <span className="block font-body text-sm font-semibold text-text-dark">{label}</span>
        <span className="block font-body text-xs text-text-light">{help}</span>
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="font-body text-sm text-text-dark">{label}</span>
        <span className="font-accent text-xs text-text-light">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={SCALE_MIN}
        max={SCALE_MAX}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-primary"
      />
    </label>
  );
}
