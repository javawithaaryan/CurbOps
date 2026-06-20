'use client';

// ---------------------------------------------------------------------------
// CausaFlow AI — lib/dashboard/useCountUp.ts
// Smooth count-up animation hook for the "congestion recovered" counter.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

export function useCountUp(
  target: number,
  { duration = 900, decimals = 0 }: { duration?: number; decimals?: number } = {}
): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number(target) || 0;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = from + (to - from) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
}
