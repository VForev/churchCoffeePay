'use client';

import { cn } from '@/lib/utils';

/**
 * The iOS filled field: a soft grey well with no hard edge, which lifts to the card colour
 * with a halo when focused. 16px text on purpose — anything smaller makes iOS Safari zoom
 * the page in on tap and never zoom back out.
 */
const FIELD = cn(
  'w-full min-h-11 rounded-xl border border-transparent bg-gray-100 px-4 py-2.5',
  'font-body text-base text-text-dark placeholder:text-text-light',
  'transition-[background-color,border-color,box-shadow] duration-200',
  'hover:bg-gray-200/70',
  'focus:outline-none focus:border-primary/60 focus:bg-surface focus:ring-4 focus:ring-primary/15',
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block px-1 font-accent text-[13px] font-semibold text-text">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          FIELD,
          error && 'border-danger/70 bg-danger/5 focus:ring-danger/15 focus:border-danger',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1.5 animate-rise px-1 text-[13px] font-medium text-danger">{error}</p>}
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
        <label htmlFor={inputId} className="mb-1.5 block px-1 font-accent text-[13px] font-semibold text-text">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          FIELD,
          'resize-none',
          error && 'border-danger/70 bg-danger/5 focus:ring-danger/15 focus:border-danger',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1.5 animate-rise px-1 text-[13px] font-medium text-danger">{error}</p>}
    </div>
  );
}
