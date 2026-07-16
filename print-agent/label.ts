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
import { labelMetrics, TEMP_TEXT, EDGE_SAFE_MM, type LabelSettings, type LabelData } from '../src/lib/labels';

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
  const rotate = settings.rotate_label;

  // When rotated, the design is laid out to the SWAPPED size and then spun 90° onto
  // the page — so a printer that feeds the label the other way reads the right way up.
  const m = labelMetrics(
    rotate ? { ...settings, width_mm: settings.height_mm, height_mm: settings.width_mm } : settings,
  );

  const width = pt(m.widthMm);
  const margin = pt(m.marginMm);
  const gap = pt(m.gapMm);
  const nameSize = pt(m.nameMm);
  const drinkSize = pt(m.drinkMm);
  const modSize = pt(m.modifierMm);
  const footerSize = pt(m.footerMm);
  const bandHeight = pt(m.bandMm);

  // The page — and the media size sent to the printer — is always the physical label.
  const pageW = pt(settings.width_mm);
  const pageH = pt(settings.height_mm);

  const doc = new PDFDocument({ size: [pageW, pageH], margin: 0 });
  const file = join(tmpdir(), `lotg-label-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
  const stream = createWriteStream(file);
  doc.pipe(stream);

  // Rotate the whole design 90° into the page; drawing below stays in layout coords.
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

  // The name — the whole reason the label exists.
  const nameText = settings.uppercase_name ? data.customerName.toUpperCase() : data.customerName;
  const name = fitOneLine(doc, nameText, 'Helvetica-Bold', contentWidth, nameSize, nameSize * 0.6);
  doc
    .fillColor('#000')
    .font('Helvetica-Bold')
    .fontSize(name.size)
    .text(name.text, margin, y, { width: contentWidth, lineBreak: false });
  y += name.size * 1.15;

  // A very long name shrinks a long way to fit, and can end up SMALLER than the drink
  // under it — which reads as though the drink is the important thing. The name always wins.
  const drinkStart = Math.min(drinkSize, name.size * 0.8);
  const drink = fitOneLine(doc, data.drinkName, 'Helvetica-Bold', contentWidth, drinkStart, drinkStart * 0.7);
  doc
    .font('Helvetica-Bold')
    .fontSize(drink.size)
    .text(drink.text, margin, y, { width: contentWidth, lineBreak: false });
  y += drink.size * 1.3;

  // The note and footer flow straight down under the modifiers rather than being
  // pinned to the bottom edge. On a tall roll (e.g. 50×80) the printer's usable area
  // can stop short of the physical bottom — these CLABEL-style printers often fall
  // back to a ~50mm-tall media — so anything pinned to the bottom prints blank. That
  // was the "the notes never come out" bug: name/drink/modifiers land in the printed
  // region up top while the note and footer sat in dead space below it. Keeping them
  // right under the modifiers keeps them inside the area that actually prints.
  const hasNote = settings.show_note && Boolean(data.note);
  const noteHeight = modSize * 1.7;

  if (settings.show_modifiers && data.modifiers.length > 0) {
    // Capped so a long syrup list can't push the note and footer down the label.
    doc
      .fillColor('#000')
      .font('Helvetica')
      .fontSize(modSize)
      .text(data.modifiers.join(', '), margin, y, {
        width: contentWidth,
        height: modSize * 4.4,
        ellipsis: true,
      });
    y = doc.y + gap;
  }

  // A special request is the easiest thing on a busy morning to miss. Boxed.
  if (hasNote) {
    doc.lineWidth(0.75).rect(margin, y, contentWidth, noteHeight).stroke('#000');
    doc
      .fillColor('#000')
      .font('Helvetica-Bold')
      .fontSize(modSize)
      .text(`! ${data.note}`, margin + 2, y + noteHeight * 0.28, {
        width: contentWidth - 4,
        lineBreak: false,
        ellipsis: true,
      });
    y += noteHeight + gap;
  }

  if (settings.show_footer) {
    doc
      .fillColor('#000')
      .font('Helvetica')
      .fontSize(footerSize)
      .text(`#${data.orderCode}  ·  ${data.timeText}`, margin, y, {
        width: contentWidth,
        lineBreak: false,
      });
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
