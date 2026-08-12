'use client';

import { cn } from '@/lib/utils';

/**
 * The iOS activity indicator — twelve tapered spokes at descending opacity,
 * stepped round in discrete frames.
 *
 * Deliberately not a spinning arc. The stepped rotation and the fixed opacity
 * ramp are what the eye recognises as the iOS spinner; a smoothly rotating
 * border-arc is the generic web version and reads as "loading webpage" rather
 * than "app is working".
 */
export default function IOSSpinner({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const spokes = Array.from({ length: 12 });

  return (
    <div
      className={cn('relative inline-block', className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      {spokes.map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full bg-label-secondary"
          style={{
            width: size * 0.1,
            height: size * 0.27,
            // Rotate each spoke into place, then push it out along its own axis
            // so the tails all point at the centre.
            transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(${-size * 0.34}px)`,
            // Staggered negative delays make one lap of the fade read as rotation.
            animation: `ios-spinner-fade 1s linear ${(i * 1) / 12 - 1}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes ios-spinner-fade {
          0%   { opacity: 1; }
          100% { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
