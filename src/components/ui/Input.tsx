'use client';

import { cn } from '@/lib/utils';

/**
 * iOS text fields sit in a filled well, not an outlined box. The fill already
 * separates the field from the card behind it, so a border on top of it is
 * redundant weight — the accent ring on focus is the only stroke used, and
 * only while focused.
 */
const fieldBase = cn(
  'w-full px-4 py-3 rounded-[var(--r-md)]',
  'bg-fill-tertiary text-label placeholder:text-label-tertiary',
  'font-body text-[17px] tracking-[-0.011em]',
  'border border-transparent',
  'focus:outline-none focus:border-primary focus:bg-transparent',
  'focus:ring-[3px] focus:ring-primary/20',
  'transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out-ios)]',
  'disabled:opacity-40',
);

const labelBase = 'block text-ios-footnote font-medium text-label-secondary mb-1.5 px-1';
const errorBase = 'mt-1.5 px-1 text-ios-footnote text-danger';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className={labelBase}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          fieldBase,
          error && 'border-danger focus:border-danger focus:ring-danger/20',
          className,
        )}
        {...props}
      />
      {error && <p className={errorBase}>{error}</p>}
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function TextArea({ label, error, className, id, ...props }: TextAreaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className={labelBase}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          fieldBase,
          'resize-none',
          error && 'border-danger focus:border-danger focus:ring-danger/20',
          className,
        )}
        {...props}
      />
      {error && <p className={errorBase}>{error}</p>}
    </div>
  );
}
