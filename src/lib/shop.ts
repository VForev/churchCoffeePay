'use client';

import { supabase } from './supabase';
import type { ShopSettings, OrderingHours } from '@/types';

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DEFAULT_SETTINGS: ShopSettings = {
  id: 1,
  service_title: 'LOTG Coffee',
  service_subtitle: 'Sunday Service',
  donations_enabled: true,
  donation_label: 'Donation',
  donation_presets: '1,2,5',
  ordering_override: 'auto',
  closed_message: 'Ordering is closed right now. Come see us during service!',
};

export interface ShopStatus {
  isOpen: boolean;
  /** Why ordering is open or closed, for showing the right message. */
  reason: 'scheduled' | 'forced_open' | 'forced_closed' | 'outside_hours' | 'no_hours_set';
  /** e.g. "11:30 AM" — only set while open. */
  closesAt: string | null;
  /** e.g. "Sunday at 9:00 AM" — only set while closed, and only if a future window exists. */
  nextOpensAt: string | null;
  /** e.g. "Sundays, 9:00 AM – 11:30 AM" — the human-readable schedule for the banner. */
  scheduleSummary: string;
}

/** "09:00:00" or "09:00" -> minutes since midnight. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** "09:00:00" -> "9:00 AM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

/** Human-readable summary of the weekly schedule, e.g. "Sundays, 9:00 AM – 11:30 AM". */
function summarizeSchedule(hours: OrderingHours[]): string {
  const open = hours.filter((h) => h.is_open).sort((a, b) => a.day_of_week - b.day_of_week);
  if (open.length === 0) return 'No ordering hours set';

  // Group days that share the same open/close times so "Sun & Wed, 9–11" stays one line.
  const byWindow = new Map<string, number[]>();
  for (const h of open) {
    const key = `${h.open_time}|${h.close_time}`;
    byWindow.set(key, [...(byWindow.get(key) ?? []), h.day_of_week]);
  }

  return Array.from(byWindow.entries())
    .map(([window, days]) => {
      const [openTime, closeTime] = window.split('|');
      const dayLabel = days.map((d) => `${DAY_NAMES[d]}s`).join(' & ');
      return `${dayLabel}, ${formatTime(openTime)} – ${formatTime(closeTime)}`;
    })
    .join(' · ');
}

/**
 * Decides whether customers can order right now.
 *
 * Times are compared against the device's local clock, so the church and its
 * customers are assumed to be in the same timezone — true for a walk-up coffee stand.
 */
export function getShopStatus(
  settings: ShopSettings,
  hours: OrderingHours[],
  now: Date = new Date(),
): ShopStatus {
  const scheduleSummary = summarizeSchedule(hours);

  if (settings.ordering_override === 'open') {
    return { isOpen: true, reason: 'forced_open', closesAt: null, nextOpensAt: null, scheduleSummary };
  }
  if (settings.ordering_override === 'closed') {
    return {
      isOpen: false,
      reason: 'forced_closed',
      closesAt: null,
      nextOpensAt: null,
      scheduleSummary,
    };
  }

  const openDays = hours.filter((h) => h.is_open);
  if (openDays.length === 0) {
    return { isOpen: false, reason: 'no_hours_set', closesAt: null, nextOpensAt: null, scheduleSummary };
  }

  const today = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayHours = openDays.find((h) => h.day_of_week === today);

  if (
    todayHours &&
    nowMinutes >= timeToMinutes(todayHours.open_time) &&
    nowMinutes < timeToMinutes(todayHours.close_time)
  ) {
    return {
      isOpen: true,
      reason: 'scheduled',
      closesAt: formatTime(todayHours.close_time),
      nextOpensAt: null,
      scheduleSummary,
    };
  }

  return {
    isOpen: false,
    reason: 'outside_hours',
    closesAt: null,
    nextOpensAt: findNextOpening(openDays, today, nowMinutes),
    scheduleSummary,
  };
}

/** Walks forward from today to find the next open window, e.g. "Sunday at 9:00 AM". */
function findNextOpening(
  openDays: OrderingHours[],
  today: number,
  nowMinutes: number,
): string | null {
  for (let offset = 0; offset < 7; offset++) {
    const day = (today + offset) % 7;
    const dayHours = openDays.find((h) => h.day_of_week === day);
    if (!dayHours) continue;

    // Today only counts if we haven't already passed its opening time.
    if (offset === 0 && nowMinutes >= timeToMinutes(dayHours.open_time)) continue;

    const when = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : DAY_NAMES[day];
    return `${when} at ${formatTime(dayHours.open_time)}`;
  }
  return null;
}

/** Parses "1,2,5" into [1, 2, 5], dropping anything that isn't a positive number. */
export function parseDonationPresets(presets: string): number[] {
  return presets
    .split(',')
    .map((p) => parseFloat(p.trim()))
    .filter((n) => !isNaN(n) && n > 0);
}

export async function fetchShopConfig(): Promise<{
  settings: ShopSettings;
  hours: OrderingHours[];
}> {
  const [settingsRes, hoursRes] = await Promise.all([
    supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('ordering_hours').select('*').order('day_of_week'),
  ]);

  return {
    settings: (settingsRes.data as ShopSettings) ?? DEFAULT_SETTINGS,
    hours: (hoursRes.data as OrderingHours[]) ?? [],
  };
}
