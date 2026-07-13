/**
 * Profanity filter for the customer name field.
 *
 * Names are displayed publicly on the /live screen, which at LOTG is a TV in
 * the lobby. So this is enforced in two places, deliberately:
 *
 *   1. validateName()  — blocks it at the input, with a message.
 *   2. safeDisplayName() — scrubs it at render time on the public screen, so
 *      anything that slipped in (bypassed form, seeded by hand, added before
 *      this filter existed) still never reaches the TV.
 *
 * Layer 2 is the one that actually protects the screen. The order insert runs
 * client-side against Supabase, so a determined person could always bypass
 * layer 1 — but they cannot bypass the render.
 */

/**
 * Unambiguous terms. Matched anywhere in the string, even inside another word,
 * because no real first name contains these and people pad them to evade filters
 * ("xxfuckxx"). Keep only terms that cannot appear innocently.
 */
const SEVERE = [
  'anal', 'anus', 'arsehole', 'ballsack', 'bastard', 'bellend', 'bitch',
  'blowjob', 'boner', 'bollock', 'buttplug', 'chink', 'clitoris', 'cocksuck',
  'coochie', 'coon', 'cracker', 'cunnilingus', 'cunt', 'deepthroat', 'dildo',
  'dyke', 'ejaculate', 'faggot', 'fellatio', 'fuck', 'gangbang', 'handjob',
  'hentai', 'incest', 'jerkoff', 'jizz', 'kike', 'labia', 'masturbat',
  'molest', 'nigger', 'nigga', 'nutsack', 'orgasm', 'orgy', 'pedophile',
  'penis', 'porn', 'pussy', 'queef', 'rape', 'rapist', 'retard', 'rimjob',
  'scrotum', 'semen', 'sexslave', 'shemale', 'slut', 'sodom', 'spunk',
  'testicle', 'titties', 'twat', 'vagina', 'wanker', 'whore',
];

/**
 * Matched only as a whole word, because each of these appears inside perfectly
 * innocent words or names — "Cass" contains "ass", "Dickinson" contains "dick",
 * "Shitake" contains "shit". Substring-matching these is the classic filter bug.
 */
const WORDS = [
  'arse', 'ass', 'asshole', 'balls', 'boob', 'boobs', 'butt', 'clit', 'cock',
  'crap', 'cum', 'damn', 'dick', 'douche', 'erection', 'fag', 'fuk', 'hoe',
  'horny', 'hooker', 'kunt', 'milf', 'nude', 'phuck', 'piss', 'prick',
  'pube', 'pubes', 'punani', 'queer', 'sex', 'sexy', 'shit', 'skank',
  'smegma', 'spic', 'suck', 'sucks', 'tit', 'tits', 'turd', 'vulva', 'wank',
  'wtf',
  // Not profanity, but nobody's order should get called out under these
  'hitler', 'nazi', 'kkk', 'satan',
];

/** Characters people swap in to dodge filters: fuck -> f*ck, f4ck, ph_u_c_k. */
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't',
  '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
  '*': '', '.': '', '_': '', '-': '', ' ': '',
};

/**
 * Folds evasion tricks down to plain letters:
 *   "F.U.C.K"  -> "fuck"
 *   "sh1t"     -> "shit"
 *   "fuuuuuck" -> "fuck"   (runs of 3+ collapse to one)
 *
 * Runs of exactly 2 are kept, so "ass" doesn't collapse to "as" and slip past.
 */
function normalize(input: string): string {
  const mapped = input
    .toLowerCase()
    .split('')
    .map((ch) => (ch in LEET ? LEET[ch] : ch))
    .join('')
    .replace(/[^a-z]/g, '');

  return mapped.replace(/(.)\1{2,}/g, '$1');
}

/**
 * Innocent words that happen to contain a SEVERE term. Without these we'd hit the
 * classic "Scunthorpe problem" — and, more importantly here, we'd reject real
 * people: Analiese and Anaya are actual first names containing "anal".
 *
 * Checked as whole words, so a name is only exempted when it matches entirely.
 */
const ALLOWLIST = new Set([
  // Real given names / surnames that trip a substring match
  'analiese', 'analise', 'anali', 'analia', 'analeigh', 'anahi',
  'cockburn', 'hancock', 'dickinson', 'cummings', 'cumberland',
  'titus', 'tituss', 'sexton',
  // Places and ordinary words
  'scunthorpe', 'penistone', 'clitheroe', 'lightwater', 'sussex', 'essex',
  'middlesex', 'analysis', 'analyst', 'analytics', 'analog', 'analogy',
  'assassin', 'assess', 'assets', 'classic', 'shitake', 'shiitake',
  'therapist', 'grape', 'grapes', 'scrape',
]);

/** Folds each word individually, keeping word boundaries. */
function normalizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9@$!|+*._-]+/i)
    .map((word) =>
      word
        .split('')
        .map((ch) => (ch in LEET ? LEET[ch] : ch))
        .join('')
        .replace(/[^a-z]/g, '')
        .replace(/(.)\1{2,}/g, '$1'),
    )
    .filter(Boolean);
}

export function containsProfanity(input: string): boolean {
  if (!input) return false;

  const words = normalizeWords(input);

  // Whole words we've explicitly cleared can't trip the substring scan below.
  const suspect = words.filter((word) => !ALLOWLIST.has(word));

  // Rejoin what's left before the substring scan, so spacing tricks like
  // "b i t c h" still collapse into a single match.
  const collapsed = normalize(suspect.join(''));
  if (SEVERE.some((term) => collapsed.includes(term))) return true;

  return suspect.some((word) => WORDS.includes(word));
}

export interface NameValidation {
  ok: boolean;
  /** Message to show the customer. Deliberately not preachy. */
  error?: string;
}

const MAX_NAME_LENGTH = 30;

/** Validates a customer name for an order. */
export function validateName(raw: string): NameValidation {
  const name = raw.trim();

  if (!name) return { ok: false, error: 'Please enter a name' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Please keep it under ${MAX_NAME_LENGTH} characters` };
  }
  if (!/[a-zA-Z]/.test(name)) {
    return { ok: false, error: 'Please enter a real name' };
  }
  if (containsProfanity(name)) {
    return { ok: false, error: "Please use a name we can call out in the lobby 🙂" };
  }

  return { ok: true };
}

/**
 * What the public /live screen actually renders. Never trusts the database.
 * If a name is unfit for a church lobby TV, we show a harmless placeholder
 * instead — the barista board still shows the real value so staff can match
 * the cup to the person.
 */
export function safeDisplayName(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) return 'Guest';
  if (containsProfanity(name)) return 'Guest';
  return name.slice(0, MAX_NAME_LENGTH);
}
