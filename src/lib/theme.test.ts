/**
 * The theme's load-bearing promises.
 *
 * `npm run test:theme`
 *
 * The one this file exists for is the first: **a shop that never opens /admin/theme, and
 * a database that has run neither theme migration, must look exactly as the app looked
 * before any of this was added.** That is easy to say and easy to break — a stray value
 * in the Navy preset, a look option whose "how it is now" entry grows a rule — and
 * impossible to notice, because the person it breaks for is a customer on a Sunday and
 * not anybody reading this repo. So it is checked against globals.css itself rather than
 * against a copy of the numbers.
 *
 * The rest guard the things that turn CSS generation into a hazard: a value that isn't a
 * colour reaching the page as CSS, and a preset missing a token so one screen paints
 * from the wrong scheme.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_LOOK,
  DEFAULT_THEME,
  FONT_PAIRINGS,
  LOOK_CONTROLS,
  THEME_PRESETS,
  THEME_TOKENS,
  decodeThemeCode,
  encodeThemeCode,
  fontHref,
  isHexColor,
  lookCss,
  normalizeLook,
  presetById,
  resolveColors,
  themeCss,
  themeStyle,
} from './theme';

// encodeThemeCode / decodeThemeCode reach for window.btoa; in the browser that's the only
// base64 there is, and under tsx there's no window at all. They only touch it when
// called, so shimming it here — after the imports have hoisted — is early enough.
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  (globalThis as { window?: unknown }).window = { btoa, atob };
}

let failures = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* ── 1. The default is the app as it was ─────────────────────────────────── */

section('The default changes nothing');

const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** The `:root { … }` block at the top of globals.css, as a map. */
function globalsRoot(): Record<string, string> {
  const block = globalsCss.slice(globalsCss.indexOf(':root {'), globalsCss.indexOf('@theme inline'));
  const out: Record<string, string> = {};
  for (const [, key, value] of block.matchAll(/--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    out[key] = value.toUpperCase();
  }
  return out;
}

const fromCss = globalsRoot();
const navy = presetById('navy').colors;

check(
  'globals.css declares every theme token',
  THEME_TOKENS.every((t) => fromCss[t.key]),
  THEME_TOKENS.filter((t) => !fromCss[t.key])
    .map((t) => t.key)
    .join(', '),
);

const drifted = THEME_TOKENS.filter((t) => fromCss[t.key] && fromCss[t.key] !== navy[t.key].toUpperCase());
check(
  'the Navy preset is identical to globals.css',
  drifted.length === 0,
  drifted.map((t) => `${t.key}: css ${fromCss[t.key]} vs navy ${navy[t.key]}`).join('; '),
);

check('the default look is the default look', lookCss(DEFAULT_LOOK) === '', lookCss(DEFAULT_LOOK));

check(
  'every setting has exactly one "how it is now" option, and it emits nothing',
  LOOK_CONTROLS.every((c) => c.options.filter((o) => o.css === '').length === 1),
  LOOK_CONTROLS.filter((c) => c.options.filter((o) => o.css === '').length !== 1)
    .map((c) => c.key)
    .join(', '),
);

check(
  'the default look is made of those options',
  LOOK_CONTROLS.every((c) => c.options.find((o) => o.id === DEFAULT_LOOK[c.key])?.css === ''),
);

check(
  'the default font pairing loads nothing from Google',
  fontHref(DEFAULT_LOOK.font) === null && FONT_PAIRINGS[0].families.length === 0,
);

check(
  'the whole default theme is one :root block of the globals.css values',
  themeStyle(DEFAULT_THEME) === themeCss(resolveColors(DEFAULT_THEME)),
);

/* ── 2. Nothing but a colour reaches the page as CSS ─────────────────────── */

section('Only colours are written into the page');

const hostile = themeCss({
  ...navy,
  primary: 'red; } body { display:none } :root{ --x:',
  surface: 'url(javascript:alert(1))',
  bg: '#0A0B0C',
});

check('a non-hex value is dropped entirely', !hostile.includes('display:none') && !hostile.includes('url('));
check('a valid neighbour still lands', hostile.includes('--color-bg:#0A0B0C;'));
check(
  'the emitted block is only hex declarations',
  /^:root\{(--color-[a-z0-9-]+:#[0-9A-F]{6};)+\}$/.test(hostile),
  hostile.slice(0, 120),
);

check(
  'the grey ramp Tailwind reads is written from the surface tokens',
  ['--color-gray-50:', '--color-gray-100:', '--color-gray-200:', '--color-gray-300:'].every((v) =>
    themeCss(navy).includes(v),
  ),
);

check(
  'white is left alone — it is button text, not the card colour',
  !themeCss(navy).includes('--color-white'),
);

/* ── 3. Every preset can actually paint every screen ─────────────────────── */

section('Every scheme is complete');

for (const preset of THEME_PRESETS) {
  const missing = THEME_TOKENS.filter((t) => !preset.colors[t.key]);
  const bad = THEME_TOKENS.filter((t) => preset.colors[t.key] && !isHexColor(preset.colors[t.key]));
  check(
    `${preset.id}: all ${THEME_TOKENS.length} tokens, all hex`,
    missing.length === 0 && bad.length === 0,
    [...missing, ...bad].map((t) => t.key).join(', '),
  );
}

check(
  'scheme ids are unique',
  new Set(THEME_PRESETS.map((p) => p.id)).size === THEME_PRESETS.length,
);

check('an unknown scheme falls back to Navy, not to nothing', presetById('nope').id === 'navy');

/* ── 4. A stored look can't put anything unexpected into the page ────────── */

section('Stored looks are filtered on the way in');

check('garbage becomes the default look', JSON.stringify(normalizeLook('{}')) === JSON.stringify(DEFAULT_LOOK));
check('null becomes the default look', JSON.stringify(normalizeLook(null)) === JSON.stringify(DEFAULT_LOOK));
check(
  'an unknown option id becomes the default for that one setting',
  normalizeLook({ corners: 'square', depth: 'nope' }).corners === 'square' &&
    normalizeLook({ corners: 'square', depth: 'nope' }).depth === DEFAULT_LOOK.depth,
);
check(
  'a look that tries to smuggle CSS in is dropped, not escaped',
  lookCss(normalizeLook({ corners: '}body{display:none}' })) === '',
);

/* ── 5. Sharing a look round-trips ───────────────────────────────────────── */

section('Look codes');

const shared = {
  preset: 'midnight',
  overrides: { primary: '#123456', nonsense: 'drop me' } as Record<string, string>,
  look: { ...DEFAULT_LOOK, corners: 'square', font: 'typewriter' },
};
const roundTripped = decodeThemeCode(encodeThemeCode(shared));

check('a code carries the scheme', roundTripped?.preset === 'midnight');
check('a code carries an overridden colour', roundTripped?.overrides.primary === '#123456');
check('a code drops a key that isn’t a token', roundTripped?.overrides.nonsense === undefined);
check('a code carries the look', roundTripped?.look.corners === 'square' && roundTripped?.look.font === 'typewriter');
check('nonsense in the paste box is null, not a throw', decodeThemeCode('not a code at all') === null);
check('an empty paste box is null', decodeThemeCode('') === null);

/* ────────────────────────────────────────────────────────────────────────── */

console.log(failures === 0 ? '\nAll theme checks passed.' : `\n${failures} theme check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
