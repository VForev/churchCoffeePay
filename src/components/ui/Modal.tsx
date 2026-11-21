'use client';

import { useEffect, useId, useRef } from 'react';
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
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/**
 * A bottom sheet on a phone, a centred dialog on anything wider.
 *
 * The sheet slides up from the bottom edge with a grab handle, because that's what a
 * phone user expects a "customise this" panel to be; on a tablet or desktop it's an
 * ordinary dialog. Escape and a tap on the dim background both close it.
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

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'flex max-h-[90dvh] w-full animate-sheet-up flex-col rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none sm:max-h-[85vh] sm:rounded-3xl',
          sizeStyles[size],
          className,
        )}
      >
        {/* Grab handle — phone only, and purely a visual cue that this is a sheet. */}
        <div aria-hidden className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-gray-300" />
        </div>

        {title && (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 pb-4 pt-3 sm:pt-5">
            <div className="min-w-0">
              <h2 id={titleId} className="font-heading text-xl font-bold leading-tight">
                {title}
              </h2>
              {subtitle && (
                <div className="mt-1 font-body text-sm text-text-light">{subtitle}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-text-light transition-colors hover:bg-gray-200 hover:text-text-dark"
            >
              <svg aria-hidden className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
