import { X, TrendingUp, TrendingDown, Inbox } from 'lucide-react';
import { fmtINR, fmtNum, fmtPct } from '@/lib/format';
import { calculatePositionPnl } from '@/lib/trading';
import type { Position } from '@/types';

interface PositionsPanelProps {
  positions: Position[];
  livePrices: Record<string, number>;
  onClose: (id: string) => void;
}

export function PositionsPanel({ positions, livePrices, onClose }: PositionsPanelProps) {
  const enriched = positions.map((p) => {
    const cur = livePrices[p.symbol] ?? p.currentPrice;
    const pnl = calculatePositionPnl(p, cur);
    const pnlPct = p.entryPrice > 0
      ? (pnl / Math.max(1, p.margin)) * 100
      : 0;
    return { ...p, currentPrice: cur, pnl, pnlPct };
  });

  const totalPnl = enriched.reduce((s, p) => s + p.pnl, 0);
  const totalMargin = enriched.reduce((s, p) => s + p.margin, 0);

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
          Open Positions
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-400">
            {positions.length}
          </span>
        </h3>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Total P&amp;L</div>
          <div
            className={`font-mono text-sm font-bold ${
              totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalPnl >= 0 ? '+' : ''}
            {fmtINR(totalPnl)}
          </div>
        </div>
      </div>

      {enriched.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
          <Inbox className="h-8 w-8 text-gray-700 mb-2" />
          <p className="text-sm text-gray-500">No open positions.</p>
          <p className="text-xs text-gray-600 mt-1">
            Place a trade from the order panel to open a position.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin">
          {enriched.map((p) => {
            const up = p.pnl >= 0;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-white/5 bg-black/30 p-3 transition-colors hover:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        p.side === 'BUY'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {p.side === 'BUY' ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {p.symbol}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            p.side === 'BUY'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {p.side}
                        </span>
                        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">
                          {p.leverage}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {p.qty} @ {fmtNum(p.entryPrice)} · Margin {fmtINR(p.margin)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onClose(p.id)}
                    className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                    aria-label="Close position"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
                  <Cell label="LTP" value={fmtNum(p.currentPrice)} />
                  <Cell label="P&L" value={`${up ? '+' : ''}${fmtINR(p.pnl)}`} tone={up ? 'up' : 'down'} />
                  <Cell
                    label="Return"
                    value={fmtPct(p.pnlPct)}
                    tone={up ? 'up' : 'down'}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {enriched.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-xs">
          <span className="text-gray-500">Used Margin</span>
          <span className="font-mono text-white">{fmtINR(totalMargin)}</span>
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'neutral';
}) {
  const color =
    tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : 'text-white';
  return (
    <div className="rounded-lg bg-black/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-600">{label}</div>
      <div className={`font-mono font-semibold ${color}`}>{value}</div>
    </div>
  );
}
