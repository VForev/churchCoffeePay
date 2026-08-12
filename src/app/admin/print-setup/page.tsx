'use client';

import { useEffect, useState } from 'react';
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
  // What the shop PC *should* be running. The launcher prints the same stamp in its
  // window, so "did that machine actually get my change?" stops being guesswork.
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch('/print-agent-version.txt')
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => setCurrentVersion(text?.trim() || null))
      .catch(() => setCurrentVersion(null));
  }, []);

  // The startup file needs your site's /live address. We bake it in on download so
  // there's nothing to edit — grab the template and swap the placeholder for this origin.
  async function downloadStartupFile() {
    try {
      const res = await fetch('/LOTG-Startup.bat');
      const template = await res.text();
      const text = template.replace(
        'https://YOUR-SITE.netlify.app/live',
        `${window.location.origin}/live`,
      );
      const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'LOTG-Startup.bat';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fall back to the plain file (with the placeholder URL to edit) if fetch fails.
      window.location.href = '/LOTG-Startup.bat';
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-ios-largetitle text-label">Set Up the Cup Printer</h1>
        <p className="mt-1 text-ios-subhead text-label-secondary">
          A one-time setup on the shop computer — about 10 minutes. Do these in order.
          After this, one double-click starts the printer (and pulls the latest version
          automatically), and labels print by themselves whenever an order comes in.
        </p>
      </div>

      {/* Downloads */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <h2 className="text-ios-title3 text-label">Download the files</h2>
        <p className="mt-0.5 text-ios-subhead text-label-secondary">
          Save both onto the <strong>Windows computer</strong> the printer is plugged into — put
          them in the <strong>same folder</strong>.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col rounded-xl border border-primary/20 bg-surface p-4">
            <h3 className="text-ios-headline text-label">1. The launcher</h3>
            <p className="mt-1 flex-1 text-ios-caption text-label-secondary">
              Downloads the latest printer software and starts printing. Double-click it each
              service morning. <strong>Required.</strong>
            </p>
            <a
              href="/LOTG-Printer.bat"
              download
              className="mt-3 cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-center font-accent text-sm font-bold text-white transition-colors hover:bg-primary-light"
            >
              ↓ LOTG-Printer.bat
            </a>
          </div>

          <div className="flex flex-col rounded-xl border border-primary/20 bg-surface p-4">
            <h3 className="text-ios-headline text-label">2. Start at boot</h3>
            <p className="mt-1 flex-1 text-ios-caption text-label-secondary">
              Put this in the Startup folder and the PC auto-starts the printer and opens the live
              screen full-screen. Already set to your site — nothing to edit. <em>Optional.</em>
            </p>
            <button
              onClick={downloadStartupFile}
              className="mt-3 cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-center font-accent text-sm font-bold text-white transition-colors hover:bg-primary-light"
            >
              ↓ LOTG-Startup.bat
            </button>
          </div>
        </div>

        {currentVersion && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-surface px-4 py-3">
            <p className="text-sm text-text">
              Current printer software version:{' '}
              <strong className="font-mono text-text-dark">{currentVersion}</strong>
            </p>
            <p className="mt-1 text-ios-caption text-label-secondary">
              The shop PC prints its own version in the black window when it starts. If the two
              don&apos;t match, that PC didn&apos;t get the latest update — close the window and
              double-click <strong>LOTG-Printer.bat</strong> again. This is the first thing to check
              when a label change hasn&apos;t reached the roll.
            </p>
          </div>
        )}

        <p className="mt-3 text-ios-caption text-label-secondary">
          When you first open either one, Windows may say{' '}
          <em>&ldquo;Windows protected your PC&rdquo;</em> — click{' '}
          <strong>More info → Run anyway</strong>. That warning shows for any downloaded file; these
          only run the printer software.
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

      <Step n={2} title="Put the launcher in its own folder">
        <p>
          Make a new, empty folder somewhere easy to find — for example{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">C:\LOTG-Printer</code> — and
          move the downloaded{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">LOTG-Printer.bat</code> into
          it. When it runs, it downloads the rest of the software right next to itself, so give it a
          home of its own.
        </p>
      </Step>

      <Step n={3} title="Double-click the launcher">
        <p>
          Double-click{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">LOTG-Printer.bat</code>. The
          first time, it does the whole setup for you:
        </p>
        <ul className="ml-5 mt-2 list-disc space-y-1 font-body text-sm text-text">
          <li>downloads the latest printer software,</li>
          <li>
            installs Node.js if it isn&apos;t already there (you may see a Windows permission prompt
            — say yes),
          </li>
          <li>then opens a settings file for you to fill in (next step).</li>
        </ul>
        <p className="mt-2 text-text-light">
          If it installs Node.js, it&apos;ll ask you to close the window and double-click the
          launcher once more — that&apos;s normal, just do it.
        </p>
      </Step>

      <Step n={4} title="Fill in the settings file (the one thing it can't make for you)">
        <p>
          When Notepad opens the{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">.env</code> file, replace
          everything in it with the box below — it&apos;s already filled in for your shop — then{' '}
          <strong>Save</strong> and close Notepad. This is the one file the launcher can&apos;t
          create for you, because it holds your connection details.
        </p>
        <CopyBox text={ENV_TEXT} />
        <p className="mt-2 text-text-light">
          The launcher already put this file in the right place for you (the{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">print-agent</code> folder next
          to the launcher). You only need to fill it in and save.
        </p>
        <p className="mt-2 text-text-light">
          Leave{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">PRINTER_NAME</code> blank to
          use the computer&apos;s default printer, or put the printer&apos;s exact name (Windows
          Settings → Printers) after it.
        </p>
      </Step>

      <Step n={5} title="Double-click it again to start printing">
        <p>
          Double-click{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">LOTG-Printer.bat</code> once
          more. This time it shows <em>&ldquo;Listening for orders.&rdquo;</em> Leave that window
          open — every order that comes in now prints its cup labels automatically. From now on,
          this single double-click is the whole routine, and it quietly grabs the latest version
          each time.
        </p>
        <p className="mt-3 rounded-xl bg-bg px-4 py-3 text-text-light">
          <strong className="text-text-dark">Want it fully automatic when the PC turns on?</strong>{' '}
          Use the <strong>Start at boot</strong> file above (
          <code className="rounded bg-surface px-1.5 py-0.5 text-text-dark">LOTG-Startup.bat</code>).
          Press <code className="rounded bg-surface px-1.5 py-0.5 text-text-dark">Win + R</code>,
          type <code className="rounded bg-surface px-1.5 py-0.5 text-text-dark">shell:startup</code>,
          and drop it into the folder that opens. From then on the PC starts the printer{' '}
          <em>and</em> opens the live orders screen full-screen by itself — nobody has to touch it.
        </p>
      </Step>

      <Step n={6} title="Set your label size and test it" last>
        <p>
          With the printer window running, go to{' '}
          <InternalLink href="/admin/labels">Cup Labels</InternalLink> in this admin panel. Measure
          your label sticker (not the backing paper), type in its width and height, and check the
          preview. Press <strong>Save layout</strong>, then <strong>Send test label</strong> — a
          real label should come out of the printer. If it runs off the edges, adjust the size and
          test again. Finally, place a real order on your phone and watch a label print.
        </p>
      </Step>

      <Card className="mt-6">
        <h2 className="mb-2 text-ios-headline text-label">If something goes wrong</h2>
        <ul className="space-y-2 font-body text-sm text-text">
          <li>
            <strong>Nothing prints.</strong> Is the launcher window still open and showing
            &ldquo;Listening for orders&rdquo;? Is the PC awake? To test without waiting for an
            order, use <strong>Send test label</strong> on the{' '}
            <InternalLink href="/admin/labels">Cup Labels</InternalLink> page.
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

      <Card className="mt-6">
        <h2 className="mb-2 text-ios-headline text-label">Prefer to set it up by hand?</h2>
        <p className="text-sm text-text">
          You can skip the launcher and run the software yourself:{' '}
          <a
            href="/print-agent.zip"
            download
            className="font-semibold text-primary underline hover:text-primary-light"
          >
            download the zip
          </a>{' '}
          (or{' '}
          <a
            href="https://github.com/VForev/churchCoffeePay/raw/main/public/print-agent.zip"
            className="font-semibold text-primary underline hover:text-primary-light"
          >
            from GitHub
          </a>
          ), unzip it, and follow the steps in its{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text-dark">README.md</code>. The{' '}
          launcher above just automates exactly those steps.
        </p>
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
        <h2 className="mb-2 text-ios-title3 text-label">{title}</h2>
        <div className="space-y-1 font-body text-sm leading-relaxed text-text">{children}</div>
      </div>
    </div>
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
