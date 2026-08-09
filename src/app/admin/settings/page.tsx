'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { TextArea } from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { fetchShopConfig, getShopStatus, DAY_NAMES, DEFAULT_SETTINGS } from '@/lib/shop';
import { cn } from '@/lib/utils';
import type { ShopSettings, OrderingHours, OrderingOverride } from '@/types';

const OVERRIDE_OPTIONS: { value: OrderingOverride; label: string; help: string }[] = [
  { value: 'auto', label: 'Follow Schedule', help: 'Opens and closes on the hours below' },
  { value: 'open', label: 'Force Open', help: 'Take orders now, ignoring the schedule' },
  { value: 'closed', label: 'Force Closed', help: 'Stop taking orders — e.g. you ran out early' },
  {
    value: 'locked',
    label: '🔒 Lock Everything',
    help: 'Nobody can order — access codes stop working too',
  },
];

/** Postgres hands back "09:00:00"; <input type="time"> wants "09:00". */
function toTimeInput(time: string): string {
  return time.slice(0, 5);
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [hours, setHours] = useState<OrderingHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchShopConfig().then((config) => {
      setSettings(config.settings);
      setHours(config.hours);
      setLoading(false);
    });
  }, []);

  const status = getShopStatus(settings, hours);

  function updateDay(day: number, patch: Partial<OrderingHours>) {
    setHours((prev) => prev.map((h) => (h.day_of_week === day ? { ...h, ...patch } : h)));
  }

  async function save() {
    setSaving(true);
    setError('');

    const { error: settingsError } = await supabase
      .from('shop_settings')
      .upsert({
        id: 1,
        service_title: settings.service_title.trim() || 'LOTG Coffee',
        service_subtitle: settings.service_subtitle.trim(),
        donations_enabled: settings.donations_enabled,
        donation_label: settings.donation_label.trim() || 'Donation',
        donation_presets: settings.donation_presets.trim(),
        coupons_enabled: settings.coupons_enabled,
        ordering_override: settings.ordering_override,
        closed_message: settings.closed_message.trim(),
      });

    const { error: hoursError } = await supabase.from('ordering_hours').upsert(
      hours.map((h) => ({
        day_of_week: h.day_of_week,
        is_open: h.is_open,
        open_time: h.open_time,
        close_time: h.close_time,
      })),
    );

    setSaving(false);

    if (settingsError || hoursError) {
      setError(settingsError?.message || hoursError?.message || 'Could not save');
      return;
    }
    setSavedAt(Date.now());
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-bold text-text-dark">Shop Settings</h1>
        <div className="flex items-center gap-3">
          {savedAt && !saving && (
            <span className="font-accent text-sm text-success">Saved ✓</span>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      {/* Live status readout */}
      <Card
        className={cn(
          'mb-6 border-2',
          status.isOpen
            ? 'border-success/40 bg-success/5'
            : status.isLocked
              ? 'border-danger/40 bg-danger/5'
              : 'border-warning/40 bg-warning/5',
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'h-3 w-3 rounded-full',
              status.isOpen ? 'animate-pulse bg-success' : status.isLocked ? 'bg-danger' : 'bg-warning',
            )}
          />
          <div>
            <p className="font-heading font-bold text-text-dark">
              {status.isOpen
                ? 'Customers can order right now'
                : status.isLocked
                  ? 'Ordering is locked — nobody can order'
                  : 'Ordering is closed right now'}
            </p>
            <p className="mt-0.5 font-body text-sm text-text-light">
              {status.isOpen && status.closesAt && `Closes at ${status.closesAt}.`}
              {!status.isOpen && status.nextOpensAt && `Opens ${status.nextOpensAt}.`}
              {status.reason === 'forced_open' && ' Forced open — ignoring the schedule.'}
              {status.reason === 'forced_closed' && ' Forced closed — ignoring the schedule.'}
              {status.reason === 'locked' && ' Locked — access codes are switched off too.'}
              {status.reason === 'no_hours_set' && ' No ordering hours are set yet.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Banner */}
      <Card className="mb-6">
        <h2 className="mb-1 font-heading font-bold text-text-dark">Service Banner</h2>
        <p className="mb-4 font-body text-sm text-text-light">
          The big title customers see at the top of the menu and the live screen.
        </p>
        <div className="space-y-4">
          <Input
            label="Title"
            placeholder="LOTG Coffee"
            value={settings.service_title}
            onChange={(e) => setSettings({ ...settings, service_title: e.target.value })}
          />
          <Input
            label="Subtitle"
            placeholder="Sunday Service · Coffee in the lobby"
            value={settings.service_subtitle}
            onChange={(e) => setSettings({ ...settings, service_subtitle: e.target.value })}
          />
        </div>
      </Card>

      {/* Ordering availability */}
      <Card className="mb-6">
        <h2 className="mb-1 font-heading font-bold text-text-dark">Ordering Availability</h2>
        <p className="mb-4 font-body text-sm text-text-light">
          Use the override when the day doesn&apos;t go to plan — running late, or out of milk.
        </p>

        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          {OVERRIDE_OPTIONS.map((opt) => {
            const selected = settings.ordering_override === opt.value;
            // The lock is the destructive one — it turns off the escape hatch everyone
            // else relies on, so it reads red rather than blending in with the others.
            const isLock = opt.value === 'locked';
            return (
              <button
                key={opt.value}
                onClick={() => setSettings({ ...settings, ordering_override: opt.value })}
                className={cn(
                  'cursor-pointer rounded-xl border-2 p-3 text-left transition-all',
                  selected
                    ? isLock
                      ? 'border-danger bg-danger/5'
                      : 'border-primary bg-primary/5'
                    : 'border-gray-200 bg-surface hover:border-gray-300',
                )}
              >
                <p
                  className={cn(
                    'font-accent text-sm font-bold',
                    selected ? (isLock ? 'text-danger' : 'text-primary') : 'text-text-dark',
                  )}
                >
                  {opt.label}
                </p>
                <p className="mt-0.5 font-body text-xs text-text-light">{opt.help}</p>
              </button>
            );
          })}
        </div>

        {settings.ordering_override === 'locked' && (
          <p className="mb-5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 font-body text-sm text-danger">
            <strong className="font-accent font-bold">Ordering is locked.</strong> Nobody can place
            an order — not with an access code, not a group that already unlocked one. Anyone
            mid-order is stopped before they pay. The counter tablet at{' '}
            <strong>/tablet</strong> still works, so a barista can take an order face to face.
          </p>
        )}

        <TextArea
          label="Message shown when closed"
          rows={2}
          value={settings.closed_message}
          onChange={(e) => setSettings({ ...settings, closed_message: e.target.value })}
        />
      </Card>

      {/* Weekly hours */}
      <Card className="mb-6">
        <h2 className="mb-1 font-heading font-bold text-text-dark">Ordering Hours</h2>
        <p className="mb-4 font-body text-sm text-text-light">
          Customers can only place orders inside these windows.
        </p>

        <div className="space-y-2">
          {DAY_NAMES.map((dayName, day) => {
            const dayHours = hours.find((h) => h.day_of_week === day);
            if (!dayHours) return null;

            return (
              <div
                key={day}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors',
                  dayHours.is_open ? 'border-primary/20 bg-primary/5' : 'border-gray-100 bg-surface',
                )}
              >
                <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dayHours.is_open}
                    onChange={(e) => updateDay(day, { is_open: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <span
                    className={cn(
                      'font-accent text-sm font-semibold',
                      dayHours.is_open ? 'text-primary' : 'text-text-light',
                    )}
                  >
                    {dayName}
                  </span>
                </label>

                {dayHours.is_open ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={toTimeInput(dayHours.open_time)}
                      onChange={(e) => updateDay(day, { open_time: e.target.value })}
                      className="rounded-lg border border-gray-200 bg-surface px-3 py-2 font-body text-sm text-text-dark focus:border-primary focus:outline-none"
                    />
                    <span className="font-body text-sm text-text-light">to</span>
                    <input
                      type="time"
                      value={toTimeInput(dayHours.close_time)}
                      onChange={(e) => updateDay(day, { close_time: e.target.value })}
                      className="rounded-lg border border-gray-200 bg-surface px-3 py-2 font-body text-sm text-text-dark focus:border-primary focus:outline-none"
                    />
                    {dayHours.close_time <= dayHours.open_time && (
                      <span className="font-accent text-xs text-danger">
                        Closing time must be after opening time
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="font-body text-sm text-text-light">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Donations */}
      <Card className="mb-6">
        <h2 className="mb-1 font-heading font-bold text-text-dark">Donations</h2>
        <p className="mb-4 font-body text-sm text-text-light">
          Turn this off for services where you&apos;d rather not ask.
        </p>

        <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-gray-100 p-3 transition-colors hover:border-gray-200">
          <input
            type="checkbox"
            checked={settings.donations_enabled}
            onChange={(e) => setSettings({ ...settings, donations_enabled: e.target.checked })}
            className="h-5 w-5 accent-primary"
          />
          <div>
            <span className="font-accent text-sm font-semibold text-text-dark">
              Ask customers for a donation
            </span>
            <p className="font-body text-xs text-text-light">
              {settings.donations_enabled
                ? 'The donation box shows at checkout.'
                : 'Checkout hides the donation box entirely.'}
            </p>
          </div>
        </label>

        {settings.donations_enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="What to call it"
              placeholder="Donation"
              value={settings.donation_label}
              onChange={(e) => setSettings({ ...settings, donation_label: e.target.value })}
            />
            <Input
              label="Quick amounts (comma-separated)"
              placeholder="1,2,5"
              value={settings.donation_presets}
              onChange={(e) => setSettings({ ...settings, donation_presets: e.target.value })}
            />
          </div>
        )}
      </Card>

      {/* Coupons */}
      <Card className="mb-6">
        <h2 className="mb-1 font-heading font-bold text-text-dark">Coupons</h2>
        <p className="mb-4 font-body text-sm text-text-light">
          Hide the coupon box when you&apos;re not running any codes — it only invites people to
          hunt for one they don&apos;t have.
        </p>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-gray-100 p-3 transition-colors hover:border-gray-200">
          <input
            type="checkbox"
            checked={settings.coupons_enabled}
            onChange={(e) => setSettings({ ...settings, coupons_enabled: e.target.checked })}
            className="h-5 w-5 accent-primary"
          />
          <div>
            <span className="font-accent text-sm font-semibold text-text-dark">
              Let customers enter a coupon code
            </span>
            <p className="font-body text-xs text-text-light">
              {settings.coupons_enabled
                ? 'The coupon box shows at checkout and on the tablet.'
                : 'The coupon box is hidden everywhere. Existing codes still work if re-enabled.'}
            </p>
          </div>
        </label>
      </Card>

      <div className="flex justify-end pb-6">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
