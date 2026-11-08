import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Returns a value that ticks on an interval. Useful for driving "live" UI updates.
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedRef = useRef(callback);
  useEffect(() => {
    savedRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Random-walk price simulator. Returns an array of current prices indexed by the
 * provided symbols, updated on an interval. Seeds are stable per symbol.
 */
export function useLivePrices(
  seeds: Record<string, number>,
  delay = 2000
): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>(seeds);
  const seedsRef = useRef(seeds);
  seedsRef.current = seeds;

  const tick = useCallback(() => {
    setPrices((prev) => {
      const next: Record<string, number> = {};
      for (const [sym, seed] of Object.entries(seedsRef.current)) {
        const cur = prev[sym] ?? seed;
        // gentle random walk within +/- 0.18%
        const delta = (Math.random() - 0.5) * 0.0036 * cur;
        next[sym] = Math.round((cur + delta) * 100) / 100;
      }
      return next;
    });
  }, []);

  useInterval(tick, delay);
  return prices;
}
