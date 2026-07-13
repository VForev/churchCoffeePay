/**
 * Run with:  npx tsx src/lib/profanity.test.ts
 *
 * Two failure modes, and they are NOT equally bad:
 *
 *   - A MISS lets something crude onto the lobby TV. Bad.
 *   - A FALSE POSITIVE tells a real person their actual name is offensive.
 *     Worse. Every real name below must pass.
 *
 * Run this after touching any list in profanity.ts.
 */

import { validateName, validateFullName, safeDisplayName } from './profanity';

/** Must be blocked. */
const MUST_BLOCK = [
  // Plain
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'pussy', 'dick', 'anal',
  // The n-word and its variants (the case that prompted this)
  'nigger', 'nigga', 'n1gger', 'n1663r', 'niqqer', 'niqqa', 'niggah',
  'n i g g e r', 'N.I.G.G.E.R', 'niiiigger', 'nignog', 'nggr', 'sandnigger',
  // Other slurs
  'faggot', 'f4gg0t', 'fggt', 'kike', 'chink', 'spic', 'gook', 'coon',
  'tranny', 'retard', 'wetback', 'beaner', 'towelhead', 'raghead', 'dyke',
  // Spacing / punctuation evasion
  'F.U.C.K', 'f u c k', 'c u n t', 'b i t c h', 's h i t', 'p_u_s_s_y',
  // Leetspeak
  'sh1t', 'a$$hole', 'b!tch', 'phuck', 'fuk', 'fck', 'p0rn', '5hit',
  // Padding
  'xxfuckxx', 'iamabitch', 'Ben the 3rd fuck',
  // Sexual
  'blowjob', 'handjob', 'jizz', 'cum', 'slut', 'whore', 'porn', 'rape',
  'penis', 'vagina', 'boobs', 'tits', 'horny', 'sexy', 'orgasm', 'milf',
  'suck it', 'deepthroat', 'threesome',
  // Hate
  'hitler', 'nazi', 'kkk', 'satan',
];

/**
 * Must be allowed. These are real first names, surnames, and ordinary words —
 * many chosen precisely because they contain a banned term as a substring.
 */
const MUST_PASS = [
  // Names containing slurs as substrings — the ones that matter most
  'Analiese', 'Analise', 'Anali', 'Analia', 'Anahi', 'Anais',
  'Dickinson', 'Dickens', 'Cummings', 'Cummins', 'Cumberland',
  'Cockburn', 'Hancock', 'Babcock', 'Alcock', 'Titus', 'Sexton',
  'Nigel', 'Nikki', 'Fagan', 'Matsumoto',
  // "ass" names
  'Cass', 'Cassandra', 'Cassidy', 'Bassett', 'Bass', 'Grass', 'Class',
  // Ordinary words
  'Scunthorpe', 'Essex', 'Sussex', 'Shitake', 'Analyst', 'Therapist',
  'Assassin', 'Grapes', 'Cucumber',
  // Two-word names that squash into a banned substring. These are why the
  // squashed scan is gated behind isLetterSpaced() — "Josh Ito" -> "joshito".
  'Josh Ito', 'Cass Hole', 'Mike Oxlong Jr', 'Tim Cummins', 'Sam Assad',
  'Bob Utts', 'Ana Little', 'Di Cknight',
  // Ordinary names — the bulk of real traffic
  'Dillon', 'Mike', 'Michael', 'Anna', 'Sarah', 'Alexander', 'Jo', 'Bo',
  'Mary-Kate', "O'Brien", 'Sam W.', 'Matthew', 'Jose', 'Maria', 'Buck',
  'Tucker', 'Chuck', 'Chris P', 'Xander', 'Suzanne', 'Sandra', 'Peter',
  'Regina', 'Dixon', 'Cocoa', 'Hugh', 'Randy', 'Willy', 'Dong', 'Phuc',
  'Aditya', 'Nguyen', 'Shanice', 'Latoya', 'Jesús', 'Renée', 'Zoë',
];

let misses = 0;
let falsePositives = 0;

console.log('── attacks that got through ──────────────────');
for (const s of MUST_BLOCK) {
  if (validateName(s).ok) {
    console.log(`  MISS    ${JSON.stringify(s)}`);
    misses++;
  }
}
if (misses === 0) console.log('  none ✓');

console.log('\n── real names wrongly rejected ───────────────');
for (const s of MUST_PASS) {
  if (!validateName(s).ok) {
    console.log(`  FALSE+  ${JSON.stringify(s)}`);
    falsePositives++;
  }
}
if (falsePositives === 0) console.log('  none ✓');

/** Orders need a first name plus a last name or initial. */
const FULL_NAME_CASES: [string, boolean][] = [
  ['Sarah K', true],
  ['Sarah K.', true],
  ['Sarah Kowalczyk', true],
  ["Mary-Kate O'Brien", true],
  ['Juan Carlos Ramirez', true],
  ['Sarah', false],
  ['   Sarah   ', false],
  ['K', false],
  ['', false],
];

console.log('\n── first + last name required ────────────────');
let shapeFailures = 0;
for (const [name, shouldPass] of FULL_NAME_CASES) {
  if (validateFullName(name).ok !== shouldPass) {
    console.log(`  WRONG   ${JSON.stringify(name)} — expected ${shouldPass ? 'pass' : 'reject'}`);
    shapeFailures++;
  }
}
if (shapeFailures === 0) console.log('  none ✓');

console.log('\n── public screen (safeDisplayName) ───────────');
for (const s of ['fuck', 'Dillon', '', '   ', 'n i g g e r']) {
  console.log(`  ${JSON.stringify(s).padEnd(14)} -> ${JSON.stringify(safeDisplayName(s))}`);
}

const total = MUST_BLOCK.length + MUST_PASS.length + FULL_NAME_CASES.length;
const failures = misses + falsePositives + shapeFailures;
console.log(
  `\n${failures === 0 ? '✅ PASS' : '❌ FAIL'} — ` +
    `${MUST_BLOCK.length} attacks, ${MUST_PASS.length} real names, ` +
    `${FULL_NAME_CASES.length} name shapes, ${misses} missed, ` +
    `${falsePositives} false positives, ${shapeFailures} wrong shape (${total} cases)`,
);

if (failures > 0) process.exit(1);
