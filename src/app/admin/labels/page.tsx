'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import LabelPreview from '@/components/admin/LabelPreview';
import {
  DEFAULT_LABEL_SETTINGS,
  normalizeLabelSettings,
  SAMPLE_LABELS,
  SCALE_MAX,
  SCALE_MIN,
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
  const [sampleIndex, setSampleIndex] = useState(0);
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
  }, []);

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
      show_cup_counter: clean.show_cup_counter,
      show_modifiers: clean.show_modifiers,
      show_note: clean.show_note,
      show_footer: clean.show_footer,
      uppercase_name: clean.uppercase_name,
      rotate_label: clean.rotate_label,
      name_scale: clean.name_scale,
      drink_scale: clean.drink_scale,
      modifier_scale: clean.modifier_scale,
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
      .update({ test_print_requested_at: new Date().toISOString() })
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

  const sample = SAMPLE_LABELS[sampleIndex];

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
            </div>
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

        {/* ── Preview ── */}
        <div className="lg:w-80">
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
            </div>

            <div className="flex justify-center rounded-xl bg-bg p-4">
              <LabelPreview settings={normalizeLabelSettings(settings)} data={sample.data} />
            </div>

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
  return (
    <label className="block">
      <span className="mb-1 block font-body text-xs text-text-light">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
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
