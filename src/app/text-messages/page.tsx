import type { Metadata } from 'next';
import { SMS_PROGRAM_NAME } from '@/lib/sms';

export const metadata: Metadata = {
  title: 'Text Message Terms — LOTG Coffee',
};

/**
 * Public terms + privacy for the "your order is ready" text.
 *
 * Telnyx (and the carriers behind it) require a public link describing how people opt in
 * before they'll approve the sending number. This page is that link — give its full URL
 * (https://<your-domain>/text-messages) in the toll-free verification or 10DLC campaign
 * form. If anything here stops being true, change the code or change the page.
 */
export default function TextMessageTermsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto max-w-xl space-y-6 px-4 py-10 font-body text-text">
        <h1 className="font-heading text-2xl font-bold text-text-dark">
          {SMS_PROGRAM_NAME} — Text Message Terms
        </h1>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-bold text-text-dark">What you&apos;ll get</h2>
          <p>
            {SMS_PROGRAM_NAME} is the coffee bar at Light of the Gospel Church. When you order
            a drink, you can enter your mobile number in the optional{' '}
            <strong>&ldquo;Text me when it&apos;s ready&rdquo;</strong> box. We send you <strong>one text message</strong> when your order
            is ready to pick up. That&apos;s all.
          </p>
          <p>
            No marketing, no reminders, no follow-ups. Each order is its own opt-in: if you
            leave the box blank, you don&apos;t get a text.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-bold text-text-dark">How to opt in</h2>
          <p>
            On the order page (or at the counter, where the barista asks you), type your
            mobile number into the box labelled &ldquo;Text me when it&apos;s ready (optional)&rdquo;.
            The text beside the box explains what you&apos;re agreeing to. The box starts empty,
            and you can order without filling it in.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-bold text-text-dark">Stopping and help</h2>
          <p>
            Reply <strong>STOP</strong> to any message to stop all texts from us. Reply{' '}
            <strong>HELP</strong> for help, or ask anyone at the coffee bar.
          </p>
          <p>Message frequency: one message per order you opt in on. Message and data rates may apply.</p>
          <p>Carriers are not liable for delayed or undelivered messages.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-bold text-text-dark">Your number</h2>
          <p>
            We use your number only to send that one text. It is stored separately from the
            order, is not visible on the public order board, and is deleted as soon as the text
            has been sent. We never sell, rent or share mobile numbers or text-message opt-in
            consent with anyone for their marketing purposes.
          </p>
        </section>

        <p className="text-sm text-text-light">
          Light of the Gospel Church &middot;{' '}
          <a href="https://www.lotgchurch.com/" className="text-primary underline">
            lotgchurch.com
          </a>
        </p>
      </main>
    </div>
  );
}
