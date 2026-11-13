import type { Candle, Timeframe } from '@/types';
import type { MarketTick } from '@/lib/marketData';

const TIMEFRAME_MILLISECONDS: Record<Timeframe, number> = {
  '1M': 60_000,
  '3M': 3 * 60_000,
  '5M': 5 * 60_000,
  '15M': 15 * 60_000,
  '30M': 30 * 60_000,
  '1H': 60 * 60_000,
  '1D': 24 * 60 * 60_000,
  '1W': 7 * 24 * 60 * 60_000,
  '60D': 24 * 60 * 60_000,
};

export function aggregateTicksToCandles(
  ticks: MarketTick[],
  timeframe: Timeframe,
  maxCandles = 120
): Candle[] {
  const interval = TIMEFRAME_MILLISECONDS[timeframe];
  const candlesByStart = new Map<number, Candle>();
  const orderedTicks = ticks
    .filter((tick) => Number.isFinite(tick.timestamp) && Number.isFinite(tick.price) && tick.price > 0)
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp);

  for (const tick of orderedTicks) {
    const start = Math.floor(tick.timestamp / interval) * interval;
    const candle = candlesByStart.get(start);

    if (candle) {
      candle.high = Math.max(candle.high, tick.price);
      candle.low = Math.min(candle.low, tick.price);
      candle.close = tick.price;
      continue;
    }

    candlesByStart.set(start, {
      time: start,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
    });
  }

  return Array.from(candlesByStart.values()).slice(-maxCandles);
}
