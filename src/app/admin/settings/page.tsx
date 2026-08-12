'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { TextArea } from '@/components/ui/Input';
import Switch from '@/components/ui/Switch';
import IOSSpinner from '@/components/ui/Spinner';
import { ListGroup, ListRow } from '@/components/ui/List';
import { fadeUp, springPop, springSnappy, staggerParent } from '@/lib/motion';
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
        <IOSSpinner size={28} />
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerParent}
      initial="hidden"
      animate="show"
      className="max-w-3xl space-y-7 pb-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-ios-largetitle text-label">Settings</h1>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {savedAt && !saving && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={springPop}
                className="text-ios-subhead flex items-center gap-1 font-medium text-success"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                  <path
                    d="M2.5 8.5l3.5 3.5 7.5-8"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Saved
              </motion.span>
            )}
          </AnimatePresence>
          <Button onClick={save} disabled={saving}>
            {saving && <IOSSpinner size={16} className="text-white" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSnappy}
            className="text-ios-subhead overflow-hidden rounded-[var(--r-md)] bg-danger/12 px-4 py-3 text-danger"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Live status readout */}
      <motion.div
        variants={fadeUp}
        className={cn(
          'flex items-center gap-3 rounded-[var(--r-lg)] px-4 py-4 ring-1',
          status.isOpen
            ? 'bg-success/10 ring-success/30'
            : status.isLocked
              ? 'bg-danger/10 ring-danger/30'
              : 'bg-warning/10 ring-warning/30',
        )}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {status.isOpen && (
            <motion.span
              animate={{ scale: [1, 2.4], opacity: [0.7, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inline-flex h-full w-full rounded-full bg-success"
            />
          )}
          <span
            className={cn(
              'relative inline-flex h-2.5 w-2.5 rounded-full',
              status.isOpen ? 'bg-success' : status.isLocked ? 'bg-danger' : 'bg-warning',
            )}
          />
        </span>
        <div>
          <p className="text-ios-headline text-label">
            {status.isOpen
              ? 'Customers can order right now'
              : status.isLocked
                ? 'Ordering is locked — nobody can order'
                : 'Ordering is closed right now'}
          </p>
          <p className="text-ios-subhead mt-0.5 text-label-secondary">
            {status.isOpen && status.closesAt && `Closes at ${status.closesAt}.`}
            {!status.isOpen && status.nextOpensAt && `Opens ${status.nextOpensAt}.`}
            {status.reason === 'forced_open' && ' Forced open — ignoring the schedule.'}
            {status.reason === 'forced_closed' && ' Forced closed — ignoring the schedule.'}
            {status.reason === 'locked' && ' Locked — access codes are switched off too.'}
            {status.reason === 'no_hours_set' && ' No ordering hours are set yet.'}
          </p>
        </div>
      </motion.div>

      {/* Banner */}
      <motion.div variants={fadeUp}>
        <ListGroup
          header="Service Banner"
          footer="The big title customers see at the top of the menu and the live screen."
        >
          <div className="space-y-4 p-4">
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
        </ListGroup>
      </motion.div>

      {/* Ordering availability */}
      <motion.div variants={fadeUp}>
        <ListGroup
          header="Ordering Availability"
          footer="Use the override when the day doesn't go to plan — running late, or out of milk."
        >
          {OVERRIDE_OPTIONS.map((opt) => {
            const selected = settings.ordering_override === opt.value;
            // The lock is the destructive one — it turns off the escape hatch everyone
            // else relies on, so it reads red rather than blending in with the others.
            const isLock = opt.value === 'locked';
            return (
              <ListRow
                key={opt.value}
                label={opt.label}
                detail={opt.help}
                destructive={isLock && selected}
                onClick={() => setSettings({ ...settings, ordering_override: opt.value })}
                accessory={
                  // A checkmark on the chosen row, iOS's way of showing a
                  // single choice in a list — not four boxed radio buttons.
                  <AnimatePresence>
                    {selected && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.4 }}
                        transition={springPop}
                        className={isLock ? 'text-danger' : 'text-primary'}
                      >
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                          <path
                            d="M2.5 8.5l3.5 3.5 7.5-8"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </motion.span>
                    )}
                  </AnimatePresence>
                }
              />
            );
          })}
        </ListGroup>

        <AnimatePresence>
          {settings.ordering_override === 'locked' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={springSnappy}
              className="overflow-hidden"
            >
              <p className="text-ios-subhead mt-3 rounded-[var(--r-md)] bg-danger/12 px-4 py-3 text-danger">
                <strong className="font-semibold">Ordering is locked.</strong> Nobody can place an
                order — not with an access code, not a group that already unlocked one. Anyone
                mid-order is stopped before they pay. The counter tablet at{' '}
                <strong className="font-semibold">/tablet</strong> still works, so a barista can
                take an order face to face.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3">
          <ListGroup>
            <div className="p-4">
              <TextArea
                label="Message shown when closed"
                rows={2}
                value={settings.closed_message}
                onChange={(e) => setSettings({ ...settings, closed_message: e.target.value })}
              />
            </div>
          </ListGroup>
        </div>
      </motion.div>

      {/* Weekly hours */}
      <motion.div variants={fadeUp}>
        <ListGroup
          header="Ordering Hours"
          footer="Customers can only place orders inside these windows."
        >
          {DAY_NAMES.map((dayName, day) => {
            const dayHours = hours.find((h) => h.day_of_week === day);
            if (!dayHours) return null;
            const invalid = dayHours.is_open && dayHours.close_time <= dayHours.open_time;

            return (
              <div
                key={day}
                className="relative px-4 py-2.5 before:absolute before:bottom-0 before:left-4 before:right-0 before:h-px before:bg-separator last:before:hidden"
              >
                <div className="flex min-h-[44px] items-center gap-3">
                  <span
                    className={cn(
                      'text-ios-body w-28 shrink-0',
                      dayHours.is_open ? 'text-label' : 'text-label-tertiary',
                    )}
                  >
                    {dayName}
                  </span>

                  <div className="flex flex-1 items-center justify-end gap-2">
                    <AnimatePresence mode="wait" initial={false}>
                      {dayHours.is_open ? (
                        <motion.div
                          key="times"
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          transition={springSnappy}
                          className="flex flex-wrap items-center justify-end gap-1.5"
                        >
                          <input
                            type="time"
                            value={toTimeInput(dayHours.open_time)}
                            onChange={(e) => updateDay(day, { open_time: e.target.value })}
                            className="tnum rounded-[var(--r-sm)] bg-fill-tertiary px-2.5 py-1.5 text-[15px] text-label focus:outline-none focus:ring-2 focus:ring-primary/25"
                          />
                          <span className="text-ios-subhead text-label-tertiary">to</span>
                          <input
                            type="time"
                            value={toTimeInput(dayHours.close_time)}
                            onChange={(e) => updateDay(day, { close_time: e.target.value })}
                            className="tnum rounded-[var(--r-sm)] bg-fill-tertiary px-2.5 py-1.5 text-[15px] text-label focus:outline-none focus:ring-2 focus:ring-primary/25"
                          />
                        </motion.div>
                      ) : (
                        <motion.span
                          key="closed"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-ios-subhead text-label-tertiary"
                        >
                          Closed
                        </motion.span>
                      )}
                    </AnimatePresence>

                    <Switch
                      checked={dayHours.is_open}
                      onChange={(v) => updateDay(day, { is_open: v })}
                      label={dayName}
                    />
                  </div>
                </div>

                {invalid && (
                  <p className="text-ios-caption pb-1 text-right text-danger">
                    Closing time must be after opening time
                  </p>
                )}
              </div>
            );
          })}
        </ListGroup>
      </motion.div>

      {/* Donations */}
      <motion.div variants={fadeUp}>
        <ListGroup
          header="Donations"
          footer="Turn this off for services where you'd rather not ask."
        >
          <ListRow
            label="Ask customers for a donation"
            detail={
              settings.donations_enabled
                ? 'The donation box shows at checkout.'
                : 'Checkout hides the donation box entirely.'
            }
            accessory={
              <Switch
                checked={settings.donations_enabled}
                onChange={(v) => setSettings({ ...settings, donations_enabled: v })}
                label="Ask customers for a donation"
              />
            }
          />
        </ListGroup>

        <AnimatePresence>
          {settings.donations_enabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={springSnappy}
              className="overflow-hidden"
            >
              <div className="mt-3">
                <ListGroup>
                  <div className="grid gap-4 p-4 sm:grid-cols-2">
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
                      onChange={(e) =>
                        setSettings({ ...settings, donation_presets: e.target.value })
                      }
                    />
                  </div>
                </ListGroup>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Coupons */}
      <motion.div variants={fadeUp}>
        <ListGroup
          header="Coupons"
          footer="Hide the coupon box when you're not running any codes — it only invites people to hunt for one they don't have."
        >
          <ListRow
            label="Let customers enter a coupon code"
            detail={
              settings.coupons_enabled
                ? 'The coupon box shows at checkout and on the tablet.'
                : 'Hidden everywhere. Existing codes still work if re-enabled.'
            }
            accessory={
              <Switch
                checked={settings.coupons_enabled}
                onChange={(v) => setSettings({ ...settings, coupons_enabled: v })}
                label="Let customers enter a coupon code"
              />
            }
          />
        </ListGroup>
      </motion.div>

      <motion.div variants={fadeUp} className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving && <IOSSpinner size={18} className="text-white" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </motion.div>
    </motion.div>
  );
}
