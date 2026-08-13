'use client';

import { MotionConfig } from 'motion/react';

/**
 * App-wide motion policy.
 *
 * The `prefers-reduced-motion` block in globals.css only reaches CSS
 * animations and transitions. Framer's springs are driven in JavaScript and
 * write transforms straight to the element, so they sail straight past it —
 * meaning that without this the accessibility setting was half-honoured: the
 * CSS parts of the app went still while every sheet and card kept moving.
 *
 * `reducedMotion="user"` hands the decision to the OS. When it's on, Framer
 * drops transform and layout animation but keeps opacity, so the interface
 * still cross-fades and nothing becomes invisible or unreachable — the failure
 * mode of simply disabling all animation.
 *
 * This is also the switch to check first if motion appears "broken" on a
 * machine: Windows turns reduce-motion on with Settings → Accessibility →
 * Visual effects → Animation effects, and macOS under Accessibility → Display.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
