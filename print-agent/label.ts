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
import { labelMetrics, TEMP_TEXT, type LabelSettings, type LabelData } from '../src/lib/labels';

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
  const m = labelMetrics(settings);
  const pt = (mm: number) => mm * MM_TO_PT;

  const width = pt(m.widthMm);
  const height = pt(m.heightMm);
  const margin = pt(m.marginMm);
  const gap = pt(m.gapMm);
  const nameSize = pt(m.nameMm);
  const drinkSize = pt(m.drinkMm);
  const modSize = pt(m.modifierMm);
  const footerSize = pt(m.footerMm);
  const bandHeight = pt(m.bandMm);

  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const file = join(tmpdir(), `lotg-label-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
  const stream = createWriteStream(file);
  doc.pipe(stream);

  const contentWidth = width - margin * 2;
  let y = margin;

  // Temperature band — reversed out of black, because it's the one thing the
  // barista needs before they've read a single word.
  if (settings.show_temp_band && data.temp) {
    doc.rect(0, 0, width, bandHeight).fill('#000');
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

  // The footer and the note box get their space reserved BEFORE the modifiers are
  // drawn — a five-syrup order must never push the special instructions off the label.
  const hasNote = settings.show_note && Boolean(data.note);
  const footerY = settings.show_footer ? height - margin - footerSize : height - margin;
  const noteHeight = modSize * 1.7;
  const noteY = hasNote ? footerY - gap - noteHeight : footerY;

  if (settings.show_modifiers && data.modifiers.length > 0) {
    doc
      .font('Helvetica')
      .fontSize(modSize)
      .text(data.modifiers.join(', '), margin, y, {
        width: contentWidth,
        height: Math.max(noteY - gap - y, modSize),
        ellipsis: true,
      });
  }

  // A special request is the easiest thing on a busy morning to miss. Boxed.
  if (hasNote) {
    doc.lineWidth(0.75).rect(margin, noteY, contentWidth, noteHeight).stroke('#000');
    doc
      .fillColor('#000')
      .font('Helvetica-Bold')
      .fontSize(modSize)
      .text(`! ${data.note}`, margin + 2, noteY + noteHeight * 0.28, {
        width: contentWidth - 4,
        lineBreak: false,
        ellipsis: true,
      });
  }

  if (settings.show_footer) {
    doc
      .fillColor('#000')
      .font('Helvetica')
      .fontSize(footerSize)
      .text(`#${data.orderCode}  ·  ${data.timeText}`, margin, footerY, {
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
