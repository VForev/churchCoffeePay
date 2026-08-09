'use client';

import {
  labelMetrics,
  groupStyle,
  orderModifierLines,
  showsBrand,
  TEMP_TEXT,
  EDGE_SAFE_MM,
  type LabelSettings,
  type LabelData,
} from '@/lib/labels';
import { LOGO_DATA_URI, LOGO_ASPECT } from '@/lib/logo';

/**
 * An on-screen mock of the printed label.
 *
 * It reads its sizes from labelMetrics() — the exact same function the print agent
 * uses — and only converts millimetres to pixels instead of to points. That's what
 * keeps the preview honest: change a size here and you'd have changed it on the roll.
 *
 * The one thing it can't reproduce is PDFKit's shrink-to-fit on a long name, so this
 * uses CSS to do the equivalent (scale down, then ellipsis). Close enough to judge a
 * layout by; the roll is still the final word, which is what "Send test label" is for.
 */

/** Screen pixels per millimetre. Big enough to read the small print. */
const PX_PER_MM = 4.6;
const px = (mm: number) => `${mm * PX_PER_MM}px`;

export default function LabelPreview({
  settings,
  data,
}: {
  settings: LabelSettings;
  data: LabelData;
}) {
  // The preview always shows the finished, upright label — exactly what comes off the
  // roll once the flip toggle is set right. Rotation is a printer-feed concern handled
  // in the PDF, not something the held label shows, so the preview never spins.
  const m = labelMetrics(settings);
  const modLines = orderModifierLines(data.modifiers, settings.modifier_group_order)
    .map((line) => ({ style: groupStyle(settings, line.group), text: line.options.join(', ') }))
    .filter((l) => l.style.show && l.text.length > 0);
  const showBand = settings.show_temp_band && data.temp !== null;
  const showCounter = settings.show_cup_counter && data.cupTotal > 1;
  const showMods = settings.show_modifiers && modLines.length > 0;
  const showNote = settings.show_note && Boolean(data.note);
  const showBrand = showsBrand(settings);
  const churchText = settings.church_name.trim();
  const align: 'left' | 'center' = settings.center_text ? 'center' : 'left';

  const label = (
    <div
      className="relative shrink-0 overflow-hidden bg-white text-black shadow-md ring-1 ring-gray-300"
      style={{
        width: px(m.widthMm),
        height: px(m.heightMm),
        borderRadius: px(1),
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}
    >
      {showBand && (
        <div
          className="flex items-center justify-center bg-black font-bold text-white"
          style={{
            width: px(m.widthMm - EDGE_SAFE_MM),
            height: px(m.bandMm),
            fontSize: px(m.bandMm * 0.62),
          }}
        >
          {TEMP_TEXT[data.temp!]}
        </div>
      )}

      <div
        className="flex flex-col"
        style={{
          padding: px(m.marginMm),
          paddingTop: px(showBand ? m.gapMm : m.marginMm),
          // Match the roll: the print head can't reach the right edge, so hold the
          // content clear of it. Left/top/bottom keep the normal margin.
          paddingRight: px(m.marginMm + EDGE_SAFE_MM),
          height: showBand ? `calc(100% - ${px(m.bandMm)})` : '100%',
        }}
      >
        {showBrand && (
          // Mark and church name on one row with a hairline under it — matching the PDF,
          // which centres each against the taller of the two and rules a line beneath.
          <div
            className="flex items-center border-b border-black"
            style={{
              gap: px(m.gapMm * 1.5),
              paddingBottom: px(m.gapMm * 0.6),
              marginBottom: px(m.gapMm),
              minHeight: px(Math.max(settings.show_logo ? m.logoMm : 0, m.churchMm)),
            }}
          >
            {settings.show_logo && (
              /* An inline data URI sized in millimetres — next/image would only add a
                 loader and an optimiser that have nothing to do here. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={LOGO_DATA_URI}
                alt=""
                style={{ height: px(m.logoMm), width: px(m.logoMm * LOGO_ASPECT) }}
              />
            )}
            {settings.show_church_name && churchText && (
              <div
                className="min-w-0 flex-1 overflow-hidden whitespace-nowrap font-bold leading-none"
                style={{
                  fontSize: px(m.churchMm),
                  textOverflow: 'ellipsis',
                  textAlign: settings.show_logo ? 'left' : align,
                }}
              >
                {churchText}
              </div>
            )}
          </div>
        )}

        {showCounter && (
          <div
            className="text-right font-bold leading-none"
            style={{ fontSize: px(m.footerMm), marginBottom: px(m.gapMm) }}
          >
            CUP {data.cupIndex} OF {data.cupTotal}
          </div>
        )}

        <div
          className="overflow-hidden whitespace-nowrap font-bold leading-tight"
          style={{ fontSize: px(m.nameMm), textOverflow: 'ellipsis', textAlign: align }}
        >
          {settings.uppercase_name ? data.customerName.toUpperCase() : data.customerName}
        </div>

        <div
          className="overflow-hidden whitespace-nowrap font-bold leading-tight"
          style={{ fontSize: px(m.drinkMm), textOverflow: 'ellipsis', marginTop: px(m.gapMm * 0.5), textAlign: align }}
        >
          {settings.uppercase_drink ? data.drinkName.toUpperCase() : data.drinkName}
        </div>

        {showMods && (
          // One block per modifier category, each at its own size — matching the PDF. A
          // category with lots of options (e.g. every syrup) WRAPS onto more lines so all
          // of them stay visible, rather than being cut off at one line.
          <div style={{ marginTop: px(m.gapMm) }}>
            {modLines.map((l, i) => (
              <div
                key={i}
                className="leading-snug"
                style={{ fontSize: px(m.modifierMm * l.style.scale), textAlign: align, overflowWrap: 'break-word' }}
              >
                {l.text}
              </div>
            ))}
          </div>
        )}

        {/* The note sits under the modifiers and grows with its text; the order code / time
            is pinned to the bottom of the label. Matches the PDF, which fills the note down
            toward the footer and hugs the border to the text. The line clamp here is just a
            screen approximation — the roll is the final word. */}
        {showNote && (
          <div
            className="overflow-hidden border border-black font-bold"
            style={{
              fontSize: px(m.noteMm),
              lineHeight: 1.28,
              padding: `${px(m.gapMm * 0.5)} ${px(m.gapMm)}`,
              marginTop: px(m.gapMm),
              display: '-webkit-box',
              WebkitLineClamp: 6,
              WebkitBoxOrient: 'vertical',
            }}
          >
            ! {data.note}
          </div>
        )}

        {settings.show_footer && (
          <div className="mt-auto leading-none" style={{ fontSize: px(m.footerMm), paddingTop: px(m.gapMm) }}>
            #{data.orderCode} · {data.timeText}
          </div>
        )}
      </div>
    </div>
  );

  return label;
}
