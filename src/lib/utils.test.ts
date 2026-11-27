/**
 * cn() — the caller's class wins, and this app's own class names survive the merge.
 *
 * `npm run test:cn`
 *
 * Every shared component builds its classes as cn(builtIns, className). If this ever
 * goes back to plain joining, overrides are decided by stylesheet order instead — the bug
 * where <Card className="p-0"> kept its padding. And if tailwind-merge forgets one of our
 * names, it drops a class: `font-heading` mistaken for a weight, `text-text-dark` for a
 * size.
 */
import { cn } from './utils';
const cases: [string, string[], string][] = [
  ['caller padding wins', ['bg-surface rounded-2xl p-4', 'p-0'], 'bg-surface rounded-2xl p-0'],
  ['caller bg wins', ['bg-surface border border-gray-100/80', 'border-2 border-warning/40 bg-warning/10'], 'border-2 border-warning/40 bg-warning/10'],
  ['font family + weight both kept', ['font-accent font-semibold', 'font-heading'], 'font-semibold font-heading'],
  ['weight vs family not merged', ['font-heading', 'font-bold'], 'font-heading font-bold'],
  ['colour vs size kept', ['text-[15px] text-text', 'text-text-dark'], 'text-[15px] text-text-dark'],
  ['size vs colour kept', ['text-sm text-primary'], 'text-sm text-primary'],
  ['arbitrary size replaces named', ['text-sm', 'text-[17px]'], 'text-[17px]'],
  ['shadow size + tinted colour kept', ['shadow-sm shadow-primary/20'], 'shadow-sm shadow-primary/20'],
  ['radius var kept with others', ['rounded-[var(--radius-button)] px-5'], 'rounded-[var(--radius-button)] px-5'],
  ['custom utilities untouched', ['glass pressable animate-rise ease-snappy'], 'glass pressable animate-rise ease-snappy'],
  ['variants independent', ['animate-sheet-up sm:animate-dialog-in'], 'animate-sheet-up sm:animate-dialog-in'],
  ['text-surface colour', ['text-white', 'text-surface'], 'text-surface'],
  ['white text kept with size', ['text-xs text-white'], 'text-xs text-white'],
  ['ring offset colour', ['ring-2 ring-primary ring-offset-2 ring-offset-bg'], 'ring-2 ring-primary ring-offset-2 ring-offset-bg'],
  ['falsy dropped', ['a', false, undefined as unknown as string, 'b'] as string[], 'a b'],
];
let fail = 0;
for (const [name, input, want] of cases) {
  const got = cn(...input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n      got:  ${got}\n      want: ${want}`}`);
}
console.log(fail ? `\n${fail} cn check(s) failed.` : '\nAll cn checks passed.');
process.exit(fail ? 1 : 0);
