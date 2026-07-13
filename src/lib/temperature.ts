/**
 * Which cup to grab: hot cup or cold cup.
 *
 * The barista reaches for a cup before they read anything else, so every order
 * card leads with this. It's derived, not stored — temperature lives in whatever
 * the church named its modifier group ("Temperature" → Hot / Iced), and some
 * drinks carry it in the name instead ("Cold Brew" is never hot).
 *
 * Returns null when we genuinely can't tell (a pastry, a bottled water). The UI
 * shows no chip rather than guessing wrong — a wrong chip is worse than none.
 */
export type DrinkTemp = 'hot' | 'iced';

const ICED_MODIFIER = /\b(iced?|cold|over ice|frozen|blended|frappe)\b/i;
const HOT_MODIFIER = /\b(hot|steamed|extra hot)\b/i;

const ICED_ITEM = /\b(iced?|cold brew|nitro|frappe|frappuccino|frozen|smoothie|slush|lemonade|italian soda|refresher)\b/i;
const HOT_ITEM = /\b(hot chocolate|hot cocoa|americano|cappuccino|espresso|macchiato|drip coffee)\b/i;

/**
 * A modifier wins over the drink name: "Iced Latte" ordered "Hot" is hot, and a
 * plain "Latte" with an "Iced" modifier is iced.
 */
export function drinkTemperature(
  itemName: string | undefined | null,
  modifierNames: (string | undefined | null)[] = [],
): DrinkTemp | null {
  const mods = modifierNames.filter(Boolean) as string[];

  if (mods.some((m) => ICED_MODIFIER.test(m))) return 'iced';
  if (mods.some((m) => HOT_MODIFIER.test(m))) return 'hot';

  const name = itemName ?? '';
  if (ICED_ITEM.test(name)) return 'iced';
  if (HOT_ITEM.test(name)) return 'hot';

  return null;
}

export const TEMP_LABEL: Record<DrinkTemp, string> = {
  hot: 'HOT CUP',
  iced: 'COLD CUP',
};

export const TEMP_EMOJI: Record<DrinkTemp, string> = {
  hot: '☕',
  iced: '\u{1F9CA}',
};
