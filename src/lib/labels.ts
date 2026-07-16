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

export interface LabelSettings {
  id: number;
  /** The sticker itself, not the backing paper. */
  width_mm: number;
  height_mm: number;
  margin_mm: number;
  /** The black HOT CUP / COLD CUP band. */
  show_temp_band: boolean;
  /** "CUP 1 OF 3". Only ever drawn on multi-cup orders. */
  show_cup_counter: boolean;
  show_modifiers: boolean;
  show_note: boolean;
  /** Order code and time along the bottom. */
  show_footer: boolean;
  uppercase_name: boolean;
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
  /** Set to now() by the admin's "Send test label" button; the agent watches it. */
  test_print_requested_at: string | null;
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  id: 1,
  width_mm: 50,
  height_mm: 30,
  margin_mm: 2,
  show_temp_band: true,
  show_cup_counter: true,
  show_modifiers: true,
  show_note: true,
  show_footer: true,
  uppercase_name: false,
  rotate_label: false,
  name_scale: 1,
  drink_scale: 1,
  modifier_scale: 1,
  test_print_requested_at: null,
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
    name_scale: clamp(Number(merged.name_scale) || 1, SCALE_MIN, SCALE_MAX),
    drink_scale: clamp(Number(merged.drink_scale) || 1, SCALE_MIN, SCALE_MAX),
    modifier_scale: clamp(Number(merged.modifier_scale) || 1, SCALE_MIN, SCALE_MAX),
  };
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
  nameMm: number;
  drinkMm: number;
  modifierMm: number;
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
    nameMm: 4.75 * scale * s.name_scale,
    drinkMm: 3.35 * scale * s.drink_scale,
    modifierMm: 2.45 * scale * s.modifier_scale,
    footerMm: 1.95 * scale,
    gapMm: 0.55 * scale,
  };
}

/** What one cup's label says. Built by the agent from an order; faked by the admin preview. */
export interface LabelData {
  temp: 'hot' | 'iced' | null;
  customerName: string;
  cupIndex: number;
  cupTotal: number;
  drinkName: string;
  modifiers: string[];
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
      modifiers: ['Large', 'Oat Milk', 'Extra Shot', 'Vanilla Syrup'],
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
      modifiers: [],
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
      modifiers: ['Medium', 'Almond Milk', 'Sugar Free Caramel'],
      note: null,
      orderCode: 'C40D',
      timeText: '10:11 AM',
    },
  },
];
