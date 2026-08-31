/**
 * Cup label layout — the single source of truth for BOTH the admin preview and
 * the PDF the shop PC actually prints.
 *
 * The preview lives in the browser (HTML/CSS, pixels) and the print path lives in
 * the agent (PDFKit, points). If each one computed its own type sizes they would
 * drift within a week and the preview would start lying. So every measurement is
 * defined once, here, in millimetres — and each side converts mm into its own unit
 * at the last moment.
 *
 * Deliberately dependency-free (no supabase, no React, no '@/' imports): the print
 * agent is a separate Node package and imports this file directly.
 */

import { DEFAULT_CHURCH_NAME } from './logo';

export interface LabelSettings {
  id: number;
  /** The sticker itself, not the backing paper. */
  width_mm: number;
  height_mm: number;
  margin_mm: number;
  /** The black HOT CUP / COLD CUP band. */
  show_temp_band: boolean;
  /** The Light of the Gospel mark at the top of the label. */
  show_logo: boolean;
  /** The church name printed beside (or instead of) the mark. */
  show_church_name: boolean;
  /** What that name says — "Light of the Gospel" unless the admin changes it. */
  church_name: string;
  /** "CUP 1 OF 3". Only ever drawn on multi-cup orders. */
  show_cup_counter: boolean;
  show_modifiers: boolean;
  show_note: boolean;
  /** Order code and time along the bottom. */
  show_footer: boolean;
  uppercase_name: boolean;
  /** Drink name in CAPITALS, like uppercase_name but for the drink line. */
  uppercase_drink: boolean;
  /** Centre the name, drink and modifiers instead of aligning them left. */
  center_text: boolean;
  /**
   * Turn the printed design 90°. The label size (width × height) still describes the
   * physical sticker; this only rotates the *design* on it, for printers that feed the
   * label the opposite way round — the fix for a label that prints sideways.
   */
  rotate_label: boolean;
  /** Type size multipliers, 0.6–1.6. The starting size before shrink-to-fit. */
  name_scale: number;
  drink_scale: number;
  modifier_scale: number;
  /** Size multiplier for the boxed special-instructions note, on its own so it can be
   * shrunk (or grown) without touching the modifier size. */
  note_scale: number;
  /** Size multiplier for the bottom order-code/time line and the cup counter. */
  footer_scale: number;
  /** Size multiplier for the whole branding row — mark and church name together. */
  brand_scale: number;
  /**
   * Per-modifier-group control, keyed by group name. Each group can be hidden from the
   * label and given its own size multiplier on top of the global modifier size. Groups
   * not listed here use the defaults (shown, ×1), so a brand-new group added at
   * /admin/modifiers shows up on the label automatically.
   */
  modifier_group_styles: Record<string, ModifierGroupStyle>;
  /**
   * The order modifier categories print on the label, by group name. Groups listed here
   * come first in this order; any not listed (e.g. a brand-new group) fall in after them
   * in their /admin/modifiers order. Edited with the ▲/▼ buttons on /admin/labels.
   */
  modifier_group_order: string[];
  /** Set to now() by the admin's "Send test label" button; the agent watches it. */
  test_print_requested_at: string | null;
  /**
   * When true, the agent prints an order's labels the moment it comes in.
   *
   * OFF by default. Auto-printing spits out a sticker for every drink the second an order
   * lands — including the four nobody has started — and a remade cup then costs a whole
   * fresh set. The barista prints the cup they're about to make, from the per-cup list on
   * /barista. Switch this back on at /admin/labels if a shop wants the old behaviour.
   */
  auto_print: boolean;
}

/**
 * How much a modifier category shouts on the label.
 *
 * 'boxed' is the loud one: white text reversed out of a black chip, the same trick the
 * HOT/COLD band uses. Thermal printers are 1-bit, so a black block is the only genuinely
 * strong emphasis available — there is no colour and no grey to reach for.
 */
export type ModifierEmphasis = 'normal' | 'bold' | 'boxed';

/** How one modifier category is shown on the label. See modifier_group_styles. */
export interface ModifierGroupStyle {
  show: boolean;
  /** Size multiplier, 0.6–1.6, applied on top of the global modifier size. */
  scale: number;
  /** Normal, bold, or reversed out of a black chip. */
  emphasis: ModifierEmphasis;
}

export const DEFAULT_MODIFIER_GROUP_STYLE: ModifierGroupStyle = {
  show: true,
  scale: 1,
  emphasis: 'normal',
};

/**
 * Milk is bold unless the admin says otherwise.
 *
 * It's the one add-in where getting it wrong is not a preference but a problem — oat and
 * almond are on the label because somebody can't drink dairy — and it's also the line a
 * barista scans for while steaming. On a 30mm label every modifier is the same small grey
 * line, so the milk gets weight by default and doesn't have to be found.
 *
 * Matched on the group NAME, so a shop that calls the group "Milk Options" or "Milks"
 * still gets it, and nothing has to be configured for it to work on Sunday.
 */
export function defaultEmphasisFor(group: string): ModifierEmphasis {
  return /\bmilks?\b/i.test(group) ? 'bold' : 'normal';
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  id: 1,
  width_mm: 50,
  height_mm: 30,
  margin_mm: 2,
  show_temp_band: true,
  show_logo: true,
  show_church_name: true,
  church_name: DEFAULT_CHURCH_NAME,
  show_cup_counter: true,
  show_modifiers: true,
  show_note: true,
  show_footer: true,
  uppercase_name: false,
  uppercase_drink: false,
  center_text: false,
  rotate_label: false,
  name_scale: 1,
  drink_scale: 1,
  modifier_scale: 1,
  note_scale: 1,
  footer_scale: 1,
  brand_scale: 1,
  modifier_group_styles: {},
  modifier_group_order: [],
  test_print_requested_at: null,
  auto_print: false,
};

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;

/**
 * The strip along the RIGHT edge that the label printer physically can't reach — its
 * print head stops short of the paper edge, so ink drawn out there simply never lands
 * (the "3mm on the right gets cut off" bug). The design is kept inside this inset on
 * both the preview and the roll. It's a fixed property of the print head, not of the
 * label, so it's a constant in millimetres rather than something that scales with size.
 */
export const EDGE_SAFE_MM = 3;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Fills in anything missing and rejects nonsense. The label size is typed in by
 * hand, and a 0mm-tall label is a crash rather than a small label.
 */
export function normalizeLabelSettings(row: Partial<LabelSettings> | null | undefined): LabelSettings {
  const merged = { ...DEFAULT_LABEL_SETTINGS, ...(row ?? {}) };

  return {
    ...merged,
    width_mm: clamp(Number(merged.width_mm) || DEFAULT_LABEL_SETTINGS.width_mm, 20, 100),
    height_mm: clamp(Number(merged.height_mm) || DEFAULT_LABEL_SETTINGS.height_mm, 15, 100),
    margin_mm: clamp(Number(merged.margin_mm) ?? DEFAULT_LABEL_SETTINGS.margin_mm, 0, 8),
    rotate_label: Boolean(merged.rotate_label),
    uppercase_drink: Boolean(merged.uppercase_drink),
    center_text: Boolean(merged.center_text),
    // Branding defaults ON: these arrived with the branding migration, and a row written
    // before it has no columns for them — the church's own labels should carry its mark
    // without anyone having to go and switch it on.
    show_logo: merged.show_logo !== false,
    show_church_name: merged.show_church_name !== false,
    // An empty name would print an empty gap rather than nothing, so fall back.
    church_name: (merged.church_name ?? '').trim() || DEFAULT_CHURCH_NAME,
    // Defaults OFF: labels are printed per cup by the barista. A missing column (a
    // database behind on migrations) means manual too — an unexpected auto-print burns
    // through a roll unattended, where an unexpected manual mode is one visible button.
    auto_print: merged.auto_print === true,
    name_scale: clamp(Number(merged.name_scale) || 1, SCALE_MIN, SCALE_MAX),
    drink_scale: clamp(Number(merged.drink_scale) || 1, SCALE_MIN, SCALE_MAX),
    modifier_scale: clamp(Number(merged.modifier_scale) || 1, SCALE_MIN, SCALE_MAX),
    note_scale: clamp(Number(merged.note_scale) || 1, SCALE_MIN, SCALE_MAX),
    footer_scale: clamp(Number(merged.footer_scale) || 1, SCALE_MIN, SCALE_MAX),
    brand_scale: clamp(Number(merged.brand_scale) || 1, SCALE_MIN, SCALE_MAX),
    modifier_group_styles: normalizeGroupStyles(merged.modifier_group_styles),
    modifier_group_order: Array.isArray(merged.modifier_group_order)
      ? merged.modifier_group_order.filter((g): g is string => typeof g === 'string')
      : [],
  };
}

/** Sorts group names into the label's chosen order; unlisted names keep their original order. */
export function orderGroupNames(groups: string[], order: string[]): string[] {
  const rank = new Map(order.map((g, i) => [g, i]));
  return [...groups].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
}

/** Same, for a cup's modifier lines — the order the categories print in. */
export function orderModifierLines(
  lines: LabelModifierLine[],
  order: string[],
): LabelModifierLine[] {
  const rank = new Map(order.map((g, i) => [g, i]));
  return [...lines].sort((a, b) => (rank.get(a.group) ?? Infinity) - (rank.get(b.group) ?? Infinity));
}

const EMPHASES: ModifierEmphasis[] = ['normal', 'bold', 'boxed'];

/** Sanitises the per-group style map: coerces types, clamps scale, drops junk. */
function normalizeGroupStyles(v: unknown): Record<string, ModifierGroupStyle> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, ModifierGroupStyle> = {};
  for (const [group, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Partial<ModifierGroupStyle>;
    out[group] = {
      show: s.show !== false, // default shown
      scale: clamp(Number(s.scale) || 1, SCALE_MIN, SCALE_MAX),
      // A row saved before emphasis existed has none — fall back to the name-based
      // default (milk bold) rather than to 'normal', or an existing shop would lose
      // the emphasis simply for having touched the group's size once.
      emphasis: EMPHASES.includes(s.emphasis as ModifierEmphasis)
        ? (s.emphasis as ModifierEmphasis)
        : defaultEmphasisFor(group),
    };
  }
  return out;
}

/** The style for one modifier group, falling back to the defaults for unlisted groups. */
export function groupStyle(settings: LabelSettings, group: string): ModifierGroupStyle {
  const s = settings.modifier_group_styles[group];
  if (!s) return { ...DEFAULT_MODIFIER_GROUP_STYLE, emphasis: defaultEmphasisFor(group) };
  return {
    show: s.show !== false,
    scale: clamp(Number(s.scale) || 1, SCALE_MIN, SCALE_MAX),
    emphasis: EMPHASES.includes(s.emphasis) ? s.emphasis : defaultEmphasisFor(group),
  };
}

/**
 * Whether the branding row appears at all — the mark, the church name, or both. Asked
 * by the preview and the PDF alike so neither one reserves space the other doesn't use.
 */
export function showsBrand(s: LabelSettings): boolean {
  return s.show_logo || (s.show_church_name && s.church_name.trim().length > 0);
}

/**
 * Whether to spin the printed design 90° onto a portrait page for the printer.
 *
 * This printer prints PORTRAIT pages upright. A tall label (50×80) is already portrait,
 * so it needs no rotation. A wide label (40×30) gets auto-turned sideways by the printer,
 * so its design has to be laid onto a portrait page and spun to come out the right way up.
 *
 * Rather than guess from the label's shape (an earlier auto-rule fought the manual toggle
 * and the two cancelled out), this is simply the `rotate_label` "flip" switch in
 * /admin/labels: off for tall rolls, on for wide rolls. The preview always shows the
 * finished, upright label, so you just flip this until a test print matches the preview.
 */
export function effectiveRotate(s: LabelSettings): boolean {
  return s.rotate_label;
}

/**
 * Every measurement on the label, in millimetres.
 *
 * All of it scales off the label height, so a taller roll gets bigger type rather
 * than the same type stranded in white space. The admin's scale sliders then
 * multiply the three text sizes on top of that.
 */
export interface LabelMetrics {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  bandMm: number;
  /** Height of the church mark in the branding row. */
  logoMm: number;
  /** Type size of the church name beside it. */
  churchMm: number;
  nameMm: number;
  drinkMm: number;
  modifierMm: number;
  noteMm: number;
  footerMm: number;
  gapMm: number;
}

export function labelMetrics(s: LabelSettings): LabelMetrics {
  // Text size tracks the SMALLER of the two dimensions' scale factors, so a tall
  // label (say 50×80) gets readable type with room for everything, instead of type
  // scaled off height alone — which ballooned to 2.7× and shoved content off. At the
  // baseline 40×30 both factors are 1, so small labels are unchanged.
  const scale = Math.min(s.height_mm / 30, s.width_mm / 40);

  return {
    widthMm: s.width_mm,
    heightMm: s.height_mm,
    marginMm: s.margin_mm,
    bandMm: 3.5 * scale,
    // Deliberately small. The branding row costs height that the modifier lines want,
    // and on a 50×30 roll every millimetre spent up here is an option the barista
    // doesn't get to read. The scale slider is there for anyone who wants it louder.
    logoMm: 3.4 * scale * s.brand_scale,
    churchMm: 2.1 * scale * s.brand_scale,
    nameMm: 4.75 * scale * s.name_scale,
    drinkMm: 3.35 * scale * s.drink_scale,
    modifierMm: 2.45 * scale * s.modifier_scale,
    // The note shares the modifier's baseline size but has its own multiplier, so it can
    // be sized independently of the modifier lines.
    noteMm: 2.45 * scale * s.note_scale,
    footerMm: 1.95 * scale * s.footer_scale,
    gapMm: 0.55 * scale,
  };
}

/**
 * One category of modifiers on a label — e.g. { group: 'Syrups', options: ['Vanilla',
 * 'Caramel'] }. Each prints on its own line, so a per-group size and show/hide can apply.
 */
export interface LabelModifierLine {
  group: string;
  options: string[];
}

/** What one cup's label says. Built by the agent from an order; faked by the admin preview. */
export interface LabelData {
  temp: 'hot' | 'iced' | null;
  customerName: string;
  cupIndex: number;
  cupTotal: number;
  drinkName: string;
  /** One entry per modifier category, in the order they should print. */
  modifiers: LabelModifierLine[];
  note: string | null;
  orderCode: string;
  timeText: string;
}

export const TEMP_TEXT: Record<'hot' | 'iced', string> = {
  hot: 'HOT CUP',
  iced: 'COLD CUP',
};

/** The sample order the admin preview draws, so you can see a busy label before Sunday. */
export const SAMPLE_LABELS: { name: string; data: LabelData }[] = [
  {
    name: 'Busy order',
    data: {
      temp: 'iced',
      customerName: 'Sarah K',
      cupIndex: 1,
      cupTotal: 2,
      drinkName: 'Vanilla Latte',
      modifiers: [
        { group: 'Size', options: ['Large'] },
        { group: 'Milk', options: ['Oat Milk'] },
        { group: 'Syrups', options: ['Vanilla', 'Caramel'] },
        { group: 'Extras', options: ['Extra Shot'] },
      ],
      note: 'Extra hot, light foam',
      orderCode: '7F3A',
      timeText: '9:42 AM',
    },
  },
  {
    name: 'Simple order',
    data: {
      temp: 'hot',
      customerName: 'Mike D',
      cupIndex: 1,
      cupTotal: 1,
      drinkName: 'Americano',
      modifiers: [], // no modifiers
      note: null,
      orderCode: 'B21C',
      timeText: '10:05 AM',
    },
  },
  {
    name: 'Long name',
    data: {
      temp: 'hot',
      customerName: 'Bartholomew Vandersteen',
      cupIndex: 2,
      cupTotal: 3,
      drinkName: 'Caramel Macchiato',
      modifiers: [
        { group: 'Size', options: ['Medium'] },
        { group: 'Milk', options: ['Almond Milk'] },
        { group: 'Syrups', options: ['Sugar Free Caramel'] },
      ],
      note: null,
      orderCode: 'C40D',
      timeText: '10:11 AM',
    },
  },
];
