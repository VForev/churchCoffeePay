'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** A line under the title — e.g. a drink's description. */
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
};

/** Long enough for the slowest exit animation in globals.css (sheet-down, 260ms). */
const EXIT_MS = 270;
/** How far the sheet has to be pulled down before letting go closes it. */
const DISMISS_PX = 110;
/** …or how fast, in px/ms — a quick flick closes it from anywhere. */
const DISMISS_VELOCITY = 0.55;

interface Shown {
  title?: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * A bottom sheet on a phone, a centred dialog on anything wider — and it leaves the way
 * it arrived.
 *
 * Three things make it feel native rather than like a web popup:
 *
 *  - **It animates out.** Closing used to unmount on the spot. Now it stays on screen
 *    for one exit animation, showing what it showed while open: a parent that clears
 *    its data on close (`isOpen={!!editing}` with `{editing && …}` inside) would
 *    otherwise empty the sheet halfway down. For the exit to play at all the parent has
 *    to keep the Modal mounted and flip `isOpen`; one that unmounts it just loses the
 *    animation, nothing else.
 *  - **The handle drags.** On a phone the grab handle and title bar follow the finger
 *    down; let go far enough (or flick) and it closes, otherwise it springs back. Only
 *    that strip drags, so it never fights the scrolling list of options under it.
 *  - **Glass behind it.** The page dims and blurs rather than going flat grey.
 *
 * Escape and a tap on the dim background both close it.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
  size = 'md',
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Kept in a ref so the key listener below never re-binds when a parent passes a new
  // inline arrow on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // ── Mounted vs open ──────────────────────────────────────────────────────
  // `mounted` outlives `isOpen` by one exit animation. Adjusted during render (React's
  // "state from props" pattern), so opening paints on the same frame as the tap.
  const [mounted, setMounted] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  if (isOpen && (!mounted || closing)) {
    setMounted(true);
    setClosing(false);
  } else if (!isOpen && mounted && !closing) {
    setClosing(true);
  }

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [closing]);

  // What was on screen while open — shown during the exit instead of whatever the parent
  // renders once it has "closed".
  const [shown, setShown] = useState<Shown>({ title, subtitle, children, footer });
  if (
    isOpen &&
    (shown.title !== title ||
      shown.subtitle !== subtitle ||
      shown.children !== children ||
      shown.footer !== footer)
  ) {
    setShown({ title, subtitle, children, footer });
  }
  const view: Shown = isOpen ? { title, subtitle, children, footer } : shown;

  // ── Drag to dismiss (phone only) ─────────────────────────────────────────
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; v: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    // The centred desktop dialog doesn't drag; nor does a mouse, which has a close button.
    if (e.pointerType === 'mouse' || window.matchMedia('(min-width: 640px)').matches) return;
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const dy = e.clientY - d.startY;
    // Pulling up past the top meets resistance rather than detaching the sheet.
    setDragY(dy >= 0 ? dy : dy / 6);
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (dragY > DISMISS_PX || d.v > DISMISS_VELOCITY) {
      // Leave dragY where it is: the exit animation starts from the finger's position
      // (it reads --sheet-drag), so the sheet carries on down instead of jumping back.
      onCloseRef.current();
    } else {
      setDragY(0);
    }
  }

  // A fresh open always starts from the top.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setDragY(0);
  }

  // ── Focus, scroll lock, Escape ───────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Remember what had focus, move it into the dialog, and hand it back on close —
    // otherwise a keyboard user is left stranded at the top of the page.
    const returnTo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', handleKey);
      returnTo?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 backdrop-blur-[6px] sm:items-center sm:p-4',
        closing ? 'pointer-events-none animate-fade-out' : 'animate-fade-in',
      )}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={view.title ? titleId : undefined}
        tabIndex={-1}
        style={
          {
            '--sheet-drag': `${dragY}px`,
            transform: !closing && dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragging ? 'none' : undefined,
          } as React.CSSProperties
        }
        className={cn(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none sm:max-h-[85vh] sm:rounded-3xl',
          // Phone: slides from the bottom edge. Wider: a dialog that scales up into place.
          closing
            ? 'animate-sheet-down sm:animate-dialog-out'
            : 'animate-sheet-up sm:animate-dialog-in',
          // Springing back from a short drag.
          !dragging && 'transition-transform duration-500 ease-ios',
          sizeStyles[size],
          className,
        )}
      >
        <div
          // The draggable strip: handle + title. touch-none so the browser hands the
          // gesture to us instead of trying to scroll the page behind.
          className="shrink-0 touch-none select-none sm:touch-auto sm:select-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Grab handle — phone only. */}
          <div aria-hidden className="flex justify-center pb-1 pt-2 sm:hidden">
            <span className="h-[5px] w-9 rounded-full bg-gray-300" />
          </div>

          {view.title && (
            <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-2 sm:pt-5">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="font-heading text-[1.375rem] font-bold leading-tight tracking-[-0.02em]"
                >
                  {view.title}
                </h2>
                {view.subtitle && (
                  <div className="mt-1 font-body text-[15px] leading-snug text-text-light">
                    {view.subtitle}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-text-light transition-[background-color,color,transform] duration-200 hover:bg-gray-200 hover:text-text-dark active:scale-90"
              >
                <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">{view.children}</div>
        {view.footer && <div className="shrink-0">{view.footer}</div>}
      </div>
    </div>
  );
}
