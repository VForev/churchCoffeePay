'use client';

import {
  labelMetrics,
  TEMP_TEXT,
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
  const m = labelMetrics(settings);
  const showBand = settings.show_temp_band && data.temp !== null;
  const showCounter = settings.show_cup_counter && data.cupTotal > 1;
  const showMods = settings.show_modifiers && data.modifiers.length > 0;
  const showNote = settings.show_note && Boolean(data.note);

  return (
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
          className="flex w-full items-center justify-center bg-black font-bold text-white"
          style={{ height: px(m.bandMm), fontSize: px(m.bandMm * 0.62) }}
        >
          {TEMP_TEXT[data.temp!]}
        </div>
      )}

      <div
        className="flex flex-col"
        style={{
          padding: px(m.marginMm),
          paddingTop: px(showBand ? m.gapMm : m.marginMm),
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
          style={{ fontSize: px(m.nameMm), textOverflow: 'ellipsis' }}
        >
          {settings.uppercase_name ? data.customerName.toUpperCase() : data.customerName}
        </div>

        <div
          className="overflow-hidden whitespace-nowrap font-bold leading-tight"
          style={{ fontSize: px(m.drinkMm), textOverflow: 'ellipsis', marginTop: px(m.gapMm * 0.5) }}
        >
          {data.drinkName}
        </div>

        {showMods && (
          <div
            className="overflow-hidden leading-snug"
            style={{ fontSize: px(m.modifierMm), marginTop: px(m.gapMm) }}
          >
            {data.modifiers.join(', ')}
          </div>
        )}

        {/* Note and footer are pinned to the bottom — same as the PDF, where their
            space is reserved before the modifiers are allowed to fill anything. */}
        <div className="mt-auto" style={{ paddingTop: px(m.gapMm) }}>
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
}
