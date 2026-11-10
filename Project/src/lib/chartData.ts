import type { Candle, Timeframe } from '@/types';

// Deterministic pseudo-random generator so charts look stable per symbol/timeframe.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CANDLE_COUNT: Record<Timeframe, number> = {
  '1M': 500,
  '3M': 500,
  '5M': 500,
  '15M': 500,
  '30M': 500,
  '1H': 500,
  '1D': 500,
  '1W': 500,
  '60D': 60,
};

const STEP_VOL: Record<Timeframe, number> = {
  '1M': 0.0009,
  '3M': 0.0015,
  '5M': 0.0022,
  '15M': 0.004,
  '30M': 0.006,
  '1H': 0.009,
  '1D': 0.016,
  '1W': 0.03,
  '60D': 0.016,
};

const TF_MINUTES: Record<Timeframe, number> = {
  '1M': 1,
  '3M': 3,
  '5M': 5,
  '15M': 15,
  '30M': 30,
  '1H': 60,
  '1D': 1440,
  '1W': 10080,
  '60D': 1440,
};

export function generateCandles(
  symbol: string,
  timeframe: Timeframe,
  basePrice: number
): Candle[] {
  const count = CANDLE_COUNT[timeframe];
  const vol = STEP_VOL[timeframe];
  const stepMs = TF_MINUTES[timeframe] * 60 * 1000;
  const now = Date.now();
  const start = now - stepMs * count;

  const rng = mulberry32(hashStr(symbol + timeframe));
  const candles: Candle[] = [];

  let prevClose = basePrice * (1 - (rng() - 0.5) * 0.04);

  for (let i = 0; i < count; i++) {
    const drift = (rng() - 0.5) * 2 * vol * basePrice;
    const open = prevClose;
    const close = open + drift;
    const wickUp = Math.abs(rng() - 0.5) * vol * basePrice * 1.6;
    const wickDn = Math.abs(rng() - 0.5) * vol * basePrice * 1.6;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDn;
    candles.push({
      time: start + i * stepMs,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
    });
    prevClose = close;
  }

  // Force last candle close to the live price for consistency.
  if (candles.length) {
    candles[candles.length - 1].close = round2(basePrice);
    candles[candles.length - 1].high = Math.max(
      candles[candles.length - 1].high,
      basePrice
    );
  }
  return candles;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Animate the latest candle's close toward a new live price (in place). */
export function tickCandles(candles: Candle[], newPrice: number): Candle[] {
  if (candles.length === 0) return candles;
  const next = candles.slice();
  const last = { ...next[next.length - 1] };
  last.close = round2(newPrice);
  last.high = Math.max(last.high, newPrice);
  last.low = Math.min(last.low, newPrice);
  next[next.length - 1] = last;
  return next;
}
