import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  History,
  Inbox,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { fmtINR, fmtNum, fmtPct } from '@/lib/format';
import {
  calculateCappedPnl,
  calculateReturnOnMargin,
  getContractMultiplier,
  roundCurrency,
} from '@/lib/tradingMath';
import type { Position, TradeHistoryEntry } from '@/types';

interface PositionsPanelProps {
  positions: Position[];
  history: TradeHistoryEntry[];
  historyLoading?: boolean;
  historyError?: string | null;
  livePrices: Record<string, number>;
  onClose: (id: string, exitPrice: number) => Promise<void>;
  onCloseAll: (closePrices: Record<string, number>) => Promise<void>;
}

export function PositionsPanel({
  positions,
  history,
  historyLoading = false,
  historyError = null,
  livePrices,
  onClose,
  onCloseAll,
}: PositionsPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(50);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enriched = positions.map((position) => {
    const livePrice = Number(livePrices[position.symbol]);
    const currentPrice = Number.isFinite(livePrice) && livePrice > 0
      ? livePrice
      : position.currentPrice;
    const contractMultiplier = position.contractMultiplier ?? getContractMultiplier(position.symbol);
    const pnl = calculateCappedPnl({ ...position, contractMultiplier }, currentPrice);
    return {
      ...position,
      currentPrice,
      pnl,
      pnlPct: calculateReturnOnMargin(pnl, position.margin),
    };
  });

  const totalPnl = roundCurrency(enriched.reduce((total, position) => total + position.pnl, 0));
  const totalMargin = roundCurrency(enriched.reduce((total, position) => total + position.margin, 0));
  const isBusy = closingId !== null || closingAll;
  const visibleHistory = history.slice(0, visibleHistoryCount);
  const remainingHistoryCount = history.length - visibleHistory.length;

  async function handleExit(position: (typeof enriched)[number]) {
    setError(null);
    setClosingId(position.id);
    try {
      await onClose(position.id, position.currentPrice);
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Unable to exit this position.');
    } finally {
      setClosingId(null);
    }
  }

  async function handleExitAll() {
    setError(null);
    setClosingAll(true);
    try {
      const closePrices = Object.fromEntries(
        enriched.map((position) => [position.symbol, position.currentPrice])
      );
      await onCloseAll(closePrices);
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Unable to exit all positions.');
    } finally {
      setClosingAll(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="open-positions-title">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="open-positions-title" className="font-display text-lg font-bold text-white flex items-center gap-2">
            Open Positions
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-400">
              {positions.length}
            </span>
          </h3>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-gray-500">Total P&amp;L</div>
          <div className={`font-mono text-sm font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalPnl >= 0 ? '+' : ''}{fmtINR(totalPnl)}
          </div>
        </div>

        {positions.length > 0 && (
          <button
            type="button"
            onClick={() => void handleExitAll()}
            disabled={isBusy}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {closingAll ? 'Exiting all…' : 'Exit All'}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      {enriched.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <Inbox className="mb-2 h-8 w-8 text-gray-700" aria-hidden="true" />
          <p className="text-sm text-gray-500">No open positions.</p>
          <p className="mt-1 text-xs text-gray-600">Place a trade from the order panel to open a position.</p>
        </div>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto scrollbar-thin">
          {enriched.map((position) => {
            const up = position.pnl >= 0;
            return (
              <article key={position.id} className="rounded-xl border border-white/5 bg-black/30 p-3 transition-colors hover:border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${position.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {position.side === 'BUY'
                        ? <TrendingUp className="h-4 w-4" aria-hidden="true" />
                        : <TrendingDown className="h-4 w-4" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">{position.symbol}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${position.side === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                          {position.side}
                        </span>
                        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">{position.leverage}</span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {position.qty.toLocaleString('en-IN')} @ {fmtNum(position.entryPrice)} · Margin {fmtINR(position.margin)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleExit(position)}
                    disabled={isBusy}
                    className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 text-xs font-semibold text-gray-300 transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Exit ${position.side.toLowerCase()} position in ${position.symbol}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {closingId === position.id ? 'Exiting…' : 'Exit'}
                  </button>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
                  <Cell label="LTP" value={fmtNum(position.currentPrice)} />
                  <Cell label="P&L" value={`${up ? '+' : ''}${fmtINR(position.pnl)}`} tone={up ? 'up' : 'down'} />
                  <Cell label="Return on margin" value={fmtPct(position.pnlPct)} tone={up ? 'up' : 'down'} />
                </div>
              </article>
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

      <div className="mt-4 border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          aria-controls="trade-history-list"
          className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-sm font-semibold text-gray-200 transition-colors hover:text-white"
        >
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-gold" aria-hidden="true" />
            Trade history
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-gray-400">{history.length}</span>
          </span>
          {historyOpen
            ? <ChevronUp className="h-4 w-4 text-gray-500" aria-hidden="true" />
            : <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />}
        </button>

        {historyOpen && (
          <div id="trade-history-list" className="mt-2 max-h-[360px] space-y-2 overflow-y-auto scrollbar-thin">
            {historyError && (
              <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                Could not sync trade history from Firebase: {historyError}
              </p>
            )}
            {history.length === 0 ? (
              historyLoading ? (
                <p role="status" className="rounded-xl border border-white/5 px-4 py-6 text-center text-xs text-gray-400">
                  Loading all trade history from Firebase…
                </p>
              ) : historyError ? null : (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-gray-500">
                  Closed trades will appear here with their buy/sell prices and realized P&amp;L.
                </p>
              )
            ) : (
              <>
                {visibleHistory.map((trade) => {
                  const profitable = trade.realizedPnl >= 0;
                  return (
                    <article key={trade.id} className="rounded-xl border border-white/5 bg-black/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-white">{trade.symbol}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${trade.side === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                              {trade.side}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-gray-500">
                            {trade.qty.toLocaleString('en-IN')} units · {trade.closedAt > 0 ? new Date(trade.closedAt).toLocaleString() : 'Date unavailable'}
                          </p>
                        </div>
                        <span className={`shrink-0 font-mono text-sm font-semibold ${profitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {profitable ? '+' : ''}{fmtINR(trade.realizedPnl)}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <Cell label="Buy price" value={fmtNum(trade.buyPrice)} />
                        <Cell label="Sell price" value={fmtNum(trade.sellPrice)} />
                      </div>
                    </article>
                  );
                })}
                {remainingHistoryCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setVisibleHistoryCount((count) => Math.min(history.length, count + 50))}
                    className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-gold/40 hover:text-white"
                  >
                    Load 50 more · {remainingHistoryCount} remaining
                  </button>
                )}
                <p className="text-center text-[11px] text-gray-600">
                  Showing {visibleHistory.length} of {history.length} trades
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
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
  const color = tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : 'text-white';
  return (
    <div className="rounded-lg bg-black/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-600">{label}</div>
      <div className={`font-mono font-semibold ${color}`}>{value}</div>
    </div>
  );
}
