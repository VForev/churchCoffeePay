/**
 * Cross-platform printing.
 *
 * The rest of the agent doesn't care what OS it's on — it calls printPdf() and
 * lets this file pick the right path:
 *
 *   - Windows  → pdf-to-printer (bundles SumatraPDF), paper size by name.
 *   - macOS    → the built-in `lp` / CUPS commands, the same pipeline the print
 *                dialog uses. This is what made the CLABEL print on a Mac once the
 *                paper size was set correctly.
 *
 * The one genuinely fiddly bit is the label/paper size, because the two platforms
 * name sizes completely differently:
 *
 *   - Windows drivers name them in millimetres  → "40mm x 30mm"
 *   - CUPS names them in points                 → "w113h85"  (113pt × 85pt = 40×30mm)
 *
 * resolveMedia() hides that: give it the label size in mm and the sizes the printer
 * reports, and it returns the right name for this platform.
 */

import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const IS_WINDOWS = process.platform === 'win32';

// pdf-to-printer is CommonJS and only used on Windows, so it's required lazily —
// nothing on a Mac ever loads it. createRequire is needed because this file is ESM.
const require = createRequire(import.meta.url);
type PdfToPrinter = typeof import('pdf-to-printer');
let cachedPtp: PdfToPrinter | undefined;
function ptp(): PdfToPrinter {
  return (cachedPtp ??= require('pdf-to-printer'));
}

const PT_PER_MM = 72 / 25.4;
const mmToPt = (mm: number) => Math.round(mm * PT_PER_MM);

/** Printer/queue names the OS knows about. */
export async function listPrinterNames(): Promise<string[]> {
  if (IS_WINDOWS) {
    const printers = await ptp().getPrinters().catch(() => []);
    return printers.map((p) => p.name);
  }
  const { stdout } = await execFileP('lpstat', ['-e']).catch(() => ({ stdout: '' }));
  return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function macDefaultPrinter(): Promise<string | undefined> {
  const { stdout } = await execFileP('lpstat', ['-d']).catch(() => ({ stdout: '' }));
  // "system default destination: NAME"
  return stdout.match(/:\s*(\S+)/)?.[1];
}

/** The paper/label sizes a printer offers, in that platform's own naming. */
export async function listPaperSizes(printerName?: string): Promise<string[]> {
  if (IS_WINDOWS) {
    const printers = await ptp().getPrinters().catch(() => []);
    let target = printerName ? printers.find((p) => p.name === printerName) : undefined;
    if (!target && !printerName) {
      const def = await ptp().getDefaultPrinter().catch(() => null);
      target = (def && printers.find((p) => p.name === def.name)) || def || printers[0];
    }
    return target?.paperSizes ?? [];
  }

  const name = printerName || (await macDefaultPrinter());
  if (!name) return [];
  const { stdout } = await execFileP('lpoptions', ['-p', name, '-l']).catch(() => ({ stdout: '' }));
  // Line looks like: "PageSize/Media Size: w57h28 w113h85 *w142h142 Custom.WIDTHxHEIGHT"
  const line = stdout.split('\n').find((l) => /^PageSize\b/i.test(l));
  if (!line) return [];
  return (line.split(':')[1] ?? '')
    .trim()
    .split(/\s+/)
    .map((c) => c.replace(/^\*/, '')) // '*' marks the current default
    .filter(Boolean);
}

/**
 * The media name to print this label at. Handles the mm-vs-points naming gap.
 *
 * `override` (PRINTER_PAPER_SIZE) always wins. Otherwise: on Windows, match a size
 * whose name contains the width and height in mm; on macOS, convert to points and
 * use the matching `wWhH` name, falling back to a `Custom.WxH` size CUPS accepts.
 * Windows returns undefined when nothing matches (let the driver default stand);
 * macOS always returns something printable.
 */
export function resolveMedia(
  sizes: string[],
  widthMm: number,
  heightMm: number,
  override?: string,
): string | undefined {
  if (override) return override;

  if (IS_WINDOWS) {
    const w = Math.round(widthMm);
    const h = Math.round(heightMm);
    const near = (a: number, b: number) => Math.abs(a - b) <= 1;
    for (const name of sizes) {
      const nums = (name.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      for (let i = 0; i < nums.length; i++) {
        for (let j = 0; j < nums.length; j++) {
          if (i === j) continue;
          if ((near(nums[i], w) && near(nums[j], h)) || (near(nums[i], h) && near(nums[j], w))) {
            return name;
          }
        }
      }
    }
    return undefined;
  }

  // macOS / CUPS — sizes are in points, e.g. "w113h85".
  const wp = mmToPt(widthMm);
  const hp = mmToPt(heightMm);
  const exact = `w${wp}h${hp}`;
  if (sizes.includes(exact)) return exact;

  const near = (a: number, b: number) => Math.abs(a - b) <= 2;
  for (const name of sizes) {
    const m = name.match(/^w(\d+)h(\d+)$/i);
    if (m && near(Number(m[1]), wp) && near(Number(m[2]), hp)) return name;
  }
  return `Custom.${wp}x${hp}`;
}

/** Sends a PDF to the printer at the given media size. */
export async function printPdf(opts: {
  file: string;
  printerName?: string;
  media?: string;
  widthMm: number;
  heightMm: number;
}): Promise<void> {
  if (IS_WINDOWS) {
    await ptp().print(opts.file, {
      printer: opts.printerName || undefined,
      paperSize: opts.media || undefined,
      scale: 'fit',
    });
    return;
  }

  const args: string[] = [];
  if (opts.printerName) args.push('-d', opts.printerName);
  if (opts.media) args.push('-o', `media=${opts.media}`);
  // Keep the design inside the printable area even if the size is off by a hair.
  args.push('-o', 'fit-to-page', opts.file);
  await execFileP('lp', args);
}
