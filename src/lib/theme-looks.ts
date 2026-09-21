/**
 * Everything about the app's look that isn't a colour — corners, shadows, type, spacing
 * and the page background — editable at /admin/theme.
 *
 * ── Why this can exist at all ──────────────────────────────────────────────────
 *
 * Tailwind v4 compiles its utilities down to CSS variables, and that is the entire trick
 * here (it's the same one the colours already use):
 *
 *     rounded-2xl  →  border-radius: var(--radius-2xl)
 *     text-sm      →  font-size: var(--text-sm)
 *     p-4          →  padding: calc(var(--spacing) * 4)
 *     bg-gray-50   →  background-color: var(--color-gray-50)
 *
 * So changing the *value* of `--radius-2xl` at runtime reshapes every card in the app
 * without a single component knowing a setting exists. Nothing below adds a class to a
 * component or a prop to a page; it all comes out as one `<style>` block written after
 * globals.css, exactly like `themeCss()`.
 *
 * **The default look emits no CSS at all.** Every option table below has one entry whose
 * `css` is empty, and that entry is the default. A shop that never opens this page is
 * running the untouched Tailwind values, which is the only honest way to promise that
 * adding all of this changed nothing.
 *
 * ── The two things that needed a real change ──────────────────────────────────
 *
 * `rounded-full` compiles to a hard-coded `calc(infinity * 1px)`, not a variable, so a
 * "square corners" look could never reach the buttons. `--radius-button` is declared in
 * globals.css and `Button` asks for it; everything else that is `rounded-full` — status
 * dots, chips, the spinner — genuinely wants to stay a circle and is left alone.
 *
 * The `font-heading` / `font-body` / `font-accent` utilities used to inline a literal
 * family name, which meant they never reached the fonts next/font actually loads. They
 * now go through `--app-heading` / `--app-body` / `--app-accent`, which is both the fix
 * for that and the hook the font pairings below hang on.
 */

export interface LookOption {
  id: string;
  name: string;
  /** What it does and what it costs, in one line, for somebody who doesn't write code. */
  blurb: string;
  /** Empty string = the untouched default. Exactly one option per set has this. */
  css: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Corners
 *
 * Tailwind's own ramp is 0.125 / 0.25 / 0.375 / 0.5 / 0.75 / 1 / 1.5 / 2 rem. The
 * non-default options scale that ramp and set the button shape to match.
 * ────────────────────────────────────────────────────────────────────────── */

const RADIUS_STEPS: Array<[string, number]> = [
  ['xs', 0.125],
  ['sm', 0.25],
  ['md', 0.375],
  ['lg', 0.5],
  ['xl', 0.75],
  ['2xl', 1],
  ['3xl', 1.5],
  ['4xl', 2],
];

function radiusCss(scale: number, button: string): string {
  const ramp = RADIUS_STEPS.map(([k, v]) => `--radius-${k}:${round(v * scale)}rem;`).join('');
  return `${ramp}--radius-button:${button};`;
}

export const CORNERS: LookOption[] = [
  {
    id: 'square',
    name: 'Square',
    blurb: 'No rounding anywhere, buttons included. Sharp and a bit severe — closest to a till system.',
    css: radiusCss(0, '0px'),
  },
  {
    id: 'soft',
    name: 'Slightly soft',
    blurb: 'Corners just knocked off. Buttons become rounded rectangles instead of pills.',
    css: radiusCss(0.45, '0.6rem'),
  },
  {
    id: 'rounded',
    name: 'Rounded — how it is now',
    blurb: 'The current app: soft cards and pill-shaped buttons.',
    css: '',
  },
  {
    id: 'extra',
    name: 'Very round',
    blurb: 'Cards as round as the buttons. Friendly, and eats a little room in tight corners.',
    css: radiusCss(1.7, '9999px'),
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Depth
 *
 * `shadow-sm` compiles to a literal, not a variable — but it sets `--tw-shadow`, which
 * the box-shadow then reads. Redefining that one property inside the class is enough,
 * and it lands after globals.css so it wins on the cascade without !important.
 * ────────────────────────────────────────────────────────────────────────── */

function shadows(map: Record<string, string>): string {
  const out = Object.entries(map)
    .map(([k, v]) => `.shadow-${k}{--tw-shadow:${v};}`)
    .join('');
  // Card's hover lift is the one variant used anywhere, and it has to move with the rest.
  return `${out}.hover\\:shadow-md:hover{--tw-shadow:${map.md};}`;
}

export const DEPTH: LookOption[] = [
  {
    id: 'flat',
    name: 'Flat',
    blurb: 'No shadows at all — cards are held apart by their edges alone. Crisp on a big screen.',
    css: shadows({ sm: '0 0 #0000', md: '0 0 #0000', lg: '0 0 #0000', xl: '0 0 #0000', '2xl': '0 0 #0000' }),
  },
  {
    id: 'soft',
    name: 'Soft — how it is now',
    blurb: 'A light shadow under every card. The current app.',
    css: '',
  },
  {
    id: 'lifted',
    name: 'Lifted',
    blurb: 'Deeper shadows. Cards float; the board reads as a stack of physical tickets.',
    css: shadows({
      sm: '0 2px 6px 0 rgb(0 0 0 / 0.10), 0 1px 3px -1px rgb(0 0 0 / 0.10)',
      md: '0 8px 14px -2px rgb(0 0 0 / 0.13), 0 3px 7px -3px rgb(0 0 0 / 0.11)',
      lg: '0 16px 26px -5px rgb(0 0 0 / 0.15), 0 7px 11px -6px rgb(0 0 0 / 0.12)',
      xl: '0 28px 40px -8px rgb(0 0 0 / 0.18), 0 12px 16px -8px rgb(0 0 0 / 0.14)',
      '2xl': '0 36px 70px -14px rgb(0 0 0 / 0.32)',
    }),
  },
  {
    id: 'dramatic',
    name: 'Dramatic',
    blurb: 'Heavy, obvious drop shadows. Fun on the lobby TV, busy on a phone.',
    css: shadows({
      sm: '0 4px 10px 0 rgb(0 0 0 / 0.16), 0 2px 4px -1px rgb(0 0 0 / 0.14)',
      md: '0 12px 22px -3px rgb(0 0 0 / 0.20), 0 5px 10px -4px rgb(0 0 0 / 0.16)',
      lg: '0 24px 40px -6px rgb(0 0 0 / 0.24), 0 10px 16px -8px rgb(0 0 0 / 0.18)',
      xl: '0 40px 60px -10px rgb(0 0 0 / 0.28), 0 18px 24px -10px rgb(0 0 0 / 0.20)',
      '2xl': '0 50px 100px -18px rgb(0 0 0 / 0.45)',
    }),
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Text size
 *
 * Tailwind's line heights are stored as unitless ratios (`calc(1.25 / 0.875)`), so they
 * follow the font size on their own and only `--text-*` needs writing.
 *
 * The range is deliberately narrow. Past about 1.2× the barista board stops fitting three
 * columns on a tablet, which is a worse outcome than small text.
 * ────────────────────────────────────────────────────────────────────────── */

const TEXT_STEPS: Array<[string, number]> = [
  ['xs', 0.75],
  ['sm', 0.875],
  ['base', 1],
  ['lg', 1.125],
  ['xl', 1.25],
  ['2xl', 1.5],
  ['3xl', 1.875],
  ['4xl', 2.25],
  ['5xl', 3],
  ['6xl', 3.75],
  ['7xl', 4.5],
];

function textCss(scale: number): string {
  return TEXT_STEPS.map(([k, v]) => `--text-${k}:${round(v * scale)}rem;`).join('');
}

export const TEXT_SIZE: LookOption[] = [
  {
    id: 'small',
    name: 'Smaller',
    blurb: 'About 8% down. Fits more orders on the barista board at once.',
    css: textCss(0.92),
  },
  { id: 'normal', name: 'Normal — how it is now', blurb: 'The current app.', css: '' },
  {
    id: 'large',
    name: 'Larger',
    blurb: 'About 9% up. Easier to read across the counter and on the TV.',
    css: textCss(1.09),
  },
  {
    id: 'xlarge',
    name: 'Largest',
    blurb: 'About 18% up. Check the barista board after picking this — the columns get tight.',
    css: textCss(1.18),
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Roominess
 *
 * Every `p-4`, `gap-2` and `mt-6` in the app is `calc(var(--spacing) * n)`, so this is
 * one variable. It also scales `w-12`/`h-12`, which is why the range stops where it does
 * — much past ±10% and fixed-size things like the spinner start to look wrong.
 * ────────────────────────────────────────────────────────────────────────── */

export const ROOMINESS: LookOption[] = [
  {
    id: 'tight',
    name: 'Tighter',
    blurb: 'Less padding everywhere. More on screen, less air.',
    css: '--spacing:0.229rem;',
  },
  { id: 'normal', name: 'Normal — how it is now', blurb: 'The current app.', css: '' },
  {
    id: 'roomy',
    name: 'Roomier',
    blurb: 'More padding everywhere. Calmer, and a little more scrolling.',
    css: '--spacing:0.273rem;',
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Page background
 *
 * Painted on `body` and on the `.bg-bg` utility — most pages put their own `bg-bg`
 * wrapper over the body, so writing only one of the two leaves half the app plain.
 *
 * Every pattern is built from the theme's own colours via `color-mix`, so it follows the
 * scheme instead of being a fixed grey that clashes with eleven of the fourteen.
 * ────────────────────────────────────────────────────────────────────────── */

function bgCss(image: string, extra = ''): string {
  return `body,.bg-bg{background-image:${image};${extra}}`;
}

const DOT = 'color-mix(in srgb, var(--color-text-light) 26%, transparent)';
const LINE = 'color-mix(in srgb, var(--color-text-light) 15%, transparent)';

export const BACKGROUNDS: LookOption[] = [
  { id: 'plain', name: 'Plain — how it is now', blurb: 'One flat colour behind everything.', css: '' },
  {
    id: 'gradient',
    name: 'Soft gradient',
    blurb: 'The page fades from a tint of the button colour down to plain. Barely there, and it reads as depth.',
    css: bgCss(
      'linear-gradient(170deg, color-mix(in srgb, var(--color-primary) 13%, var(--color-bg)) 0%, var(--color-bg) 55%)',
      'background-attachment:fixed;',
    ),
  },
  {
    id: 'glow',
    name: 'Corner glow',
    blurb: 'Two soft pools of colour in the top corners. The most decorative option here.',
    css: bgCss(
      'radial-gradient(60rem 30rem at 12% -10%, color-mix(in srgb, var(--color-primary) 22%, transparent), transparent 70%),radial-gradient(50rem 26rem at 92% -6%, color-mix(in srgb, var(--color-secondary) 24%, transparent), transparent 70%)',
      'background-attachment:fixed;',
    ),
  },
  {
    id: 'dots',
    name: 'Dots',
    blurb: 'A fine dotted grid. Adds texture without adding colour.',
    css: bgCss(`radial-gradient(${DOT} 1px, transparent 1px)`, 'background-size:18px 18px;'),
  },
  {
    id: 'grid',
    name: 'Graph paper',
    blurb: 'Faint squared lines, like a notebook.',
    css: bgCss(
      `linear-gradient(${LINE} 1px, transparent 1px),linear-gradient(90deg, ${LINE} 1px, transparent 1px)`,
      'background-size:24px 24px;',
    ),
  },
  {
    id: 'stripes',
    name: 'Diagonal stripes',
    blurb: 'Wide soft diagonals. The loudest of the five — look at a busy barista board before keeping it.',
    css: bgCss(
      `repeating-linear-gradient(45deg, ${LINE} 0 2px, transparent 2px 14px)`,
    ),
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Fonts
 *
 * Three roles: headings, body, and the small bold UI text (`font-accent`) on buttons and
 * badges. A pairing sets all three.
 *
 * The default pairing loads nothing extra — those three faces are already served by
 * next/font from the app's own domain. Every other pairing costs one stylesheet request
 * to Google Fonts on first load, which is why `families` is empty for the default and the
 * provider skips the <link> entirely.
 * ────────────────────────────────────────────────────────────────────────── */

export interface FontPairing {
  id: string;
  name: string;
  blurb: string;
  /** Google Fonts family names, or [] for the built-in pairing. */
  families: string[];
  heading: string;
  body: string;
  accent: string;
}

/** Only ever interpolated into a CSS font-family list, so it must stay this narrow. */
const SAFE_FAMILY = /^[A-Za-z0-9 ]{1,40}$/;

function stack(family: string, fallback: string): string {
  return `'${family}', ${fallback}`;
}

const SANS = 'ui-sans-serif, system-ui, sans-serif';
const SERIF = 'ui-serif, Georgia, serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'default',
    name: 'Kumbh Sans & Nunito — how it is now',
    blurb: 'The current app, and the only pairing that loads no extra fonts.',
    families: [],
    heading: '',
    body: '',
    accent: '',
  },
  {
    id: 'modern',
    name: 'Space Grotesk & Inter',
    blurb: 'Crisp and a bit technical. Numbers line up well, which suits the barista board.',
    families: ['Space Grotesk', 'Inter'],
    heading: stack('Space Grotesk', SANS),
    body: stack('Inter', SANS),
    accent: stack('Inter', SANS),
  },
  {
    id: 'classic',
    name: 'Playfair Display & Lora',
    blurb: 'Serif headings. Formal — reads like an order of service rather than an app.',
    families: ['Playfair Display', 'Lora'],
    heading: stack('Playfair Display', SERIF),
    body: stack('Lora', SERIF),
    accent: stack('Lora', SERIF),
  },
  {
    id: 'friendly',
    name: 'Fredoka & Nunito',
    blurb: 'Round and soft. The friendliest of the set, and the best match for Very round corners.',
    families: ['Fredoka', 'Nunito'],
    heading: stack('Fredoka', SANS),
    body: stack('Nunito', SANS),
    accent: stack('Nunito', SANS),
  },
  {
    id: 'bold',
    name: 'Archivo Black & Archivo',
    blurb: 'Very heavy headings. Loud across a room; overbearing on a phone.',
    families: ['Archivo Black', 'Archivo'],
    heading: stack('Archivo Black', SANS),
    body: stack('Archivo', SANS),
    accent: stack('Archivo', SANS),
  },
  {
    id: 'newspaper',
    name: 'Bitter & Source Sans 3',
    blurb: 'Slab headings over a plain body. Sturdy, and easy to read small.',
    families: ['Bitter', 'Source Sans 3'],
    heading: stack('Bitter', SERIF),
    body: stack('Source Sans 3', SANS),
    accent: stack('Source Sans 3', SANS),
  },
  {
    id: 'handwritten',
    name: 'Caveat headings',
    blurb: 'Handwritten headings over ordinary body text. Looks like the chalkboard — check a long drink name fits before keeping it.',
    families: ['Caveat', 'Nunito'],
    heading: stack('Caveat', 'cursive'),
    body: stack('Nunito', SANS),
    accent: stack('Nunito', SANS),
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    blurb: 'Everything monospaced, like a paper receipt. A novelty, and genuinely harder to read in quantity.',
    families: ['Courier Prime'],
    heading: stack('Courier Prime', MONO),
    body: stack('Courier Prime', MONO),
    accent: stack('Courier Prime', MONO),
  },
];

export function fontById(id: string): FontPairing {
  return FONT_PAIRINGS.find((f) => f.id === id) ?? FONT_PAIRINGS[0];
}

/**
 * The Google Fonts stylesheet for a pairing, or null for the built-in one.
 *
 * Family names are checked against `SAFE_FAMILY` even though they only ever come from the
 * table above — this string becomes a URL in a <link>, and the table is the kind of thing
 * somebody edits in a hurry.
 */
export function fontHref(id: string): string | null {
  const pairing = fontById(id);
  const families = pairing.families.filter((f) => SAFE_FAMILY.test(f));
  if (families.length === 0) return null;
  const query = families
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

function fontCss(id: string): string {
  const pairing = fontById(id);
  if (!pairing.heading) return '';
  return `--app-heading:${pairing.heading};--app-body:${pairing.body};--app-accent:${pairing.accent};`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Putting a look together
 * ────────────────────────────────────────────────────────────────────────── */

export interface ThemeLook {
  corners: string;
  depth: string;
  textSize: string;
  roominess: string;
  background: string;
  font: string;
}

export const DEFAULT_LOOK: ThemeLook = {
  corners: 'rounded',
  depth: 'soft',
  textSize: 'normal',
  roominess: 'normal',
  background: 'plain',
  font: 'default',
};

/** Every dial on the page, in the order it appears, so the editor is one loop. */
export const LOOK_CONTROLS = [
  {
    key: 'corners' as const,
    label: 'Corners',
    hint: 'How round cards, boxes and buttons are',
    options: CORNERS,
  },
  {
    key: 'depth' as const,
    label: 'Shadows',
    hint: 'How much cards lift off the page',
    options: DEPTH,
  },
  {
    key: 'textSize' as const,
    label: 'Text size',
    hint: 'Everything, everywhere — not just headings',
    options: TEXT_SIZE,
  },
  {
    key: 'roominess' as const,
    label: 'Roominess',
    hint: 'The padding and gaps between things',
    options: ROOMINESS,
  },
  {
    key: 'background' as const,
    label: 'Page background',
    hint: 'Behind the cards, on every screen',
    options: BACKGROUNDS,
  },
];

function optionCss(options: LookOption[], id: string): string {
  return (options.find((o) => o.id === id) ?? options.find((o) => o.css === '') ?? options[0]).css;
}

/**
 * The CSS for a look. **Empty string for the default look** — see the file header.
 *
 * Split in two because the `:root` declarations and the class-level rules (shadows, the
 * body background) can't share a block.
 */
export function lookCss(look: ThemeLook): string {
  const root = [
    optionCss(CORNERS, look.corners),
    optionCss(TEXT_SIZE, look.textSize),
    optionCss(ROOMINESS, look.roominess),
    fontCss(look.font),
  ]
    .filter(Boolean)
    .join('');

  const rules = [optionCss(DEPTH, look.depth), optionCss(BACKGROUNDS, look.background)]
    .filter(Boolean)
    .join('');

  return `${root ? `:root{${root}}` : ''}${rules}`;
}

/** Unknown ids fall back to the default rather than to nothing, so a bad row still paints. */
export function normalizeLook(raw: unknown): ThemeLook {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_LOOK };
  const input = raw as Record<string, unknown>;
  const pick = (key: keyof ThemeLook, options: Array<{ id: string }>): string => {
    const value = input[key];
    return typeof value === 'string' && options.some((o) => o.id === value)
      ? value
      : DEFAULT_LOOK[key];
  };
  return {
    corners: pick('corners', CORNERS),
    depth: pick('depth', DEPTH),
    textSize: pick('textSize', TEXT_SIZE),
    roominess: pick('roominess', ROOMINESS),
    background: pick('background', BACKGROUNDS),
    font: pick('font', FONT_PAIRINGS),
  };
}

export function isDefaultLook(look: ThemeLook): boolean {
  return (Object.keys(DEFAULT_LOOK) as Array<keyof ThemeLook>).every(
    (k) => look[k] === DEFAULT_LOOK[k],
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
