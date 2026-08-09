'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PUSHPAY_HANDLE,
  PUSHPAY_LINK,
  PUSHPAY_SCRIPT_SRC,
  PUSHPAY_WGC,
  pushpayLinkWithReturn,
} from '@/lib/giving';
import { cn } from '@/lib/utils';

/**
 * "Give to the church" — the Pushpay box shown after an order is placed and on the live
 * order screen, i.e. in the two moments someone is already standing there waiting.
 *
 * It tries the embedded widget first so nobody leaves the page, and falls back to a plain
 * Pushpay link if that script doesn't load. The fallback is not paranoia: church wifi and
 * strict mobile browsers block third-party scripts often enough that a giving box which
 * only works sometimes is worse than one that always shows a link.
 *
 * Either way, giving finishes back on /live — the embedded token carries that return URL,
 * and the link is built with one.
 *
 * Only ever render ONE of these per page: the Pushpay snippet addresses its container by
 * a fixed element id, so a second copy would fight the first for it.
 */

/** The id Pushpay's own snippet uses for its container. Not ours to rename. */
const CONTAINER_ID = 'pushpay-embedded-giving-fallback';
const SCRIPT_ID = 'pushpay-embedded-script';

/** How long to give the widget before deciding it isn't coming and showing the link. */
const EMBED_TIMEOUT_MS = 3500;

declare global {
  interface Window {
    pushpayEmbeddedConfig?: { handle: string; wgc: string };
  }
}

export default function GivingBox({
  title = 'Give to Light of the Gospel',
  message = 'Your coffee is on its way. If you’d like to give to the church while you wait, you can do it right here.',
  className,
}: {
  title?: string;
  message?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLink, setShowLink] = useState(false);
  // Built only when the fallback is actually needed: the return URL comes from the live
  // origin, which doesn't exist during the server render.
  const [link, setLink] = useState(PUSHPAY_LINK);

  useEffect(() => {
    window.pushpayEmbeddedConfig = { handle: PUSHPAY_HANDLE, wgc: PUSHPAY_WGC };

    function fallBackToLink() {
      setLink(pushpayLinkWithReturn(window.location.origin));
      setShowLink(true);
    }

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.type = 'text/javascript';
      script.async = true;
      script.src = PUSHPAY_SCRIPT_SRC;
      script.onerror = fallBackToLink;
      document.head.appendChild(script);
    }

    // The script can load and still render nothing (blocked frame, expired token), so
    // what's actually checked is whether anything appeared in the container — not
    // whether the script fired an onload.
    const timer = setTimeout(() => {
      if (!containerRef.current?.childElementCount) fallBackToLink();
    }, EMBED_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-primary/20 bg-primary/5 px-5 py-5 text-center',
        className,
      )}
    >
      <p className="mb-1 text-3xl leading-none">&#10084;&#65039;</p>
      <h3 className="font-heading text-lg font-bold text-text-dark">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm font-body text-sm text-text-light">{message}</p>

      {/* Pushpay renders into this. Empty until (unless) the widget arrives. */}
      <div id={CONTAINER_ID} ref={containerRef} className="mt-4" />

      {showLink && (
        <a
          href={link}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-accent text-sm font-bold text-white transition-colors hover:bg-primary-light"
        >
          Give with Pushpay
        </a>
      )}

      <p className="mt-3 font-body text-xs text-text-light">
        Secure giving through Pushpay · you&apos;ll come back here when you&apos;re done
      </p>
    </div>
  );
}
