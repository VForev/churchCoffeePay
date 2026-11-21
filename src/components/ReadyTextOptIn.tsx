'use client';

import { cn } from '@/lib/utils';
import { SMS_PROGRAM_NAME, SMS_TERMS_PATH } from '@/lib/sms';

/** Stable handle so a validation failure can scroll the box back into view. */
export const READY_TEXT_PHONE_ID = 'ready-text-phone';

interface Props {
  phone: string;
  onPhoneChange: (phone: string) => void;
  error?: string;
  /** Bigger touch targets and type for the counter tablet. */
  large?: boolean;
}

/**
 * "Text me when it's ready" — one definition for /checkout and /tablet.
 *
 * The phone box is shown straight away and is the opt-in: typing a number means "text
 * me", leaving it blank means no text. It is OPTIONAL on purpose — US carriers (Telnyx's
 * toll-free verification and 10DLC review) refuse forms that force consent to texts, and
 * a required number would also stop someone without a phone from buying a coffee.
 *
 * The small print is also a carrier requirement: who's texting, how often, that rates may
 * apply, STOP/HELP, and a link to the public terms page. Change it together with
 * /text-messages, or the sending number can be suspended.
 */
export default function ReadyTextOptIn({ phone, onPhoneChange, error, large }: Props) {
  return (
    <div>
      <label
        htmlFor={READY_TEXT_PHONE_ID}
        className={cn('block font-heading font-bold text-text-dark', large ? 'text-lg' : 'text-base')}
      >
        📱 Text me when it&apos;s ready
        <span className="ml-1 font-body text-sm font-normal text-text-light">(optional)</span>
      </label>
      <p className={cn('mb-2 font-body text-text-light', large ? 'text-sm' : 'text-xs')}>
        Your mobile number — we&apos;ll send one text when your order is ready to pick up.
      </p>

      <input
        id={READY_TEXT_PHONE_ID}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(555) 123-4567"
        value={phone}
        maxLength={20}
        onChange={(e) => onPhoneChange(e.target.value)}
        className={cn(
          'w-full rounded-xl border bg-surface font-body text-text-dark placeholder:text-text-light',
          'focus:outline-none focus:ring-2 focus:ring-primary/30',
          large ? 'border-2 px-4 py-4 text-xl' : 'px-4 py-2.5',
          error ? 'border-danger' : 'border-gray-200 focus:border-primary',
        )}
      />
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}

      <p className="mt-2 font-body text-xs leading-relaxed text-text-light">
        By entering your number you agree to get one text from {SMS_PROGRAM_NAME} when this
        order is ready. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.
        We don&apos;t share your number and delete it once the text is sent.{' '}
        <a href={SMS_TERMS_PATH} target="_blank" rel="noopener" className="text-primary underline">
          Text message terms
        </a>
      </p>
    </div>
  );
}
