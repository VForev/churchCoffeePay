'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/**
 * One-time setup guide for the cup-label printer, aimed at whoever sets up the shop
 * PC — not a developer. It hands them the exact files (a generated zip) and the exact
 * steps, and prefills the .env with the values it can (the two are public NEXT_PUBLIC_*
 * keys, and this page is behind the admin login regardless).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const ENV_TEXT = `NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# Leave blank to use the Windows default printer.
PRINTER_NAME=`;

export default function PrintSetupPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text-dark">Set Up the Cup Printer</h1>
        <p className="mt-1 font-body text-sm text-text-light">
          A one-time setup on the shop computer — about 15 minutes. Do these in order.
          After this, labels print by themselves whenever an order comes in.
        </p>
      </div>

      {/* Download */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-text-dark">Printer software</h2>
            <p className="mt-0.5 font-body text-sm text-text-light">
              The small program that runs on the shop PC and sends labels to the printer.
            </p>
          </div>
          <a
            href="/print-agent.zip"
            download
            className="shrink-0 cursor-pointer rounded-xl bg-primary px-6 py-3 font-accent font-bold text-white transition-colors hover:bg-primary-light"
          >
            ↓ Download printer software
          </a>
        </div>
        <p className="mt-3 font-body text-xs text-text-light">
          Do this <strong>on the Windows computer</strong> that the printer is plugged into —
          that&apos;s where everything below happens. You can also{' '}
          <a
            href="https://github.com/VForev/churchCoffeePay/raw/main/public/print-agent.zip"
            className="font-semibold text-primary underline hover:text-primary-light"
          >
            download it from GitHub
          </a>
          .
        </p>
      </Card>

      <Step n={1} title="Turn on the database (once)">
        <p>
          Open the{' '}
          <ExternalLink href="https://supabase.com/dashboard/project/errkudkpnrjzyjboemwy/sql">
            Supabase SQL Editor
          </ExternalLink>{' '}
          and run these two files from the project, one at a time. They add the bits of the
          database the printer needs. Nothing happens to your existing orders.
        </p>
        <ul className="ml-5 mt-2 list-disc space-y-1 font-body text-sm text-text">
          <li>
            <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">
              supabase-label-printing.sql
            </code>
          </li>
          <li>
            <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">
              supabase-label-settings.sql
            </code>
          </li>
        </ul>
        <p className="mt-2 text-text-light">
          If you&apos;ve already run these, skip this step — running them again is harmless.
        </p>
      </Step>

      <Step n={2} title="Install Node.js on the shop PC">
        <p>
          Download the <strong>LTS</strong> version from{' '}
          <ExternalLink href="https://nodejs.org">nodejs.org</ExternalLink> and install it —
          click through the default options. This is what runs the printer software. You only
          do this once per computer.
        </p>
      </Step>

      <Step n={3} title="Unzip the download">
        <p>
          Find <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">print-agent.zip</code>{' '}
          in your Downloads, right-click it, and choose{' '}
          <strong>Extract All</strong>. Remember where it lands — you&apos;ll open the{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">print-agent</code> folder
          inside it next.
        </p>
        <p className="mt-2 text-text-light">
          Keep the two folders that come out (<code className="text-text-dark">print-agent</code>{' '}
          and <code className="text-text-dark">src</code>) together — the printer software reads
          from both.
        </p>
      </Step>

      <Step n={4} title="Open a command window in that folder">
        <p>
          Open the <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">print-agent</code>{' '}
          folder. Click the address bar at the top of the window, type{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">cmd</code>, and press Enter.
          A black command window opens. Type this and press Enter:
        </p>
        <CodeBlock>npm install</CodeBlock>
        <p className="mt-2 text-text-light">
          It downloads what the software needs and takes a minute. Do this once.
        </p>
      </Step>

      <Step n={5} title="Add your connection details">
        <p>
          In the <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">print-agent</code>{' '}
          folder, find the file called{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">.env.example</code>, make a
          copy of it, and rename the copy to exactly{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">.env</code> (no
          &ldquo;.example&rdquo;). Open it in Notepad and replace everything with this — it&apos;s
          already filled in for your shop:
        </p>
        <CopyBox text={ENV_TEXT} />
        <p className="mt-2 text-text-light">
          If the printer isn&apos;t your computer&apos;s default printer, put its exact name (from
          Windows Settings → Printers) after{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">PRINTER_NAME=</code>.
        </p>
      </Step>

      <Step n={6} title="Set your label size and test it">
        <p>
          Go to <InternalLink href="/admin/labels">Cup Labels</InternalLink> in this admin panel.
          Measure your label sticker (not the backing paper), type in its width and height, and
          check the preview. Press <strong>Save layout</strong>, then{' '}
          <strong>Send test label</strong> — a real label should come out of the printer. If it
          runs off the edges, adjust the size and test again.
        </p>
      </Step>

      <Step n={7} title="Start it for service" last>
        <p>Back in the black command window, type this and press Enter:</p>
        <CodeBlock>npm start</CodeBlock>
        <p className="mt-2">
          You&apos;ll see <em>&ldquo;Listening for orders.&rdquo;</em> Leave the window open —
          every order that comes in now prints its cup labels automatically. To make sure it
          works, place a real order on your phone and watch a label print.
        </p>
        <p className="mt-3 rounded-xl bg-bg px-4 py-3 text-text-light">
          <strong className="text-text-dark">Want it to start by itself?</strong> The folder has a{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 text-text-dark">start-printer.bat</code>{' '}
          file and a one-line instruction (in its{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 text-text-dark">README.md</code>) for
          launching it automatically when the PC turns on, so nobody has to remember.
        </p>
      </Step>

      <Card className="mt-6">
        <h2 className="mb-2 font-heading font-bold text-text-dark">If something goes wrong</h2>
        <ul className="space-y-2 font-body text-sm text-text">
          <li>
            <strong>Nothing prints.</strong> Is the command window still open and showing
            &ldquo;Listening for orders&rdquo;? Is the PC awake? Try{' '}
            <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">npm run test-label</code>{' '}
            in that window to print a test without needing an order.
          </li>
          <li>
            <strong>The label is the wrong size.</strong> Fix it on the{' '}
            <InternalLink href="/admin/labels">Cup Labels</InternalLink> page — measure the
            sticker again, save, and send a test label. Changes reach the printer instantly.
          </li>
          <li>
            <strong>Every order card shows an amber &ldquo;Print labels&rdquo; button.</strong>{' '}
            That means orders aren&apos;t printing — the shop PC or the command window is probably
            off.
          </li>
        </ul>
      </Card>
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Step({
  n,
  title,
  children,
  last,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      {/* Number + connecting line */}
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-heading font-bold text-white">
          {n}
        </div>
        {!last && <div className="w-0.5 flex-1 bg-gray-200" />}
      </div>
      <div className={cn('min-w-0 flex-1', last ? 'pb-2' : 'pb-6')}>
        <h2 className="mb-2 font-heading text-lg font-bold text-text-dark">{title}</h2>
        <div className="space-y-1 font-body text-sm leading-relaxed text-text">{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-xl bg-text-dark px-4 py-3 font-accent text-sm text-white">
      {children}
    </pre>
  );
}

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-200 bg-bg px-3 py-1.5">
        <span className="font-accent text-xs font-semibold text-text-light">.env</span>
        <button
          onClick={copy}
          className="cursor-pointer rounded-md px-2 py-1 font-accent text-xs font-semibold text-primary hover:bg-primary/10"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-surface px-4 py-3 font-accent text-xs text-text-dark">
        {text}
      </pre>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-primary underline hover:text-primary-light"
    >
      {children}
    </a>
  );
}

function InternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="font-semibold text-primary underline hover:text-primary-light">
      {children}
    </a>
  );
}
