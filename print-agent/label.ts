/**
 * Draws one cup label as a PDF sized exactly to the roll.
 *
 * Thermal printers are 1-bit: a pixel is burned or it isn't. Greys dither into
 * mush at this size, so everything here is pure black on white, and the type is
 * sized to be read at arm's length by someone holding a cup in the other hand.
 *
 * Every measurement comes from labelMetrics() in src/lib/labels.ts — the same
 * function the admin preview uses. This file only converts millimetres to points
 * and puts ink down; it decides nothing about the layout on its own. That's what
 * stops /admin/labels from drifting away from what actually prints.
 */

import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { labelMetrics, effectiveRotate, combineModifierLines, TEMP_TEXT, EDGE_SAFE_MM, type LabelSettings, type LabelData } from '../src/lib/labels';

const MM_TO_PT = 2.834645669;

/**
 * Fits one line of text to the label width.
 *
 * "Bartholomew Vandersteen" ordering an Americano is the case that matters: at the
 * default size his name wraps onto two lines and the drink name lands on top of it.
 * So the type shrinks to fit first, and only truncates if even the floor size is
 * too wide — a smaller name is readable, a name printed over the drink is not.
 */
function fitOneLine(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
): { text: string; size: number } {
  doc.font(font);

  let size = startSize;
  while (size > minSize && doc.fontSize(size).widthOfString(text) > maxWidth) {
    size -= 0.5;
  }

  doc.fontSize(size);
  if (doc.widthOfString(text) <= maxWidth) return { text, size };

  let clipped = text;
  while (clipped.length > 1 && doc.widthOfString(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return { text: `${clipped}…`, size };
}

export async function renderLabelPdf(data: LabelData, settings: LabelSettings): Promise<string> {
  const pt = (mm: number) => mm * MM_TO_PT;
  const rotate = effectiveRotate(settings);

  // The design is ALWAYS laid out at the real label size — exactly the way the admin
  // preview draws it, so the type sizes on screen and on the roll can't drift. Rotation
  // is handled purely by turning the finished page for the printer (below), never by
  // re-laying-out the design at a swapped size.
  const m = labelMetrics(settings);

  const width = pt(m.widthMm);
  const height = pt(m.heightMm);
  const margin = pt(m.marginMm);
  const gap = pt(m.gapMm);
  const nameSize = pt(m.nameMm);
  const drinkSize = pt(m.drinkMm);
  const modSize = pt(m.modifierMm);
  const footerSize = pt(m.footerMm);
  const bandHeight = pt(m.bandMm);

  // This printer prints PORTRAIT pages upright. A tall label (e.g. 50×80) is already
  // portrait, so its page goes out as-is and reads the right way up. A wide label
  // (e.g. 40×30) would be auto-turned sideways by the printer, so when "flip" is on we
  // lay the design onto a PORTRAIT page (height × width) and spin it 90° — it then comes
  // off the roll upright, matching the preview. That is the whole job of the flip toggle.
  const pageW = rotate ? height : width;
  const pageH = rotate ? width : height;

  const doc = new PDFDocument({ size: [pageW, pageH], margin: 0 });
  const file = join(tmpdir(), `lotg-label-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
  const stream = createWriteStream(file);
  doc.pipe(stream);

  // Spin the design onto the portrait page; all drawing below stays in label coords
  // (width across, height down), so nothing else has to know about the rotation.
  if (rotate) doc.transform(0, 1, -1, 0, pageW, 0);

  // Keep everything clear of the right edge the print head can't reach.
  const edgeSafe = pt(EDGE_SAFE_MM);
  const contentWidth = width - margin * 2 - edgeSafe;
  let y = margin;

  // Temperature band — reversed out of black, because it's the one thing the
  // barista needs before they've read a single word.
  if (settings.show_temp_band && data.temp) {
    doc.rect(0, 0, width - edgeSafe, bandHeight).fill('#000');
    doc
      .fillColor('#fff')
      .font('Helvetica-Bold')
      .fontSize(bandHeight * 0.62)
      .text(TEMP_TEXT[data.temp], margin, bandHeight * 0.2, {
        width: contentWidth,
        align: 'center',
        lineBreak: false,
      });
    y = bandHeight + gap;
  }

  // Cup counter — skipped on single-drink orders, where it's noise.
  if (settings.show_cup_counter && data.cupTotal > 1) {
    doc
      .fillColor('#000')
      .font('Helvetica-Bold')
      .fontSize(footerSize)
      .text(`CUP ${data.cupIndex} OF ${data.cupTotal}`, margin, y, {
        width: contentWidth,
        align: 'right',
        lineBreak: false,
      });
    y += footerSize * 1.3;
  }

  const align: 'left' | 'center' = settings.center_text ? 'center' : 'left';

  // The name — the whole reason the label exists.
  const nameText = settings.uppercase_name ? data.customerName.toUpperCase() : data.customerName;
  const name = fitOneLine(doc, nameText, 'Helvetica-Bold', contentWidth, nameSize, nameSize * 0.6);
  doc
    .fillColor('#000')
    .font('Helvetica-Bold')
    .fontSize(name.size)
    .text(name.text, margin, y, { width: contentWidth, align, lineBreak: false });
  y += name.size * 1.15;

  // A very long name shrinks a long way to fit, and can end up SMALLER than the drink
  // under it — which reads as though the drink is the important thing. The name always wins.
  const drinkText = settings.uppercase_drink ? data.drinkName.toUpperCase() : data.drinkName;
  const drinkStart = Math.min(drinkSize, name.size * 0.8);
  const drink = fitOneLine(doc, drinkText, 'Helvetica-Bold', contentWidth, drinkStart, drinkStart * 0.7);
  doc
    .font('Helvetica-Bold')
    .fontSize(drink.size)
    .text(drink.text, margin, y, { width: contentWidth, align, lineBreak: false });
  y += drink.size * 1.3;

  // Where the note and footer go depends on which way the label is turned.
  //
  //  - UPRIGHT (not rotated, e.g. a tall 50×80): the far bottom edge is out of the
  //    print head's reach, so anything pinned there prints blank — the original "the
  //    notes never come out" bug. So they flow straight down under the modifiers and
  //    we accept blank space below them.
  //  - ROTATED (a wide label printed horizontal): the design's bottom maps to a side
  //    of the label that IS fully printable, so pinning the note and footer to the
  //    bottom fills the whole label instead of leaving an unused strip down one side.
  // Modifiers, one category per line — all the syrups on one line, the milk on its own,
  // etc. "\n" between categories makes PDFKit break the line; options inside a category
  // are joined with commas. Categories the admin chose to combine share a line; order
  // follows the group order set at /admin/modifiers.
  const modLines = combineModifierLines(data.modifiers, settings.modifier_combine);
  const hasMods = settings.show_modifiers && modLines.length > 0;
  const modText = modLines.map((line) => line.options.join(', ')).join('\n');

  const hasNote = settings.show_note && Boolean(data.note);
  const rawNote = `! ${data.note ?? ''}`;

  // The note is its own bold flagged line(s) — NOT boxed. It's trimmed up front to a line
  // budget (with an ellipsis) then drawn with plain wrapping, which always renders every
  // line it's handed — no clipping a line off unpredictably. Where it ENDS is read back
  // from doc.y after drawing rather than guessed, so the footer can never land on top.
  doc.font('Helvetica-Bold').fontSize(modSize);
  const oneLineH = doc.heightOfString('Ag', { width: 100000 });
  const lineAdvance = doc.currentLineHeight(true);
  const noteLines = (text: string) =>
    Math.max(1, Math.round(doc.heightOfString(text, { width: contentWidth }) / oneLineH));

  /** Trim the note to at most `maxLines` lines at the label width, adding … if it was cut. */
  const fitNote = (maxLines: number): string => {
    let text = rawNote;
    if (noteLines(text) > maxLines) {
      const words = text.split(' ');
      while (words.length > 1) {
        words.pop();
        const candidate = `${words.join(' ')}…`;
        if (noteLines(candidate) <= maxLines) {
          text = candidate;
          break;
        }
      }
    }
    return text;
  };

  const drawNote = (noteY: number, text: string) => {
    doc
      .fillColor('#000')
      .font('Helvetica-Bold')
      .fontSize(modSize)
      .text(text, margin, noteY, { width: contentWidth });
  };

  const drawFooter = (footerY: number) => {
    doc
      .fillColor('#000')
      .font('Helvetica')
      .fontSize(footerSize)
      .text(`#${data.orderCode}  ·  ${data.timeText}`, margin, footerY, {
        width: contentWidth,
        lineBreak: false,
      });
  };

  if (rotate) {
    // Fill to the bottom. The note is trimmed to whatever room is left between the drink
    // and the footer (keeping at least one modifier line if there are modifiers), so a
    // long note shrinks itself rather than climbing over the drinks above it.
    const footerY = settings.show_footer ? height - margin - footerSize : height - margin;
    const region = footerY - gap - y; // room below the drink, above the footer
    const minMods = hasMods ? modSize * 1.3 + gap : 0;
    const noteMaxLines = Math.min(3, Math.max(Math.floor((region - minMods) / lineAdvance), 1));
    const noteTextFill = hasNote ? fitNote(noteMaxLines) : '';
    const noteHeight = hasNote ? noteLines(noteTextFill) * lineAdvance : 0;
    const noteY = hasNote ? footerY - gap - noteHeight : footerY;

    if (hasMods) {
      doc
        .fillColor('#000')
        .font('Helvetica')
        .fontSize(modSize)
        .text(modText, margin, y, {
          width: contentWidth,
          height: Math.max((hasNote ? noteY - gap : footerY) - y, 0),
          align,
          ellipsis: true,
        });
    }
    if (hasNote) drawNote(noteY, noteTextFill);
    if (settings.show_footer) drawFooter(footerY);
  } else {
    // Flow down under the modifiers, staying clear of the unreachable bottom edge.
    if (hasMods) {
      // Capped (about 6 lines) so a huge order can't push the note and footer off.
      doc
        .fillColor('#000')
        .font('Helvetica')
        .fontSize(modSize)
        .text(modText, margin, y, {
          width: contentWidth,
          height: modSize * 6,
          align,
          ellipsis: true,
        });
      y = doc.y + gap;
    }
    if (hasNote) {
      // Draw it, then take the real end position from doc.y so the footer sits below.
      drawNote(y, fitNote(3));
      y = doc.y + gap;
    }
    if (settings.show_footer) drawFooter(y);
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return file;
}

/**
 * A deliberately crude test page: a full-page border, a solid black block, and big
 * text — all sized to the current label. It exists to answer one question when a
 * label comes out blank: does ANY ink land on the label at all?
 *
 *   - Solid black block prints  → the printer, driver and paper size are fine, so
 *     a blank real label is a content/layout problem we fix in code.
 *   - Nothing prints            → nothing we draw will ever show; the problem is
 *     the driver / paper size / print path, upstream of anything this file does.
 *
 * It intentionally does NOT go through the normal label renderer, so a bug there
 * can't be what makes it blank.
 */
export async function renderDiagnosticPdf(settings: LabelSettings): Promise<string> {
  const m = labelMetrics(settings);
  const pt = (mm: number) => mm * MM_TO_PT;
  const width = pt(m.widthMm);
  const height = pt(m.heightMm);

  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const file = join(tmpdir(), `lotg-doctor-${Date.now()}.pdf`);
  const stream = createWriteStream(file);
  doc.pipe(stream);

  // Border hugging the whole label edge — shows the printable area and alignment.
  doc.lineWidth(2).rect(1, 1, width - 2, height - 2).stroke('#000');

  // A solid black block filling the top ~55% — the "is any ink landing?" test.
  const pad = pt(2);
  doc.rect(pad, pad, width - pad * 2, height * 0.55 - pad).fill('#000');

  // Big text below it — the "does text render?" test.
  doc
    .fillColor('#000')
    .font('Helvetica-Bold')
    .fontSize(height * 0.2)
    .text('TEST 123', 0, height * 0.66, { width, align: 'center', lineBreak: false });

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return file;
}
