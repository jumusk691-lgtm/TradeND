import { Search, Plus, Check, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { INSTRUMENTS } from '@/data/instruments';
import { fmtNum, fmtPct } from '@/lib/format';
import type { Exchange, MarketInstrument } from '@/types';

interface MarketTableProps {
  livePrices: Record<string, number>;
  selected: string;
  onSelect: (symbol: string) => void;
  watchlist: string[];
  onToggleWatch: (symbol: string) => void;
}

const EX_FILTERS: (Exchange | 'ALL')[] = ['ALL', 'NSE', 'BSE', 'MCX'];

export function MarketTable({
  livePrices,
  selected,
  onSelect,
  watchlist,
  onToggleWatch,
}: MarketTableProps) {
  const [query, setQuery] = useState('');
  const [exFilter, setExFilter] = useState<Exchange | 'ALL'>('ALL');

  const rows = useMemo(() => {
    return INSTRUMENTS.filter((i) => {
      if (exFilter !== 'ALL' && i.exchange !== exFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!i.symbol.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q))
          return false;
      }
      return true;
    }).map((i) => ({
      ...i,
      livePrice: livePrices[i.symbol] ?? i.price,
    }));
  }, [query, exFilter, livePrices]);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 border-b border-white/5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Markets
          </h3>
          <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
            {EX_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setExFilter(f)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exFilter === f
                    ? 'bg-accent text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Nifty, Reliance, Gold..."
            className="w-full rounded-lg border border-white/5 bg-black/40 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[460px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#0a0a0c] text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Symbol</th>
              <th className="px-3 py-2 text-right font-semibold">LTP</th>
              <th className="px-3 py-2 text-right font-semibold">Chg%</th>
              <th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">High</th>
              <th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">Low</th>
              <th className="px-2 py-2 text-center font-semibold">★</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: MarketInstrument & { livePrice: number }) => {
              // recompute change relative to prevClose using live price
              const chgAbs = r.livePrice - r.prevClose;
              const chgPct = (chgAbs / r.prevClose) * 100;
              const isUp = chgAbs >= 0;
              const isSel = selected === r.symbol;
              const isWatched = watchlist.includes(r.symbol);
              return (
                <tr
                  key={r.symbol}
                  onClick={() => onSelect(r.symbol)}
                  className={`cursor-pointer border-t border-white/[0.03] transition-colors ${
                    isSel ? 'bg-accent/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          isUp ? 'bg-emerald-400' : 'bg-rose-400'
                        }`}
                      />
                      <div>
                        <div className="font-semibold text-white text-[13px]">{r.symbol}</div>
                        <div className="text-[11px] text-gray-500">
                          {r.exchange} · {r.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-white">
                    {fmtNum(r.livePrice)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono font-medium ${
                      isUp ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isUp ? '▲' : '▼'} {fmtPct(chgPct)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-400 hidden sm:table-cell">
                    {fmtNum(r.high)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-400 hidden sm:table-cell">
                    {fmtNum(r.low)}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWatch(r.symbol);
                      }}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                        isWatched
                          ? 'text-gold hover:bg-gold/10'
                          : 'text-gray-600 hover:text-gray-300 hover:bg-white/5'
                      }`}
                      aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
                    >
                      {isWatched ? (
                        <Star className="h-4 w-4 fill-gold" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  No instruments match "{query}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* footer hint */}
      <div className="flex items-center justify-between px-4 py-2 text-[11px] text-gray-500 border-t border-white/5">
        <span className="flex items-center gap-1">
          <Check className="h-3 w-3 text-accent" /> Live · simulated feed
        </span>
        <span>{rows.length} instruments</span>
      </div>
    </div>
  );
}
