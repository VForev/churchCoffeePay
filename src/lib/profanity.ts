/**
 * Profanity filter for the customer name field.
 *
 * Names are displayed publicly on the /live screen — a TV in the church lobby —
 * so this is enforced in two places, deliberately:
 *
 *   1. validateName()    — blocks it at the input, with a message.
 *   2. safeDisplayName() — scrubs it at render time on the public screen, so
 *      anything that slipped in (bypassed form, added before this filter
 *      existed) still never reaches the TV.
 *
 * Layer 2 is the one that actually protects the screen. The order insert runs
 * client-side against Supabase, so a determined person could bypass layer 1 —
 * but they cannot bypass the render.
 *
 * ── Why three matchers, not one ──────────────────────────────────────────────
 *
 * The `obscenity` library is the backbone (maintained, ~1,700 patterns, handles
 * leetspeak and unicode confusables). But benchmarked on its own it BOTH:
 *   - missed spacing evasion — "F.U.C.K", "n i g g e r", "c u n t" all passed
 *   - falsely blocked real names — Analiese, Dickinson, Cummings
 *
 * So it runs alongside a normalizer that collapses evasion tricks, and an
 * allowlist that protects real names. Every change here is covered by
 * src/lib/profanity.test.ts — run it before you touch the lists.
 */

import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * Innocent words that contain a banned term. Checked as WHOLE words, so a name
 * is only exempted when it matches entirely.
 *
 * This list is the most important one in the file. Wrongly rejecting a real
 * congregant's name on a Sunday morning is far worse than missing a swear word,
 * and several real given names ("Analiese") contain slurs as substrings.
 */
const ALLOWLIST = new Set([
  // Real given names and surnames that trip a substring match
  'analiese', 'analise', 'anali', 'analia', 'analeigh', 'anahi', 'anais',
  'cockburn', 'hancock', 'babcock', 'alcock', 'dickinson', 'dickens', 'dicker',
  'cummings', 'cumberland', 'cummins', 'titus', 'tituss', 'sexton', 'saxton',
  'niger', 'nigeria', 'nigerian', 'nigel', 'nikki',
  'fagan', 'fagin', 'hoen', 'hoerner', 'shitrit',
  // Places, foods, ordinary words
  'scunthorpe', 'penistone', 'clitheroe', 'lightwater', 'sussex', 'essex',
  'middlesex', 'wessex', 'japan', 'japanese', 'niggard', 'niggardly',
  'analysis', 'analyst', 'analytics', 'analog', 'analogy', 'analyze',
  'assassin', 'assess', 'assessment', 'assets', 'assign', 'assist', 'associate',
  'assume', 'assure', 'bass', 'brass', 'class', 'classic', 'glass', 'grass',
  'mass', 'pass', 'grasshopper', 'shitake', 'shiitake', 'therapist',
  'grape', 'grapes', 'scrape', 'therapeutic', 'butter', 'button', 'shuttle',
  'document', 'documents', 'circumstance', 'cucumber', 'accumulate',
  'matsumoto', 'cockatoo', 'cockpit', 'peacock', 'shuttlecock', 'woodcock',
]);

/**
 * Unambiguous terms, matched ANYWHERE in the collapsed string — even inside
 * another word, and even across word gaps, because that's how people evade
 * ("xx_fuck_xx", "f u c k"). Only put terms here that cannot appear innocently;
 * anything that can (ass, dick, shit) belongs in WORDS instead.
 */
const SEVERE = [
  // Racial and ethnic slurs, with the spellings the normalizer can't reach.
  // Digit and repeat-character variants (n1gg3r, niiigger) are handled by
  // normalize(); the q/ph swaps are handled by the extra collapsed variants.
  'nigger', 'nigga', 'niggah', 'nigguh', 'nignog', 'nigglet', 'niggr', 'nggr',
  'niqqer', 'niqqa', 'sandnigger', 'kike', 'chink', 'gook', 'wetback',
  'beaner', 'jigaboo', 'porchmonkey', 'tarbaby', 'towelhead', 'raghead',
  'zipperhead', 'wigger', 'coolie', 'kaffir', 'gollywog', 'golliwog',
  'halfbreed', 'redskin', 'squaw', 'gyppo', 'pickaninny', 'mudshark',
  // Slurs against orientation, gender, disability
  'faggot', 'faggit', 'fagget', 'fggt', 'tranny', 'shemale', 'ladyboy',
  'dyke', 'homo', 'batty', 'retard', 'tard', 'mongoloid', 'spastic',
  // Sexual
  'anal', 'anus', 'arsehole', 'asshole', 'ballsack', 'bellend', 'bitch',
  'bitchez', 'blowjob', 'bollock', 'boner', 'buttplug', 'clitoris', 'cocksuck',
  'coochie', 'creampie', 'cunnilingus', 'cunt', 'cnut', 'deepthroat', 'dildo',
  'ejaculate', 'erection', 'fellatio', 'fingerbang', 'fisting', 'gangbang',
  'handjob', 'hentai', 'incest', 'jackoff', 'jerkoff', 'jizz', 'labia',
  'masturbat', 'molest', 'nutsack', 'orgasm', 'orgy', 'pedophile', 'pedo',
  'penis', 'pron', 'porn', 'pussy', 'pusi', 'queef', 'rapist', 'rimjob',
  'scrotum', 'semen', 'sexslave', 'skeet', 'slut', 'smegma', 'sodom', 'spunk',
  'testicle', 'threesome', 'titties', 'titty', 'twat', 'vagina', 'wanker',
  'whore', 'hooker', 'nympho', 'strapon', 'bukkake', 'cameltoe',
  // General profanity
  'fuck', 'fuk', 'fck', 'phuck', 'fuq', 'motherfuck', 'clusterfuck',
  'bullshit', 'horseshit', 'dumbass', 'jackass', 'douchebag',
  // Nobody's order should get called out under these
  'hitler', 'nazi', 'antifa', 'isis',
];

/**
 * Matched only as a WHOLE word, because each appears inside perfectly innocent
 * words — "Cass" contains "ass", "Dickinson" contains "dick", "Shitake"
 * contains "shit". Substring-matching these is the classic filter bug.
 */
const WORDS = [
  'arse', 'ass', 'balls', 'bastard', 'boob', 'boobs', 'bugger', 'butt',
  'clit', 'cock', 'coon', 'crap', 'cum', 'damn', 'dick', 'dildo', 'douche',
  'fag', 'fanny', 'gay', 'god', 'goddamn', 'hell', 'hoe', 'hoes', 'homo',
  'horny', 'jap', 'jesus', 'kkk', 'kunt', 'milf', 'nip', 'nude', 'nudes',
  'paki', 'phag', 'piss', 'poon', 'prick', 'pube', 'pubes', 'punani', 'queer',
  'satan', 'sex', 'sexy', 'shag', 'shit', 'skank', 'spic', 'suck', 'sucks',
  'thot', 'tit', 'tits', 'turd', 'twink', 'vulva', 'wang', 'wank', 'wop',
  'wtf', 'xxx',
];

/** Characters swapped in to dodge filters: fuck -> f*ck, f4ck, ph_u_c_k. */
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't',
  '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
  '(': 'c', '<': 'c', '*': '', '.': '', '_': '', '-': '', ' ': '',
};

/**
 * Folds evasion tricks down to plain letters:
 *   "F.U.C.K"  -> "fuck"
 *   "sh1t"     -> "shit"
 *   "fuuuuuck" -> "fuck"   (with collapseRepeats)
 *
 * collapseRepeats is optional because it is itself destructive: it turns "kkk"
 * into "k". So every check runs against BOTH forms — collapsed to catch padded
 * spellings, and uncollapsed to catch terms that ARE a repeated character.
 */
function fold(input: string, collapseRepeats: boolean): string {
  const mapped = input
    .toLowerCase()
    .split('')
    .map((ch) => (ch in LEET ? LEET[ch] : ch))
    .join('')
    .replace(/[^a-z]/g, '');

  // Runs of exactly 2 are preserved either way, so "ass" never becomes "as".
  return collapseRepeats ? mapped.replace(/(.)\1{2,}/g, '$1') : mapped;
}

/** Splits into words and folds each one, keeping word boundaries intact. */
function foldWords(input: string, collapseRepeats: boolean): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9@$!|+*._<(-]+/i)
    .map((word) => fold(word, collapseRepeats))
    .filter(Boolean);
}

/**
 * Extra spellings to scan, covering swaps the leet map can't express because
 * the letters are legitimate elsewhere: niqqer -> nigger, phuck -> fuck.
 */
function variantsOf(text: string): string[] {
  return [
    text,
    text.replace(/q/g, 'g'),
    text.replace(/ph/g, 'f'),
    text.replace(/z/g, 's'),
    text.replace(/ck/g, 'k'),
  ];
}

/**
 * True for input like "s h i t" or "f u c k" — mostly single letters, which is
 * only ever done to defeat a filter.
 *
 * This gate matters: it lets us squash the spaces and substring-scan the result
 * WITHOUT doing that to normal input. Blindly joining every name would invent
 * profanity that was never typed — "Josh Ito" would become "joshito", which
 * contains "shit", and we'd reject a real person.
 */
function isLetterSpaced(words: string[]): boolean {
  if (words.length < 3) return false;
  const singles = words.filter((w) => w.length === 1).length;
  return singles / words.length >= 0.6;
}

export function containsProfanity(input: string): boolean {
  if (!input) return false;

  const collapsed = foldWords(input, true);
  const literal = foldWords(input, false);

  // Whole words we've explicitly cleared are dropped before any scan below,
  // so "Analiese" and "Dickinson" can never trip the substring matchers.
  const keep = (words: string[]) => words.filter((w) => !ALLOWLIST.has(w));
  const suspect = keep(collapsed);
  const suspectLiteral = keep(literal);

  if (suspect.length === 0 && suspectLiteral.length === 0) return false;

  // 1. The library, on de-leeted words with boundaries intact. Its own
  //    whitelist logic works properly on this shape of input.
  if (matcher.hasMatch(suspect.join(' '))) return true;
  if (matcher.hasMatch(suspectLiteral.join(' '))) return true;

  // 2. Severe terms, substring-scanned WITHIN each word. Catches padding
  //    ("xxfuckxx") without letting two innocent words fuse into a slur.
  const scan = (text: string, terms: string[]) =>
    variantsOf(text).some((v) => terms.some((term) => v.includes(term)));

  const allWords = [...suspect, ...suspectLiteral];
  if (allWords.some((word) => scan(word, SEVERE))) return true;

  // 3. Whole-word terms, too risky to substring-match against a real name.
  //    Checked in both folded forms so "kkk" survives repeat-collapsing.
  const wordSet = new Set(allWords);
  if (WORDS.some((term) => wordSet.has(term))) return true;

  // 4. Only for deliberately letter-spaced input, squash the gaps and scan the
  //    whole string. This is the ONLY place words are fused together, and it is
  //    gated because fusing normal input invents profanity nobody typed:
  //    "Cass Hole" -> "casshole", "Ana Little" -> "analittle".
  if (isLetterSpaced(literal)) {
    const squashed = [suspect.join(''), suspectLiteral.join('')];
    if (squashed.some((text) => scan(text, SEVERE) || scan(text, WORDS))) return true;
  }

  return false;
}

export interface NameValidation {
  ok: boolean;
  /** Message shown to the customer. Deliberately not preachy. */
  error?: string;
}

const MAX_NAME_LENGTH = 30;

/** Validates a customer name for an order. */
export function validateName(raw: string): NameValidation {
  const name = (raw ?? '').trim();

  if (!name) return { ok: false, error: 'Please enter a name' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Please keep it under ${MAX_NAME_LENGTH} characters` };
  }
  if (!/[a-zA-Z]/.test(name)) {
    return { ok: false, error: 'Please enter a real name' };
  }
  if (containsProfanity(name)) {
    return { ok: false, error: 'Please use a name we can call out in the lobby 🙂' };
  }

  return { ok: true };
}

/**
 * What the public /live screen actually renders. Never trusts the database.
 * If a name is unfit for a church lobby TV, a harmless placeholder is shown
 * instead — the barista board still shows the real value so staff can match
 * the cup to the person.
 */
export function safeDisplayName(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) return 'Guest';
  if (containsProfanity(name)) return 'Guest';
  return name.slice(0, MAX_NAME_LENGTH);
}
