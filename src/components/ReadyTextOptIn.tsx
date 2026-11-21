'use client';

import { cn } from '@/lib/utils';
import { SMS_PROGRAM_NAME, SMS_TERMS_PATH } from '@/lib/sms';

/** Stable handle so a validation failure can scroll the box back into view. */
export const READY_TEXT_PHONE_ID = 'ready-text-phone';

interface Props {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  phone: string;
  onPhoneChange: (phone: string) => void;
  error?: string;
  /** Bigger touch targets and type for the counter tablet. */
  large?: boolean;
}

/**
 * "Text me when my order is ready" — one definition for /checkout and /tablet.
 *
 * The shape is what US carriers require before they'll approve the number (10DLC and
 * toll-free verification both check it), so don't "simplify" it:
 *   - the checkbox is separate from everything else and UNCHECKED by default;
 *   - the number is only asked for once they've ticked it;
 *   - the words name who's texting, how often, that rates may apply, how to stop and
 *     get help, and link to the public terms page.
 */
export default function ReadyTextOptIn({
  checked,
  onCheckedChange,
  phone,
  onPhoneChange,
  error,
  large,
}: Props) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className={cn('mt-0.5 shrink-0 cursor-pointer accent-primary', large ? 'h-6 w-6' : 'h-5 w-5')}
        />
        <span className={cn('font-heading font-bold text-text-dark', large ? 'text-lg' : 'text-base')}>
          Text me when my order is ready
          <span className="ml-1 font-body text-sm font-normal text-text-light">(optional)</span>
        </span>
      </label>

      {checked && (
        <div className="mt-3">
          <input
            id={READY_TEXT_PHONE_ID}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            value={phone}
            maxLength={20}
            onChange={(e) => onPhoneChange(e.target.value)}
            aria-label="Mobile number"
            className={cn(
              'w-full rounded-xl border bg-surface font-body text-text-dark placeholder:text-text-light',
              'focus:outline-none focus:ring-2 focus:ring-primary/30',
              large ? 'border-2 px-4 py-4 text-xl' : 'px-4 py-2.5',
              error ? 'border-danger' : 'border-gray-200 focus:border-primary',
            )}
          />
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        </div>
      )}

      <p className="mt-2 font-body text-xs leading-relaxed text-text-light">
        By ticking this box you agree to get one text from {SMS_PROGRAM_NAME} when this
        order is ready. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.
        We don&apos;t share your number and delete it once the text is sent.{' '}
        <a href={SMS_TERMS_PATH} target="_blank" rel="noopener" className="text-primary underline">
          Text message terms
        </a>
      </p>
    </div>
  );
}
