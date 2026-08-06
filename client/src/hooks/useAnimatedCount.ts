import { useEffect, useState } from "react";

export function useAnimatedCount(target: number, play: boolean): number {
  const [n, setN] = useState(() => (play ? 0 : target));

  useEffect(() => {
    if (!play) {
      setN(target);
      return;
    }
    setN(0);
    const started = performance.now();
    const from = 0;
    const dur = 520;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - started) / dur);
      const eased = 1 - (1 - p) ** 2;
      setN(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, play]);

  return n;
}
