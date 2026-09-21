/**
 * The colour schemes.
 *
 * Split out of theme.ts purely because there are a lot of them now and the mechanism is
 * easier to read without fourteen colour tables in the middle of it.
 *
 * ── Rules every preset here obeys ──────────────────────────────────────────────
 *
 * 1. **`primary`, `secondary`, `success`, `warm`, `danger` and `warning` all carry white
 *    text.** Buttons and chips across the app are `bg-primary text-white`; `text-white`
 *    stays literally white in every scheme (it sits on coloured fills, not on cards), so
 *    a pale `primary` is an invisible button. This is the one rule that cannot be bent.
 * 2. **`bg` / `surface` / `muted` / `line-soft` / `line` move together.** On a light
 *    scheme `surface` is lighter than `bg`; on a dark one it is *lighter* too — cards
 *    lift off the page in both. `line` is the hairline colour and has to be visible
 *    against `surface` or every card edge disappears.
 * 3. **Nothing is invented for the five church schemes.** Navy is what the app has always
 *    looked like; the other four use only the ten colours on the church colour sheet.
 *    The schemes below them are free-form — they're there so somebody who doesn't write
 *    code can change how the shop looks.
 *
 * Adding one: copy a block, keep all eighteen keys, and put it in the right `category`.
 * Nothing else in the app needs to know it exists.
 */

export type ThemeColors = Record<string, string>;

export type PresetCategory = 'church' | 'light' | 'dark' | 'fun';

export interface ThemePreset {
  id: string;
  name: string;
  category: PresetCategory;
  /** One line on what it is FOR, and what it costs — every scheme trades something. */
  blurb: string;
  colors: ThemeColors;
}

export const CATEGORY_LABELS: Record<PresetCategory, { title: string; note: string }> = {
  church: {
    title: 'Church schemes',
    note: 'Navy is how the app has always looked. The other four use only colours off the church colour sheet, so they sit beside the church’s own materials without clashing.',
  },
  light: {
    title: 'Other light schemes',
    note: 'Same idea, different colours. All light-backgrounded, all safe to use on a Sunday.',
  },
  dark: {
    title: 'Dark schemes',
    note: 'Dark page, light text. Easy on the eyes on the lobby TV in a dim room — read the note under the preview before putting one on a customer’s phone.',
  },
  fun: {
    title: 'For fun',
    note: 'Louder. Seasonal, or just different. Try them — nothing here can break an order.',
  },
};

/** The greys the app has always used, so a scheme that doesn't care about them looks unchanged. */
const LIGHT_GREYS = {
  muted: '#F9FAFB',
  'line-soft': '#F3F4F6',
  line: '#E5E7EB',
};

export const THEME_PRESETS: ThemePreset[] = [
  // ── Church ────────────────────────────────────────────────────────────────
  {
    id: 'navy',
    name: 'Navy — how it is now',
    category: 'church',
    blurb: 'The current app, unchanged. Blue buttons, green for ready, amber for waiting.',
    colors: {
      primary: '#4054B2',
      'primary-light': '#5A6FCC',
      secondary: '#6EC1E4',
      'secondary-light': '#8ED1EC',
      success: '#23A455',
      'success-light': '#61CE70',
      warm: '#6B5D4B',
      'warm-light': '#8A7A68',
      bg: '#F0F4F7',
      surface: '#FFFFFF',
      text: '#54595F',
      'text-dark': '#000000',
      'text-light': '#7A7A7A',
      danger: '#DC2626',
      warning: '#F59E0B',
      ...LIGHT_GREYS,
    },
  },
  {
    id: 'coffee-house',
    name: 'Coffee House',
    category: 'church',
    blurb: 'Warm browns off the church website. Reads as a coffee bar rather than an app.',
    colors: {
      primary: '#6B5D4B',
      'primary-light': '#85765F',
      secondary: '#B0A89C',
      'secondary-light': '#C6BFB4',
      success: '#5E7A4F',
      'success-light': '#7B996B',
      warm: '#7A6A55',
      'warm-light': '#9A8B75',
      bg: '#F5EFEA',
      surface: '#FFFFFF',
      text: '#4A3F35',
      'text-dark': '#241A14',
      'text-light': '#8A7C6E',
      danger: '#9C4A34',
      warning: '#B0791F',
      muted: '#FAF6F3',
      'line-soft': '#F2EBE5',
      line: '#E3D8CE',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    category: 'church',
    blurb:
      'Blue-grey does the tapping. Sits furthest from the olive and the red, so ready, sold out and tappable can never be confused.',
    colors: {
      primary: '#5A666B',
      'primary-light': '#74828A',
      secondary: '#B3ACA1',
      'secondary-light': '#C9C3BA',
      success: '#6F745D',
      'success-light': '#8A9077',
      warm: '#5C5241',
      'warm-light': '#7A6E59',
      bg: '#E6E6E6',
      surface: '#FFFFFF',
      text: '#4A4A46',
      'text-dark': '#333333',
      'text-light': '#6E6E68',
      danger: '#911B1B',
      warning: '#695B4B',
      muted: '#F4F4F3',
      'line-soft': '#EDEDEB',
      line: '#DCDCD9',
    },
  },
  {
    id: 'brown',
    name: 'Brown',
    category: 'church',
    blurb:
      'Closest to the church website itself. Slate takes over “being made”, since the sheet has no amber.',
    colors: {
      primary: '#695B4B',
      'primary-light': '#857561',
      secondary: '#5A666B',
      'secondary-light': '#74828A',
      success: '#6F745D',
      'success-light': '#8A9077',
      warm: '#5C5241',
      'warm-light': '#7A6E59',
      bg: '#E6E6E6',
      surface: '#FFFFFF',
      text: '#4A4A46',
      'text-dark': '#333333',
      'text-light': '#6E6E68',
      danger: '#911B1B',
      warning: '#5A666B',
      muted: '#F5F3F1',
      'line-soft': '#EDEAE7',
      line: '#DCD7D2',
    },
  },
  {
    id: 'red',
    name: 'Red',
    category: 'church',
    blurb:
      'The boldest, and the one people react to. It costs you red for problems — sold out and errors fall back to bark, because red is doing the tapping.',
    colors: {
      primary: '#911B1B',
      'primary-light': '#A93030',
      secondary: '#B3ACA1',
      'secondary-light': '#C9C3BA',
      success: '#6F745D',
      'success-light': '#8A9077',
      warm: '#5C5241',
      'warm-light': '#7A6E59',
      bg: '#E6E6E6',
      surface: '#FFFFFF',
      text: '#4A4A46',
      'text-dark': '#333333',
      'text-light': '#6E6E68',
      danger: '#5C5241',
      warning: '#695B4B',
      muted: '#F5F3F2',
      'line-soft': '#EDEAE9',
      line: '#DCD8D6',
    },
  },

  // ── Other light ───────────────────────────────────────────────────────────
  {
    id: 'ocean',
    name: 'Ocean',
    category: 'light',
    blurb:
      'Deep teal and a cool page. The furthest a light scheme gets from brown while keeping amber for waiting and red for problems.',
    colors: {
      primary: '#0E7490',
      'primary-light': '#1291B0',
      secondary: '#3B82A6',
      'secondary-light': '#4E9DC4',
      success: '#0F9D6E',
      'success-light': '#17B884',
      warm: '#5E6B73',
      'warm-light': '#78868F',
      bg: '#EFF7FA',
      surface: '#FFFFFF',
      text: '#3F4E55',
      'text-dark': '#0E2730',
      'text-light': '#6E828C',
      danger: '#DC2626',
      warning: '#E08A16',
      muted: '#F3FAFC',
      'line-soft': '#E4F1F6',
      line: '#CFE3EB',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    category: 'light',
    blurb:
      'Green buttons. The one scheme where “ready” has to work harder — success and primary are neighbours, so the Ready column leans on its badge more than its colour.',
    colors: {
      primary: '#2F6B4F',
      'primary-light': '#3E8763',
      secondary: '#6F8F6A',
      'secondary-light': '#87A681',
      success: '#3F8F55',
      'success-light': '#52AB6B',
      warm: '#6B5D4B',
      'warm-light': '#87765F',
      bg: '#F1F5F0',
      surface: '#FFFFFF',
      text: '#47513F',
      'text-dark': '#1B2A1E',
      'text-light': '#77836F',
      danger: '#B3462F',
      warning: '#C08A2E',
      muted: '#F6F9F5',
      'line-soft': '#EAF0E8',
      line: '#D8E2D5',
    },
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    category: 'light',
    blurb: 'Warm coral and peach. Bright and friendly; the closest thing here to a morning.',
    colors: {
      primary: '#D2552B',
      'primary-light': '#E36D43',
      secondary: '#D99A2E',
      'secondary-light': '#EAB047',
      success: '#4F9E63',
      'success-light': '#65B87A',
      warm: '#8A6A52',
      'warm-light': '#A5836A',
      bg: '#FFF6F0',
      surface: '#FFFFFF',
      text: '#5A4A42',
      'text-dark': '#3A1F13',
      'text-light': '#9A857A',
      danger: '#B93225',
      warning: '#C4831A',
      muted: '#FFFAF7',
      'line-soft': '#FBEEE6',
      line: '#F0DDD1',
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    category: 'light',
    blurb: 'Soft purple. Quiet, a little formal, and nothing else in the app is this colour.',
    colors: {
      primary: '#6D5BC4',
      'primary-light': '#8672D6',
      secondary: '#A07EC4',
      'secondary-light': '#B597D5',
      success: '#3F9B6B',
      'success-light': '#54B682',
      warm: '#7A6A85',
      'warm-light': '#95859F',
      bg: '#F5F2FC',
      surface: '#FFFFFF',
      text: '#4F4A5E',
      'text-dark': '#241E33',
      'text-light': '#857D96',
      danger: '#C64258',
      warning: '#C98A21',
      muted: '#FAF8FE',
      'line-soft': '#EFEBF8',
      line: '#E0DAF0',
    },
  },
  {
    id: 'high-contrast',
    name: 'High contrast',
    category: 'light',
    blurb:
      'Black text on white, heavy hairlines, the darkest usable buttons. For bright sun on the patio, or for anybody who finds the grey text hard going.',
    colors: {
      primary: '#0B3FA8',
      'primary-light': '#1450C8',
      secondary: '#00566E',
      'secondary-light': '#00708F',
      success: '#0A6B2E',
      'success-light': '#0D8A3C',
      warm: '#4A3A28',
      'warm-light': '#635039',
      bg: '#FFFFFF',
      surface: '#FFFFFF',
      text: '#1A1A1A',
      'text-dark': '#000000',
      'text-light': '#3D3D3D',
      danger: '#B00016',
      warning: '#7A4C00',
      muted: '#F0F0F0',
      'line-soft': '#B8B8B8',
      line: '#6E6E6E',
    },
  },

  // ── Dark ──────────────────────────────────────────────────────────────────
  {
    id: 'midnight',
    name: 'Midnight',
    category: 'dark',
    blurb: 'Dark blue-grey page, light text. The easiest of the three to read for a long shift.',
    colors: {
      primary: '#4C67D4',
      'primary-light': '#6480E6',
      secondary: '#2F7C99',
      'secondary-light': '#3D95B6',
      success: '#1F8C55',
      'success-light': '#2AA869',
      warm: '#8A7358',
      'warm-light': '#A68D70',
      bg: '#0F1720',
      surface: '#1A232E',
      text: '#C3CDD8',
      'text-dark': '#F2F6FA',
      'text-light': '#8A98A8',
      danger: '#C2373C',
      warning: '#B47D12',
      muted: '#151E28',
      'line-soft': '#26303C',
      line: '#34414F',
    },
  },
  {
    id: 'espresso',
    name: 'Espresso',
    category: 'dark',
    blurb: 'Dark, but warm — the coffee-house browns after hours. Amber buttons on near-black.',
    colors: {
      primary: '#96602C',
      'primary-light': '#B0753A',
      secondary: '#7A6A58',
      'secondary-light': '#94836E',
      success: '#4E7A46',
      'success-light': '#639659',
      warm: '#8A6C46',
      'warm-light': '#A6855B',
      bg: '#17110D',
      surface: '#241B14',
      text: '#D6C7B5',
      'text-dark': '#F6EEE4',
      'text-light': '#9C8A76',
      danger: '#B04A3A',
      warning: '#9C7420',
      muted: '#1D1610',
      'line-soft': '#32261B',
      line: '#443423',
    },
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    category: 'dark',
    blurb:
      'Neutral grey-black with no colour in the page at all, so the amber / navy / green of the barista columns are the only colours on screen.',
    colors: {
      primary: '#4A5563',
      'primary-light': '#5E6B7B',
      secondary: '#566270',
      'secondary-light': '#6B7888',
      success: '#1F8C55',
      'success-light': '#2AA869',
      warm: '#6B5D4B',
      'warm-light': '#83735E',
      bg: '#111214',
      surface: '#1D1F22',
      text: '#C9CBCF',
      'text-dark': '#FFFFFF',
      'text-light': '#8E9196',
      danger: '#C2373C',
      warning: '#B47D12',
      muted: '#17181A',
      'line-soft': '#292B2F',
      line: '#3B3E44',
    },
  },

  // ── For fun ───────────────────────────────────────────────────────────────
  {
    id: 'bubblegum',
    name: 'Bubblegum',
    category: 'fun',
    blurb: 'Pink and teal, and not subtle about it. Good for a youth Sunday.',
    colors: {
      primary: '#C9367F',
      'primary-light': '#DE4F95',
      secondary: '#2B9BA8',
      'secondary-light': '#37B5C4',
      success: '#2F9663',
      'success-light': '#3FB178',
      warm: '#8A6A7A',
      'warm-light': '#A68494',
      bg: '#FFF2F8',
      surface: '#FFFFFF',
      text: '#5B4553',
      'text-dark': '#3A1628',
      'text-light': '#9A8290',
      danger: '#C4362F',
      warning: '#C9841A',
      muted: '#FFF8FB',
      'line-soft': '#FBE8F1',
      line: '#F2D5E3',
    },
  },
  {
    id: 'autumn',
    name: 'Autumn',
    category: 'fun',
    blurb: 'Rust, ochre and olive. Pairs with a maple latte on the menu in October.',
    colors: {
      primary: '#A65424',
      'primary-light': '#C06A34',
      secondary: '#8A6A2E',
      'secondary-light': '#A6833F',
      success: '#66762F',
      'success-light': '#7E9040',
      warm: '#7A5A3A',
      'warm-light': '#96744F',
      bg: '#FBF4EC',
      surface: '#FFFFFF',
      text: '#4E4038',
      'text-dark': '#2B1D14',
      'text-light': '#8B7A6C',
      danger: '#A02D1E',
      warning: '#B07A18',
      muted: '#FEFAF5',
      'line-soft': '#F5ECE1',
      line: '#E8DACA',
    },
  },
  {
    id: 'christmas',
    name: 'Christmas',
    category: 'fun',
    blurb:
      'Red and evergreen. Costs you the same thing the Red scheme does — red is the tap colour, so problems fall back to a deeper red and are harder to spot.',
    colors: {
      primary: '#9B1C1C',
      'primary-light': '#B62A2A',
      secondary: '#1F6B3A',
      'secondary-light': '#2C8A4D',
      success: '#1F6B3A',
      'success-light': '#2C8A4D',
      warm: '#8A6A2E',
      'warm-light': '#A6833F',
      bg: '#FBF3F2',
      surface: '#FFFFFF',
      text: '#4A3A38',
      'text-dark': '#2A1414',
      'text-light': '#8A7573',
      danger: '#6E1010',
      warning: '#B07A1E',
      muted: '#FEF8F7',
      'line-soft': '#F6E9E7',
      line: '#EAD6D4',
    },
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    category: 'fun',
    blurb:
      'Black, white and one red. Looks sharp — but it costs you the barista board: pending, making and ready all come out grey, so the columns read by position and badge only.',
    colors: {
      primary: '#1F1F1F',
      'primary-light': '#3A3A3A',
      secondary: '#5E5E5E',
      'secondary-light': '#787878',
      success: '#3D3D3D',
      'success-light': '#565656',
      warm: '#4F4F4F',
      'warm-light': '#6B6B6B',
      bg: '#F4F4F2',
      surface: '#FFFFFF',
      text: '#2E2E2E',
      'text-dark': '#000000',
      'text-light': '#6E6E6E',
      danger: '#B1281E',
      warning: '#5A5A5A',
      muted: '#FAFAF8',
      'line-soft': '#EAEAE7',
      line: '#D5D5D1',
    },
  },
];

export const DEFAULT_PRESET_ID = 'navy';

export function presetById(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

/** True for the three dark schemes. Used only to warn, never to change behaviour. */
export function isDarkPreset(id: string): boolean {
  return presetById(id).category === 'dark';
}
