"use client";

/**
 * CountUp — animates a number from 0 to `to` on mount, formatting each frame,
 * so KPI values feel alive on load. Respects prefers-reduced-motion (jumps
 * straight to the value).
 */

import { useEffect, useRef, useState } from "react";

export function CountUp({
  to,
  format = (n) => String(Math.round(n)),
  duration = 900,
}: {
  to: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [val, setVal] = useState(to);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(to)) {
      setVal(to);
      return;
    }
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(to * ease(p));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    setVal(0);
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [to, duration]);

  return <>{format(val)}</>;
}
