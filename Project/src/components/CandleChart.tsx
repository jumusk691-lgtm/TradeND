import { useEffect, useMemo, useState } from 'react';
import { aggregateTicksToCandles } from '@/lib/chartData';
import { fmtNum } from '@/lib/format';
import type { MarketTick } from '@/lib/marketData';
import { TIMEFRAMES, type Candle, type Timeframe } from '@/types';

interface CandleChartProps {
  symbol: string;
  basePrice: number;
  livePrice: number;
  ticks: MarketTick[];
  connected: boolean;
}

export function CandleChart({
  symbol,
  basePrice,
  livePrice,
  ticks,
  connected,
}: CandleChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('15M');
  const [hover, setHover] = useState<Candle | null>(null);
  const candles = useMemo(
    () => aggregateTicksToCandles(ticks, timeframe),
    [ticks, timeframe]
  );

  useEffect(() => {
    setHover(null);
  }, [symbol, timeframe]);

  // Layout constants
  const W = 760;
  const H = 360;
  const padR = 62;
  const padB = 28;
  const padT = 12;
  const padL = 8;
  const chartW = W - padR - padL;
  const chartH = H - padB - padT;

  const { min, max } = useMemo(() => {
    if (candles.length === 0) {
      const anchor = livePrice > 0 ? livePrice : basePrice > 0 ? basePrice : 1;
      const padding = Math.max(Math.abs(anchor) * 0.005, 0.01);
      return { min: anchor - padding, max: anchor + padding };
    }

    const lo = Math.min(...candles.map((candle) => candle.low));
    const hi = Math.max(...candles.map((candle) => candle.high));
    const padding = Math.max((hi - lo) * 0.08, Math.abs(hi) * 0.002, 0.01);
    return { min: lo - padding, max: hi + padding };
  }, [candles, basePrice, livePrice]);

  const range = max - min || 1;
  const n = Math.max(candles.length, 1);
  const slot = chartW / n;
  const bodyW = Math.max(2, slot * 0.62);

  const y = (price: number) => padT + chartH - ((price - min) / range) * chartH;
  const x = (i: number) => padL + i * slot + slot / 2;

  // Gridlines (5 horizontal)
  const gridLines = useMemo(() => {
    const lines: { y: number; price: number }[] = [];
    for (let i = 0; i <= 4; i++) {
      const price = min + (range * i) / 4;
      lines.push({ y: y(price), price });
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, range]);

  const chartClose = candles.length ? candles[candles.length - 1].close : 0;
  const lastPrice = livePrice > 0 ? livePrice : chartClose;
  const firstPrice = candles.length ? candles[0].close : lastPrice;
  const sessionChange = firstPrice > 0 ? lastPrice - firstPrice : 0;
  const sessionChangePct = firstPrice > 0 ? (sessionChange / firstPrice) * 100 : 0;
  const up = sessionChange >= 0;
  const hasPrice = lastPrice > 0;

  // Area path under close line for subtle fill
  const areaPath = useMemo(() => {
    if (!candles.length) return '';
    let d = `M ${x(0)} ${y(candles[0].close)}`;
    for (let i = 1; i < candles.length; i++) {
      d += ` L ${x(i)} ${y(candles[i].close)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, min, max]);

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-lg font-bold text-white">{symbol}</h3>
          <span
            className={`font-mono text-sm ${hasPrice ? up ? 'text-emerald-400' : 'text-rose-400' : 'text-gray-500'}`}
          >
            {hasPrice ? fmtNum(lastPrice) : '—'}
          </span>
          {candles.length > 0 && (
            <span
              className={`text-xs font-medium ${up ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {up ? '▲' : '▼'} {fmtNum(Math.abs(sessionChange))} (
              {sessionChangePct >= 0 ? '+' : ''}
              {sessionChangePct.toFixed(2)}%)
            </span>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] ${connected && hasPrice ? 'text-emerald-400' : 'text-amber-300'}`} role="status" aria-live="polite">
          <span className={`h-1.5 w-1.5 rounded-full ${connected && hasPrice ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'}`} />
          {connected && hasPrice ? 'Live stream' : connected ? 'Waiting for ticks' : 'Reconnecting'}
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              title={`${tf} candles aggregated from live ticks`}
              aria-label={`Show ${tf} live candles`}
              aria-pressed={timeframe === tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                timeframe === tf
                  ? 'bg-accent text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Live ${timeframe} candlestick chart for ${symbol}`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines + price axis */}
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={g.y}
                x2={padL + chartW}
                y2={g.y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
              <text
                x={padL + chartW + 6}
                y={g.y + 3}
                fill="rgba(255,255,255,0.45)"
                fontSize={10}
                fontFamily="JetBrains Mono, monospace"
              >
                {fmtNum(g.price)}
              </text>
            </g>
          ))}

          {candles.length > 0 && (
            <>
              {/* Area fill */}
              <path
                d={`${areaPath} L ${x(n - 1)} ${padT + chartH} L ${x(0)} ${padT + chartH} Z`}
                fill={up ? 'rgba(16,185,129,0.07)' : 'rgba(244,63,94,0.07)'}
              />
              <path
                d={areaPath}
                fill="none"
                stroke={up ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)'}
                strokeWidth={1}
              />
            </>
          )}

          {/* Candles */}
          {candles.map((c, i) => {
            const cx = x(i);
            const isUp = c.close >= c.open;
            const color = isUp ? '#10b981' : '#f43f5e';
            const yO = y(c.open);
            const yC = y(c.close);
            const top = Math.min(yO, yC);
            const h = Math.max(1, Math.abs(yC - yO));
            return (
              <g
                key={i}
                onMouseEnter={() => setHover(c)}
              >
                {/* hover highlight */}
                <rect
                  x={cx - slot / 2}
                  y={padT}
                  width={slot}
                  height={chartH}
                  fill={hover === c ? 'rgba(255,255,255,0.03)' : 'transparent'}
                />
                {/* wick */}
                <line
                  x1={cx}
                  y1={y(c.high)}
                  x2={cx}
                  y2={y(c.low)}
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.9}
                />
                {/* body */}
                <rect
                  x={cx - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={h}
                  fill={color}
                  rx={0.5}
                />
              </g>
            );
          })}

          {hasPrice && (
            <>
              {/* Live price line */}
              <line
                x1={padL}
                y1={y(lastPrice)}
                x2={padL + chartW}
                y2={y(lastPrice)}
                stroke={up ? '#10b981' : '#f43f5e'}
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.6}
              />
              <rect
                x={padL + chartW + 2}
                y={y(lastPrice) - 8}
                width={padR - 4}
                height={16}
                rx={3}
                fill={up ? '#10b981' : '#f43f5e'}
              />
              <text
                x={padL + chartW + 6}
                y={y(lastPrice) + 3}
                fill="#000"
                fontSize={9}
                fontWeight={600}
                fontFamily="JetBrains Mono, monospace"
              >
                {fmtNum(lastPrice)}
              </text>
            </>
          )}
        </svg>

        {candles.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-xs text-gray-500" role="status" aria-live="polite">
            {connected ? 'Waiting for live ticks to build candles…' : 'Connecting to the live market feed…'}
          </div>
        )}

        {/* Hover tooltip */}
        {hover && (
          <div className="pointer-events-none absolute top-2 left-2 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-[11px] font-mono backdrop-blur">
            <div className="flex gap-3 text-gray-300">
              <span>O <span className="text-white">{fmtNum(hover.open)}</span></span>
              <span>H <span className="text-emerald-400">{fmtNum(hover.high)}</span></span>
              <span>L <span className="text-rose-400">{fmtNum(hover.low)}</span></span>
              <span>C <span className="text-white">{fmtNum(hover.close)}</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
