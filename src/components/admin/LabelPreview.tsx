'use client';

import {
  labelMetrics,
  effectiveRotate,
  TEMP_TEXT,
  EDGE_SAFE_MM,
  type LabelSettings,
  type LabelData,
} from '@/lib/labels';

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
  // in the PDF, not something the held label shows, so the preview never spins. `rotate`
  // only decides whether the note/footer fill to the bottom (wide rolls) or pack to the
  // top (tall rolls, whose bottom edge the print head can't reach).
  const rotate = effectiveRotate(settings);
  const m = labelMetrics(settings);
  const showBand = settings.show_temp_band && data.temp !== null;
  const showCounter = settings.show_cup_counter && data.cupTotal > 1;
  const showMods = settings.show_modifiers && data.modifiers.length > 0;
  const showNote = settings.show_note && Boolean(data.note);
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
          <div
            className="overflow-hidden leading-snug"
            style={{
              fontSize: px(m.modifierMm),
              marginTop: px(m.gapMm),
              maxHeight: px(m.modifierMm * 4.4),
              textAlign: align,
            }}
          >
            {data.modifiers.join(', ')}
          </div>
        )}

        {/* Note and footer, matching the PDF's orientation-aware placement:
            upright labels flow them under the modifiers (the bottom edge is out of the
            print head's reach), while rotated labels pin them to the bottom to fill the
            whole label instead of leaving an unused strip down the side. */}
        <div className={rotate ? 'mt-auto' : ''} style={{ marginTop: rotate ? undefined : px(m.gapMm) }}>
          {showNote && (
            <div
              className="overflow-hidden whitespace-nowrap border border-black font-bold"
              style={{
                fontSize: px(m.modifierMm),
                padding: `${px(m.gapMm * 0.5)} ${px(m.gapMm)}`,
                marginBottom: px(m.gapMm),
                textOverflow: 'ellipsis',
              }}
            >
              ! {data.note}
            </div>
          )}

          {settings.show_footer && (
            <div className="leading-none" style={{ fontSize: px(m.footerMm) }}>
              #{data.orderCode} · {data.timeText}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return label;
}
