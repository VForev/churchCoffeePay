'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { alertPop, scrim, sheetUp, shouldDismiss, springSheet } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
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

/**
 * Presents as an iPhone sheet on phones and a centered alert on wide screens.
 *
 * The two presentations are genuinely different motions — a sheet rises from
 * the bottom edge and can be thrown back down, an alert scales up in place —
 * so the breakpoint is resolved in JS rather than faked with CSS. It's only
 * read once the modal opens, which is always after hydration, so there is no
 * server/client mismatch to worry about.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  size = 'md',
}: ModalProps) {
  const dragControls = useDragControls();
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    // AnimatePresence has to sit outside the conditional, or the sheet would
    // vanish on close instead of sliding back down.
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            variants={scrim}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
          />

          <motion.div
            variants={isWide ? alertPop : sheetUp}
            initial="hidden"
            animate="show"
            exit="exit"
            // Drag is armed but not listening: only the grabber starts it, so
            // a flick inside scrollable content scrolls instead of dismissing.
            drag={isWide ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (shouldDismiss(info.offset.y, info.velocity.y)) onClose();
            }}
            transition={springSheet}
            className={cn(
              'relative flex w-full max-h-[92vh] flex-col',
              'bg-plain shadow-[var(--shadow-sheet)]',
              // 38px top corners on phones matches the iPhone display radius,
              // which is what makes a sheet look inset into the device.
              'rounded-t-[var(--r-sheet)] sm:rounded-[var(--r-xl)]',
              'sm:max-h-[85vh] pb-safe',
              sizeStyles[size],
              className,
            )}
          >
            {/* Grabber — also the drag surface. iOS shows this on every
                sheet you're allowed to pull down, so it doubles as the hint
                that dragging works. Hidden on desktop, where drag is off. */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="shrink-0 cursor-grab touch-none pt-2.5 pb-1 active:cursor-grabbing sm:hidden"
            >
              <div className="mx-auto h-[5px] w-9 rounded-full bg-label-quaternary" />
            </div>

            {title && (
              <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5 hairline-b">
                <h2 className="text-ios-headline truncate text-label">{title}</h2>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fill-secondary text-label-secondary"
                >
                  {/* SF Symbols' xmark, drawn rather than typed — the ✕
                      glyph sits off-center and changes width by platform. */}
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                    <path
                      d="M5 5l10 10M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.button>
              </div>
            )}

            <div className="scroll-ios flex-1 overflow-y-auto p-5">{children}</div>

            {footer && <div className="shrink-0">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
